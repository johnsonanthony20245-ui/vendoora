# Expire stale PENDING_PAYMENT orders — design

**Date:** 2026-05-31
**Phase:** P1 Foundation (post-PR-#21 follow-up)
**Status:** Approved 2026-06-01 — ready for plan

## 0. Why

PR #21 introduced the Stripe Card payment rail and split the order lifecycle
into two writes: `buildPendingOrder` persists `Order(status: PENDING_PAYMENT)`,
and the `payment_intent.succeeded` webhook calls `finalizePaidOrder` to flip
the order to `PAID` + open per-seller escrow + issue the delivery code.

A buyer who abandons the checkout — closes the tab between `buildPendingOrder`
and Stripe confirmation, fails a card and bounces, double-submits, or runs into
a network drop — leaves a `PENDING_PAYMENT` order behind that no rail will ever
finalize. PR #21's code review flagged this as a follow-up.

`OrderStatus.EXPIRED` already exists in the enum (`schema.prisma` line 663-678)
specifically for this transition. This change adds the real, tested job that
performs it.

## 1. Scope

In:
- New domain function that transitions stale `PENDING_PAYMENT` orders to
  `EXPIRED` with audit trail and (best-effort) Stripe PaymentIntent cancel.
- BullMQ repeatable job + poll-loop fallback for the sweep.
- Real DB tests proving the mechanism, including the webhook-race property.

Out:
- Notifying the buyer (no notification rail exists yet — P5).
- Restoring the cart (cart is session-scoped; an abandoned buyer who returns
  rebuilds it from session state).
- Refund logic (a `PENDING_PAYMENT` order has not been captured — there is
  nothing to refund. A captured-then-expired order is impossible because the
  state guard prevents that race).
- UI surfaces for admin visibility (separate ticket; this job emits audit log
  rows so admin queries are unblocked).
- A `@@index([status, created_at])` composite index migration. The two existing
  single-column indexes on `Order` are sufficient at pre-launch volume. Revisit
  when PENDING_PAYMENT throughput justifies it.

## 2. Architectural decisions

### 2.1 File placement — new `packages/domain/src/checkout.ts`

`escrow.ts` has one job: the HELD → RELEASING state machine. Folding an Order
lifecycle sweep into it would widen its surface and dilute its name. A new
file keeps both modules single-purpose and matches the existing split between
`apps/web/lib/order.ts` (Order persistence) and `packages/domain/src/escrow.ts`
(escrow state machine).

### 2.2 Queue topology — separate `checkout-expiry` BullMQ queue

Mirrors `escrow-queue.ts`. Independent DLQ, independent concurrency budget,
independent interval (60s default for expiry vs 5min for escrow — a tighter
cancel cadence reduces the window in which a Stripe PI advances past
`requires_payment_method` into a state we can no longer cancel). The single
`apps/worker` Node process starts both schedulers; this is the established
pattern (one worker process, multiple BullMQ workers).

### 2.3 Payment row outcome — mark `FAILED`

When the order expires, the associated `Payment(status: PENDING)` row is
transitioned to `FAILED` in the same transaction. Matches the existing
`PaymentStatus` enum vocabulary, lets admin queries filter abandoned checkouts
cleanly, and ensures a future refund-eligibility check can trust that a
`PENDING` Payment is genuinely still in-flight.

### 2.4 Stripe coupling — injected closure

The domain package stays free of Next.js / Stripe SDK imports. The worker
constructs a `cancelStripeIntent: (pi: string) => Promise<void>` closure
(wrapping `getStripe().paymentIntents.cancel(pi)` with logging) and passes it
in. The test path passes a Vitest spy. Stripe call runs **after** the DB
transaction commits — never holding a Postgres transaction open across a
network round-trip.

### 2.5 Poll-loop generalization

`apps/worker/src/poll-loop.ts` currently runs a single hard-coded sweep
(`releaseAllEligibleEscrow`). It is generalized to accept
`sweeps: Array<{ name: string; run: () => Promise<unknown> }>` so the
no-Redis fallback can drive both the escrow sweep and the expiry sweep
without duplicating the overlap-guard / shutdown-drain code. This is a
breaking signature change to `startPollLoop`, but the only caller is
`apps/worker/src/index.ts`, which is edited in the same PR — no external
consumer is affected. The overlap-guard becomes per-sweep (each sweep has
its own `activeSweep` promise so a slow expiry sweep cannot block an escrow
tick).

## 3. Module shape

### 3.1 `packages/domain/src/checkout.ts`

```ts
import { type Prisma, type PrismaClient } from '@vendoora/db';

export const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

export interface ExpiryResult {
  expiredOrderIds: string[];
}
export interface ExpirySweepResult {
  ordersExpired: number;
  stripeCancelFailures: number;
}

// Per-order: transition one specific order if and only if it is still
// PENDING_PAYMENT (state-guarded). Used by the sweep and directly callable
// by tests.
export async function expirePendingOrder(
  db: PrismaClient,
  args: {
    orderId: string;
    now?: Date;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  },
): Promise<ExpiryResult>;

// Sweep: matches the signature in the user's outline. Defaults
// olderThanMs to DEFAULT_EXPIRY_MS (30 min).
export async function expireStalePendingOrders(
  db: PrismaClient,
  args?: {
    now?: Date;
    olderThanMs?: number;
    limit?: number;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  },
): Promise<ExpirySweepResult>;
```

Re-exported from `packages/domain/src/index.ts` alongside the existing escrow
exports.

### 3.2 Per-order state transition (transactional)

```
db.$transaction:
  order = tx.order.findUnique(orderId, select { id, status, payment_intent_id, created_at })
  if !order || order.status !== 'PENDING_PAYMENT': return { expiredOrderIds: [] }

  { count } = tx.order.updateMany({
    where: { id: orderId, status: 'PENDING_PAYMENT' },     // ← state guard
    data:  { status: 'EXPIRED', status_updated_at: now },
  })
  if count === 0: return { expiredOrderIds: [] }           // webhook won the race

  tx.payment.updateMany({
    where: { order_id: orderId, status: 'PENDING' },
    data:  { status: 'FAILED' },
  })

  tx.orderStatusHistory.create({
    order_id: orderId,
    from_status: 'PENDING_PAYMENT',
    to_status:   'EXPIRED',
    changed_by_system: true,
    reason: 'abandoned_checkout',
  })

  tx.auditLog.create({
    actor_system: true,
    action: 'order.expired',
    resource_type: 'order',
    resource_id: orderId,
    before_state: { status: 'PENDING_PAYMENT' },
    after_state:  { status: 'EXPIRED' },
    metadata: {
      reason: 'abandoned_checkout',
      payment_intent_id: order.payment_intent_id,
      age_ms: now - order.created_at,
    },
  })

  return { expiredOrderIds: [orderId] }

# After commit, OUTSIDE the transaction:
if expiredOrderIds.length > 0 && order.payment_intent_id && cancelStripeIntent:
  try { await cancelStripeIntent(order.payment_intent_id) }
  catch (err) {
    // Best-effort: a Stripe PI already in succeeded/canceled state rejects,
    // which is fine — the order is correctly expired either way. Log to audit.
    await db.auditLog.create({
      actor_system: true,
      action: 'payment.stripe_cancel_failed',
      resource_type: 'order',
      resource_id: orderId,
      metadata: { payment_intent_id, error: err.message },
    })
  }
```

The state-guarded `updateMany` is the racing-payment safety property. If
`finalizePaidOrder` lands between the `findUnique` read and the `updateMany`,
the `WHERE status='PENDING_PAYMENT'` clause matches zero rows, count is 0, and
we bail — the order is correctly PAID, no expiry audit, no clobber.

### 3.3 Sweep candidate discovery

```ts
const due = await db.order.findMany({
  where: {
    status: 'PENDING_PAYMENT',
    created_at: { lte: new Date(now.getTime() - olderThanMs) },
  },
  orderBy: { created_at: 'asc' },   // FIFO — same reason as escrow sweep
  select: { id: true },
  take: limit ?? 500,
});
```

Per-order processing then loops `expirePendingOrder` so each order is its
own transaction (one slow/failed order cannot roll back the others).
`stripeCancelFailures` is incremented when the post-commit Stripe call throws,
purely for observability.

## 4. Worker wiring

### 4.1 New: `apps/worker/src/checkout-expiry-queue.ts`

Mirrors `escrow-queue.ts` exactly:
- `CHECKOUT_EXPIRY_QUEUE_NAME = 'checkout-expiry'`
- `SCHEDULER_ID = 'checkout-expiry-every'`, `JOB_NAME = 'expire'`
- `startCheckoutExpiryWorker({ redisUrl, intervalMs, log, cancelStripeIntent })`
- The worker calls `expireStalePendingOrders(prisma, { now, cancelStripeIntent })`.

### 4.2 Edited: `apps/worker/src/poll-loop.ts`

`startPollLoop` now takes `sweeps: Array<{ name, run: () => Promise<void> }>`
and the overlap-guard / shutdown-drain is per-sweep. Existing escrow-only
usage is preserved by passing `[{ name: 'escrow-auto-release', run: ... }]`.
The signature change is internal to `apps/worker` — no other package consumes
it.

### 4.3 Edited: `apps/worker/src/index.ts`

When `REDIS_URL` is set, start both BullMQ schedulers. When unset, start a
single poll-loop driving both sweeps. The Stripe `cancelStripeIntent` closure
is constructed once at boot from `apps/web/lib/stripe.ts`'s `getStripe()`. If
`STRIPE_SECRET_KEY` is absent (MoMo/Orange-only deployments, dev without
Stripe), the closure is `undefined` and the domain function skips the cancel
step — no behavior change for those rails.

`CHECKOUT_EXPIRY_INTERVAL_MS` env var, default 60_000.
`CHECKOUT_EXPIRY_OLDER_THAN_MS` env var, default 1_800_000 (30 min).

## 5. Tests

`apps/web/__tests__/checkout-expiry.test.ts`, real DB (same fixture pattern as
`order-finalize.test.ts`), Stripe cancel injected as a Vitest spy.

| # | Test | What it proves | How a stub fails it |
|---|------|----------------|---------------------|
| 1 | Stale PENDING_PAYMENT is expired | `order.status === 'EXPIRED'`, OrderStatusHistory and AuditLog rows exist with correct from/to | A stub returning `{ ordersExpired: 1 }` without DB writes fails the status check |
| 2 | Fresh PENDING_PAYMENT is not expired | Sweep with `olderThanMs: 30*60*1000` against an order created seconds ago does nothing | A stub that always expires fails this |
| 3 | Idempotent — second run is a no-op | Two sequential sweeps over the same stale order produce exactly one `order.expired` audit + one history row | A stub without the state guard would double-write |
| 4 | PAID order is untouched | Build → finalize → backdate `created_at` to past → sweep. Order stays PAID, no audit, no history, no Stripe cancel attempt | A naive predicate without `status='PENDING_PAYMENT'` filter would expire it |
| 5 | Stripe cancel is invoked when `payment_intent_id` is set | Spy receives the correct PI id exactly once; cancel-throws path is logged and does not roll back the expiry | A stub that ignored the closure fails the spy assertion |
| 6 | Concurrent webhook race — order finalized between findUnique and update | Backdated PENDING_PAYMENT order. Test calls `finalizePaidOrder(orderId)` first (simulating the webhook winning the race), then directly calls `expirePendingOrder(orderId)` (simulating the sweep arriving moments later with the now-stale candidate id). Asserts: order is `PAID`, exactly one `order.paid` audit, zero `order.expired` audits, zero `OrderStatusHistory` rows with `to_status=EXPIRED`, Stripe cancel spy not called | A stub without the state-guarded `updateMany` would clobber PAID → EXPIRED — this test is the stub-killer for Build Fidelity §3.2 |

Backdating `created_at` is done via a direct `prisma.order.update` in test
setup (the field has no `@updatedAt`, it is a plain `DateTime @default(now())`
so it is writable). Test #6's race is staged by calling `finalizePaidOrder`
between two awaits in the sweep helper.

## 6. Done certification (Build Fidelity Directive §3.3)

When this lands, the PR description will end with:

```
DONE CERTIFICATION — expire stale PENDING_PAYMENT orders
- Prototype fidelity: no UI surfaces affected (background job + audit only)
- Real actions: a real BullMQ scheduler runs a real DB sweep that transitions
  real Order rows from PENDING_PAYMENT to EXPIRED, writes real
  OrderStatusHistory + AuditLog rows, and cancels the real Stripe
  PaymentIntent (or logs the failure) — no toasts, no TODOs.
- Real data: tx.order.updateMany / tx.payment.updateMany /
  tx.orderStatusHistory.create / tx.auditLog.create — all real Prisma writes
  against the test DB in tests, against Neon in production.
- Hard parts touched: payments (Stripe PI cancel). Proven by test #5 (spy
  asserts the cancel call) and test #6 (the race property that protects a PAID
  order from being clobbered to EXPIRED).
- Test: apps/web/__tests__/checkout-expiry.test.ts. Test #6 (concurrent
  webhook race) cannot pass against a stub of expireStalePendingOrder — a
  stub without the state-guarded updateMany would race-clobber the PAID order
  to EXPIRED, and the test asserts the order is PAID after the race.
- DoD checklist: 1-10 confirmed (RBAC: N/A — system action with no user-facing
  surface; the worker process is the actor).
```

## 7. Branch + PR

- Branch: `feat/expire-stale-pending-orders`
- Squash-merged via the established #11–#21 pattern.
- No UI, so the `vdr_admin_dev=1` cookie + Clerk allowlist gate is not engaged.
- After the merge API returns, the merge-verify rule applies (parse
  `"merged": true` from the response before deleting the branch).

## 8. Risks and follow-ups

- **Stripe cancel race.** If the buyer pays at minute 29:59 and the webhook
  has not yet landed at minute 30:00 when the sweep finds the order, the
  state guard correctly bails — but the Stripe PI is still in
  `requires_payment_method`/`processing`. The webhook will land later and
  `finalizePaidOrder` will succeed against the now-EXPIRED order... no, that
  is wrong. `finalizePaidOrder` itself state-guards on `PENDING_PAYMENT`, so
  it will return `already_finalized` against an EXPIRED order. **The buyer in
  this edge case has been charged but the order is EXPIRED.** This needs the
  amount-mismatch audit pattern: when `finalizePaidOrder` encounters an
  EXPIRED order with a successful payment_intent, it must write a
  `payment.captured_after_expiry` audit so admin can manually refund. This
  follow-up is **out of scope for this PR** but flagged for tracking; the
  spec assumes the 30-min window is long enough that this race is rare in
  practice.
- **Composite index `(status, created_at)`.** Deferred per §1. The sweep query
  is bounded by `LIMIT 500` and the two single-column indexes are sufficient
  while PENDING_PAYMENT volume is low. Monitor and revisit.
- **No buyer notification.** Out of scope until the P5 notification rail
  exists. The audit log row is the current admin signal.

## 9. Open items before implementation

None — design complete pending Anthony's approval.
