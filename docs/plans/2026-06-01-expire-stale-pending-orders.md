# Expire stale PENDING_PAYMENT orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, tested background job that transitions abandoned `Order(status: PENDING_PAYMENT)` rows to `EXPIRED` — with audit trail, failed-Payment bookkeeping, and a best-effort Stripe PaymentIntent cancel — closing the dangling-order gap PR #21's review flagged.

**Architecture:** A DOM-free, Stripe-free domain module (`packages/domain/src/checkout.ts`) owns the state-guarded transition (mirroring the existing `escrow.ts` split). The `apps/worker` process drives it on a timer — a dedicated BullMQ `checkout-expiry` queue when `REDIS_URL` is set, or the (now generalized, multi-sweep) poll-loop fallback when it is not. The domain stays Stripe-free; the worker injects a `cancelStripeIntent` closure.

**Tech Stack:** TypeScript, Prisma 6 (Postgres on host port 5434), Vitest (node env, real test DB), BullMQ, Stripe SDK v17, Turborepo + pnpm.

**Source spec:** `docs/superpowers/specs/2026-05-31-expire-stale-pending-orders-design.md` (Approved 2026-06-01).

---

## Deviation from spec (read before starting)

Spec §2.4 / §4.3 says the worker builds the `cancelStripeIntent` closure "from `apps/web/lib/stripe.ts`'s `getStripe()`." **That is not implementable as written:** `apps/worker` does not depend on `apps/web` (and must not — apps don't import apps), and the worker has no `stripe` dependency. This plan preserves the spec's *architectural intent* (domain stays Stripe-free; closure injected; cancel runs after commit) but builds a **worker-local** Stripe client instead: add `stripe` to `apps/worker`'s deps and construct the client from `STRIPE_SECRET_KEY` at boot, with the same graceful-degradation pattern (`getStripe` throws if unset → here, no key means the closure is `undefined` and the domain skips the cancel). No behavior change for MoMo/Orange-only or no-Stripe deployments.

Everything else follows the spec exactly.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/domain/src/checkout.ts` | `expirePendingOrder` (one order, state-guarded) + `expireStalePendingOrders` (sweep) + types + `DEFAULT_EXPIRY_MS`. No Next.js / Stripe imports. | Create |
| `packages/domain/src/index.ts` | Re-export the new symbols alongside escrow. | Modify |
| `apps/web/__tests__/checkout-expiry.test.ts` | Real-DB tests (6 cases incl. the webhook-race stub-killer). | Create |
| `apps/worker/src/redis-connection.ts` | Shared `connectionFromUrl` helper (extracted from `escrow-queue.ts` to DRY the two queue files). | Create |
| `apps/worker/src/escrow-queue.ts` | Use the shared `connectionFromUrl`. | Modify (import only) |
| `apps/worker/src/checkout-expiry-queue.ts` | BullMQ scheduler for the expiry sweep, mirroring `escrow-queue.ts`. | Create |
| `apps/worker/src/poll-loop.ts` | Generalize `startPollLoop` to drive `sweeps: Array<{ name; run }>` with a per-sweep overlap guard. | Modify |
| `apps/worker/src/index.ts` | Build the worker-local `cancelStripeIntent`; start both queues (BullMQ) or both sweeps (poll-loop); new env vars. | Modify |
| `apps/worker/package.json` | Add `stripe: ^17` dependency. | Modify |

---

## Task 1: RED — failing real-DB test for the expiry domain function

**Files:**
- Create: `apps/web/__tests__/checkout-expiry.test.ts`

This task writes the full test suite *before* any implementation. The suite imports `expireStalePendingOrders` / `expirePendingOrder` from `@vendoora/domain`, which do not exist yet, so the suite fails at call time ("is not a function"). That failure is the RED gate (Build_Prompt §1.3 + §4).

- [ ] **Step 1: Ensure the test DB is up and seeded**

The tests need the konah-boutique seed products (same dependency as `order-finalize.test.ts`).

Run:
```bash
pnpm db:up
pnpm db:seed
```
Expected: Postgres container healthy on 5434; seed completes (idempotent if already seeded).

- [ ] **Step 2: Write the failing test file**

Create `apps/web/__tests__/checkout-expiry.test.ts`:

```ts
/**
 * Tests for the stale-checkout expiry rail (packages/domain/src/checkout.ts):
 * expireStalePendingOrders sweeps abandoned PENDING_PAYMENT orders to EXPIRED
 * with audit + history + a FAILED Payment, and best-effort cancels the Stripe
 * PaymentIntent. expirePendingOrder is the per-order, state-guarded transition.
 *
 * The race test (#6) is the stub-killer: a stub without the state-guarded
 * updateMany would clobber a just-PAID order to EXPIRED.
 *
 * Real DB, same fixture pattern as order-finalize.test.ts. audit_log is
 * INSERT-only (DB trigger), so every audit assertion is scoped to the freshly
 * created order id — never a global count.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { buildPendingOrder, finalizePaidOrder } = await import('../lib/order');
const { expireStalePendingOrders, expirePendingOrder } = await import('@vendoora/domain');
import type { OrderDraft } from '../lib/order';

const BUYER_EMAIL = 'checkout_expiry_test@vendoora.test';
const THIRTY_ONE_MIN = 31 * 60 * 1000;

let productId = '';
let sellerId = '';
let basePrice = 0;
let commissionRate = 0;

beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { seller: { business_slug: 'konah-boutique' } },
    include: { seller: { select: { id: true, saas_commission_rate: true } } },
  });
  if (!product) throw new Error('Need konah-boutique products in test DB. Run pnpm db:seed.');
  productId = product.id;
  sellerId = product.seller.id;
  basePrice = Number(product.base_price);
  commissionRate = product.seller.saas_commission_rate;
});

beforeEach(async () => {
  const buyer = await prisma.user.findUnique({ where: { email: BUYER_EMAIL } });
  if (buyer) {
    const orders = await prisma.order.findMany({ where: { buyer_user_id: buyer.id } });
    for (const o of orders) {
      await prisma.escrowStateTransition.deleteMany({ where: { escrow_hold: { order_id: o.id } } });
      await prisma.escrowHold.deleteMany({ where: { order_id: o.id } });
      await prisma.payment.deleteMany({ where: { order_id: o.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { order_id: o.id } });
      await prisma.orderItem.deleteMany({ where: { order_id: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeDraft(): OrderDraft {
  const quantity = 2;
  const subtotal = basePrice * quantity;
  const commission_amount = Number((subtotal * commissionRate).toFixed(2));
  const seller_net = Number((subtotal - commission_amount).toFixed(2));
  return {
    cartId: 'unused-in-expiry',
    buyer: { name: 'Expiry Tester', email: BUYER_EMAIL, phone: null },
    delivery: { street: '1 Test St', city: 'Monrovia', county: 'Montserrado', country: 'LR', zone: 'sinkor', notes: null },
    paymentMethod: 'CARD',
    items: [
      {
        product_id: productId,
        variant_id: null,
        seller_id: sellerId,
        product_snapshot: { name: 'Test', slug: 'test' },
        quantity,
        unit_price: basePrice,
        subtotal,
        commission_rate: commissionRate,
        commission_amount,
        seller_net,
      },
    ],
    subtotal,
    shippingFee: 3,
    totalAmount: subtotal + 3,
    currency: 'USD',
  };
}

/** Build a PENDING_PAYMENT order and backdate created_at so the sweep sees it as stale. */
async function buildStaleOrder(ageMs = THIRTY_ONE_MIN): Promise<string> {
  const pending = await buildPendingOrder(prisma, makeDraft());
  await prisma.order.update({
    where: { id: pending.orderId },
    data: { created_at: new Date(Date.now() - ageMs) },
  });
  return pending.orderId;
}

describe('expireStalePendingOrders', () => {
  it('expires a stale PENDING_PAYMENT order with history + audit + FAILED payment', async () => {
    const orderId = await buildStaleOrder();

    const result = await expireStalePendingOrders(prisma, {});
    expect(result.ordersExpired).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('EXPIRED');

    const history = await prisma.orderStatusHistory.findFirst({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(history?.from_status).toBe('PENDING_PAYMENT');
    expect(history?.reason).toBe('abandoned_checkout');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(1);

    const payment = await prisma.payment.findUnique({ where: { order_id: orderId } });
    expect(payment?.status).toBe('FAILED');
  });

  it('does not expire a fresh PENDING_PAYMENT order', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft()); // created_at = now

    const result = await expireStalePendingOrders(prisma, { olderThanMs: 30 * 60 * 1000 });
    expect(result.ordersExpired).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PENDING_PAYMENT');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);
  });

  it('is idempotent — a second sweep over the same order is a no-op', async () => {
    const orderId = await buildStaleOrder();

    await expireStalePendingOrders(prisma, {});
    await expireStalePendingOrders(prisma, {});

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(1);

    const historyRows = await prisma.orderStatusHistory.count({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(historyRows).toBe(1);
  });

  it('leaves a PAID order untouched', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());
    await finalizePaidOrder(prisma, { orderId: pending.orderId, provider: 'stripe' });
    await prisma.order.update({
      where: { id: pending.orderId },
      data: { created_at: new Date(Date.now() - THIRTY_ONE_MIN) },
    });

    const result = await expireStalePendingOrders(prisma, {});
    expect(result.ordersExpired).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PAID');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);

    const holds = await prisma.escrowHold.count({ where: { order_id: pending.orderId } });
    expect(holds).toBe(1); // escrow from finalize is intact
  });

  it('cancels the Stripe PaymentIntent when set; logs (not rolls back) on cancel failure', async () => {
    // Happy path — spy receives the PI id exactly once.
    const okOrderId = await buildStaleOrder();
    await prisma.order.update({
      where: { id: okOrderId },
      data: { payment_intent_id: 'pi_expiry_ok' },
    });
    const cancelOk = vi.fn(async () => {});
    await expireStalePendingOrders(prisma, { cancelStripeIntent: cancelOk });
    expect(cancelOk).toHaveBeenCalledTimes(1);
    expect(cancelOk).toHaveBeenCalledWith('pi_expiry_ok');

    // Failure path — cancel throws; order is still EXPIRED, failure is audited.
    const failOrderId = await buildStaleOrder();
    await prisma.order.update({
      where: { id: failOrderId },
      data: { payment_intent_id: 'pi_expiry_fail' },
    });
    const cancelThrows = vi.fn(async () => {
      throw new Error('intent already canceled');
    });
    const result = await expireStalePendingOrders(prisma, { cancelStripeIntent: cancelThrows });
    expect(result.stripeCancelFailures).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: failOrderId } });
    expect(order?.status).toBe('EXPIRED'); // not rolled back

    const cancelFailAudits = await prisma.auditLog.count({
      where: { resource_id: failOrderId, action: 'payment.stripe_cancel_failed' },
    });
    expect(cancelFailAudits).toBe(1);
  });
});

describe('expirePendingOrder — webhook race (stub-killer)', () => {
  it('does not clobber an order that was PAID between candidate-discovery and the sweep', async () => {
    const orderId = await buildStaleOrder();

    // The webhook wins the race first.
    const finalize = await finalizePaidOrder(prisma, { orderId, provider: 'stripe' });
    expect(finalize.finalized).toBe(true);

    // The sweep arrives moments later with the now-stale candidate id.
    const cancelSpy = vi.fn(async () => {});
    const res = await expirePendingOrder(prisma, { orderId, cancelStripeIntent: cancelSpy });
    expect(res.expiredOrderIds).toEqual([]);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');

    const paidAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.paid' },
    });
    expect(paidAudits).toBe(1);

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);

    const expiredHistory = await prisma.orderStatusHistory.count({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(expiredHistory).toBe(0);

    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to confirm it fails (RED)**

Run:
```bash
pnpm --filter @vendoora/web test -- checkout-expiry
```
Expected: FAIL. The suite throws because `expireStalePendingOrders` / `expirePendingOrder` are not exported by `@vendoora/domain` yet (runtime "is not a function", or an unresolved-export error). **Do not proceed to Task 2 until you have observed this failure.**

---

## Task 2: GREEN — implement the expiry domain module

**Files:**
- Create: `packages/domain/src/checkout.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Create the domain module**

Create `packages/domain/src/checkout.ts`:

```ts
import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Checkout lifecycle sweep: expire abandoned PENDING_PAYMENT orders.
 *
 * A buyer who abandons checkout between buildPendingOrder and Stripe
 * confirmation leaves an Order(PENDING_PAYMENT) that no rail will ever
 * finalize. This module transitions such orders to EXPIRED (the enum value
 * exists for exactly this), marks the in-flight Payment FAILED, writes
 * history + audit, and best-effort cancels the Stripe PaymentIntent.
 *
 * Stripe-free by design (mirrors escrow.ts): the cancel is an injected
 * closure so the domain package never imports the Stripe SDK and the tests
 * pass a spy. The cancel runs AFTER the DB transaction commits — never holding
 * a Postgres transaction open across a network round-trip.
 */

/** Default age past which a PENDING_PAYMENT order is considered abandoned. */
export const DEFAULT_EXPIRY_MS = 30 * 60 * 1000;

type Db = PrismaClient;

export interface ExpiryResult {
  expiredOrderIds: string[];
}

export interface ExpirySweepResult {
  ordersExpired: number;
  stripeCancelFailures: number;
}

/**
 * Expire one specific order iff it is still PENDING_PAYMENT. The state-guarded
 * updateMany is the racing-payment safety property: if finalizePaidOrder lands
 * between the read and the update, the WHERE status='PENDING_PAYMENT' clause
 * matches zero rows, count is 0, and we bail — the order is correctly PAID, no
 * expiry audit, no clobber.
 *
 * The Stripe cancel runs after the transaction commits. A cancel that throws
 * (PI already succeeded/canceled) is logged to audit and rethrown to the
 * caller's closure if it chose to observe failures — the order stays EXPIRED.
 */
export async function expirePendingOrder(
  db: Db,
  args: {
    orderId: string;
    now?: Date;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  },
): Promise<ExpiryResult> {
  const { orderId } = args;
  const now = args.now ?? new Date();

  const { expiredOrderIds, paymentIntentId } = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, payment_intent_id: true, created_at: true },
    });
    if (!order || order.status !== 'PENDING_PAYMENT') {
      return { expiredOrderIds: [] as string[], paymentIntentId: null as string | null };
    }

    // State-guarded write — atomic re-check of status='PENDING_PAYMENT'.
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'EXPIRED', status_updated_at: now },
    });
    if (count === 0) {
      return { expiredOrderIds: [] as string[], paymentIntentId: null as string | null };
    }

    await tx.payment.updateMany({
      where: { order_id: orderId, status: 'PENDING' },
      data: { status: 'FAILED', failed_at: now, failure_reason: 'order_expired' },
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        from_status: 'PENDING_PAYMENT',
        to_status: 'EXPIRED',
        changed_by_system: true,
        reason: 'abandoned_checkout',
      },
    });

    await tx.auditLog.create({
      data: {
        actor_system: true,
        action: 'order.expired',
        resource_type: 'order',
        resource_id: orderId,
        before_state: { status: 'PENDING_PAYMENT' } satisfies Prisma.InputJsonValue,
        after_state: { status: 'EXPIRED' } satisfies Prisma.InputJsonValue,
        metadata: {
          reason: 'abandoned_checkout',
          payment_intent_id: order.payment_intent_id,
          age_ms: now.getTime() - order.created_at.getTime(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { expiredOrderIds: [orderId], paymentIntentId: order.payment_intent_id };
  });

  // Best-effort Stripe cancel AFTER commit. A throw here does not undo the
  // expiry — it is logged and rethrown so an observing caller (the sweep) can
  // count it.
  if (expiredOrderIds.length > 0 && paymentIntentId && args.cancelStripeIntent) {
    try {
      await args.cancelStripeIntent(paymentIntentId);
    } catch (err) {
      await db.auditLog.create({
        data: {
          actor_system: true,
          action: 'payment.stripe_cancel_failed',
          resource_type: 'order',
          resource_id: orderId,
          metadata: {
            payment_intent_id: paymentIntentId,
            error: err instanceof Error ? err.message : String(err),
          } satisfies Prisma.InputJsonValue,
        },
      });
      throw err;
    }
  }

  return { expiredOrderIds };
}

/**
 * Sweep the marketplace for abandoned PENDING_PAYMENT orders older than
 * olderThanMs and expire each. Candidate discovery is a single FIFO-ordered
 * query (oldest first, so a backlog larger than `limit` can't starve the most
 * overdue). Each order is its own transaction via expirePendingOrder, so one
 * slow/failed order can't roll back the others. stripeCancelFailures counts
 * post-commit cancel rejections purely for observability.
 */
export async function expireStalePendingOrders(
  db: Db,
  args: {
    now?: Date;
    olderThanMs?: number;
    limit?: number;
    cancelStripeIntent?: (pi: string) => Promise<void>;
  } = {},
): Promise<ExpirySweepResult> {
  const now = args.now ?? new Date();
  const olderThanMs = args.olderThanMs ?? DEFAULT_EXPIRY_MS;
  const limit = args.limit ?? 500;
  const cancel = args.cancelStripeIntent;

  const due = await db.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      created_at: { lte: new Date(now.getTime() - olderThanMs) },
    },
    orderBy: { created_at: 'asc' },
    select: { id: true },
    take: limit,
  });

  let ordersExpired = 0;
  let stripeCancelFailures = 0;

  for (const { id } of due) {
    // Wrap the injected cancel so a post-commit failure is counted here but the
    // order is still expired (expirePendingOrder already committed + audited).
    let cancelFailed = false;
    const countingCancel = cancel
      ? async (pi: string) => {
          try {
            await cancel(pi);
          } catch (err) {
            cancelFailed = true;
            throw err;
          }
        }
      : undefined;

    const res = await expirePendingOrder(db, { orderId: id, now, cancelStripeIntent: countingCancel });
    ordersExpired += res.expiredOrderIds.length;
    if (cancelFailed) stripeCancelFailures += 1;
  }

  return { ordersExpired, stripeCancelFailures };
}
```

- [ ] **Step 2: Re-export from the domain barrel**

Modify `packages/domain/src/index.ts` to add the checkout exports below the existing escrow block:

```ts
export {
  DISPUTE_WINDOW_MS,
  releaseEligibleEscrowForOrder,
  releaseAllEligibleEscrow,
  type ReleaseResult,
  type ReleaseSweepResult,
} from './escrow';

export {
  DEFAULT_EXPIRY_MS,
  expirePendingOrder,
  expireStalePendingOrders,
  type ExpiryResult,
  type ExpirySweepResult,
} from './checkout';
```

- [ ] **Step 3: Run the test to confirm it passes (GREEN)**

Run:
```bash
pnpm --filter @vendoora/web test -- checkout-expiry
```
Expected: PASS — all 6 cases green (5 in `expireStalePendingOrders`, 1 race test in `expirePendingOrder`).

- [ ] **Step 4: Type-check + lint the domain package**

Run:
```bash
pnpm --filter @vendoora/domain type-check
pnpm --filter @vendoora/domain lint
```
Expected: both clean (0 errors). Watch specifically for `no-non-null-assertion` (the plan uses a captured `cancel` const, no `!`) and `consistent-type-imports` (the `import type { Prisma, PrismaClient }` form is used).

- [ ] **Step 5: Commit the GREEN domain slice**

```bash
git -c core.autocrlf=false add packages/domain/src/checkout.ts packages/domain/src/index.ts apps/web/__tests__/checkout-expiry.test.ts
git -c core.autocrlf=false commit -m "$(cat <<'EOF'
feat(checkout): expire stale PENDING_PAYMENT orders (domain + tests)

State-guarded transition to EXPIRED with FAILED-payment bookkeeping,
history + audit rows, and an injected best-effort Stripe PI cancel.
Six real-DB tests including the webhook-race stub-killer.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

> **Note (branch):** if you are not already on the feature branch, create it before the first commit:
> `git checkout -b feat/expire-stale-pending-orders` (off `main`). Do this in Task 1 Step 1 if preferred.

---

## Task 3: Worker wiring — generalize poll-loop, add the expiry queue, inject Stripe cancel

**Files:**
- Create: `apps/worker/src/redis-connection.ts`
- Modify: `apps/worker/src/escrow-queue.ts` (import only)
- Create: `apps/worker/src/checkout-expiry-queue.ts`
- Modify: `apps/worker/src/poll-loop.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/worker/package.json`

There are no worker unit tests; this task is verified by `tsc --noEmit` (type-check), `eslint`, and the full `pnpm test` at the end (Task 4). The poll-loop signature change is internal to `apps/worker` — `startPollLoop`'s only caller is `apps/worker/src/index.ts`, edited in the same task.

- [ ] **Step 1: Extract the shared Redis connection helper**

Create `apps/worker/src/redis-connection.ts`:

```ts
import { type RedisOptions } from 'bullmq';

/** Parse a redis(s):// URL into BullMQ/ioredis connection options. */
export function connectionFromUrl(redisUrl: string): RedisOptions {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    // BullMQ requires this to be null on the connections it drives.
    maxRetriesPerRequest: null,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
```

- [ ] **Step 2: Point escrow-queue.ts at the shared helper**

In `apps/worker/src/escrow-queue.ts`, delete the local `connectionFromUrl` function (lines 24–36) and its now-unused `type RedisOptions` from the bullmq import, then import the shared helper. The top of the file becomes:

```ts
import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { releaseAllEligibleEscrow, type ReleaseSweepResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';
```

Leave everything else in the file unchanged (the two `connectionFromUrl(redisUrl)` call sites now resolve to the import).

- [ ] **Step 3: Create the checkout-expiry BullMQ queue**

Create `apps/worker/src/checkout-expiry-queue.ts`:

```ts
import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { expireStalePendingOrders, type ExpirySweepResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * Production scheduler for stale-checkout expiry. Mirrors escrow-queue.ts:
 * a repeatable BullMQ job sweeps every intervalMs and the Worker runs the
 * shared, tested expireStalePendingOrders. Independent queue → independent
 * DLQ, concurrency, and (tighter) interval than escrow.
 */

export const CHECKOUT_EXPIRY_QUEUE_NAME = 'checkout-expiry';
const SCHEDULER_ID = 'checkout-expiry-every';
const JOB_NAME = 'expire';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startCheckoutExpiryWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  olderThanMs: number;
  log: Logger;
  cancelStripeIntent?: (pi: string) => Promise<void>;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, olderThanMs, log, cancelStripeIntent } = opts;

  const queue = new Queue(CHECKOUT_EXPIRY_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, ExpirySweepResult>(
    CHECKOUT_EXPIRY_QUEUE_NAME,
    async (): Promise<ExpirySweepResult> => {
      const result = await expireStalePendingOrders(prisma, {
        now: new Date(),
        olderThanMs,
        cancelStripeIntent,
      });
      if (result.ordersExpired > 0) log('expired stale orders', { ...result });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: CHECKOUT_EXPIRY_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
```

- [ ] **Step 4: Generalize the poll-loop to drive multiple sweeps**

Replace the entire body of `apps/worker/src/poll-loop.ts` with:

```ts
/**
 * Fallback scheduler: a single-process polling loop used when REDIS_URL is not
 * configured. Drives an arbitrary set of named sweeps, each with its own
 * overlap guard (a slow sweep can't block another's tick) that doubles as the
 * shutdown drain handle. Run as a SINGLE replica in this mode — it has no
 * cross-process locking (BullMQ mode does).
 */

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export interface SchedulerHandle {
  close: () => Promise<void>;
}

export interface Sweep {
  name: string;
  run: () => Promise<unknown>;
}

export function startPollLoop(opts: {
  intervalMs: number;
  log: Logger;
  sweeps: Sweep[];
}): SchedulerHandle {
  const { intervalMs, log, sweeps } = opts;
  const active = new Map<string, Promise<void>>();

  function sweepOnce(sweep: Sweep): Promise<void> {
    const inflight = active.get(sweep.name);
    if (inflight) return inflight; // never overlap this sweep's ticks
    const p = (async () => {
      try {
        await sweep.run();
      } catch (error) {
        log('sweep failed', {
          sweep: sweep.name,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        active.delete(sweep.name);
      }
    })();
    active.set(sweep.name, p);
    return p;
  }

  function tick(): void {
    for (const sweep of sweeps) void sweepOnce(sweep);
  }

  tick(); // run all once on boot
  const timer = setInterval(tick, intervalMs);

  return {
    close: async () => {
      clearInterval(timer);
      await Promise.allSettled([...active.values()]);
    },
  };
}
```

- [ ] **Step 5: Add the Stripe dependency to the worker**

Edit `apps/worker/package.json` — add `stripe` to `dependencies` (matching the version `apps/web` pins):

```json
  "dependencies": {
    "@vendoora/db": "workspace:*",
    "@vendoora/domain": "workspace:*",
    "bullmq": "^5.34.0",
    "dotenv": "^16.4.5",
    "stripe": "^17"
  },
```

Then install:
```bash
pnpm install
```
Expected: `pnpm-lock.yaml` updates to add `stripe` under `@vendoora/worker`; no other package’s resolution changes.

- [ ] **Step 6: Wire both schedulers + the worker-local Stripe cancel into index.ts**

Replace `apps/worker/src/index.ts` with:

```ts
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { releaseAllEligibleEscrow, expireStalePendingOrders } from '@vendoora/domain';

/**
 * Vendoora background worker.
 *
 *   - escrow auto-release (Engineering_Spec §6.4): HELD → RELEASING once the
 *     24h post-delivery dispute window passes.
 *   - checkout expiry: abandoned PENDING_PAYMENT orders → EXPIRED (+ FAILED
 *     payment, audit, best-effort Stripe PI cancel).
 *
 * Scheduler is chosen at boot:
 *   - REDIS_URL set   → two BullMQ repeatable jobs (retries, dead-letter set,
 *                       cross-process locking → safe to run multiple replicas).
 *   - REDIS_URL unset → single-process poll loop driving both sweeps (run ONE
 *                       replica). Both sweeps share the escrow interval here.
 *
 * The job logic is the shared, tested @vendoora/domain code in both modes.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const { prisma } = await import('@vendoora/db');

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const ESCROW_INTERVAL_MS = envInt('ESCROW_RELEASE_INTERVAL_MS', 5 * 60 * 1000);
const EXPIRY_INTERVAL_MS = envInt('CHECKOUT_EXPIRY_INTERVAL_MS', 60 * 1000);
const EXPIRY_OLDER_THAN_MS = envInt('CHECKOUT_EXPIRY_OLDER_THAN_MS', 30 * 60 * 1000);

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), worker: 'vendoora-worker', message, ...extra };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// Worker-local Stripe cancel closure (see plan "Deviation from spec"). Built
// once; undefined when STRIPE_SECRET_KEY is absent (MoMo/Orange-only or dev),
// in which case the domain skips the cancel — no behavior change.
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeClient = stripeSecret ? new Stripe(stripeSecret, { typescript: true }) : null;
const cancelStripeIntent: ((pi: string) => Promise<void>) | undefined = stripeClient
  ? async (pi: string) => {
      await stripeClient.paymentIntents.cancel(pi);
    }
  : undefined;

const REDIS_URL = process.env.REDIS_URL;

let scheduler: { close: () => Promise<void> };
if (REDIS_URL) {
  const { startEscrowAutoReleaseWorker } = await import('./escrow-queue');
  const { startCheckoutExpiryWorker } = await import('./checkout-expiry-queue');
  const escrow = await startEscrowAutoReleaseWorker({
    redisUrl: REDIS_URL,
    intervalMs: ESCROW_INTERVAL_MS,
    log,
  });
  const expiry = await startCheckoutExpiryWorker({
    redisUrl: REDIS_URL,
    intervalMs: EXPIRY_INTERVAL_MS,
    olderThanMs: EXPIRY_OLDER_THAN_MS,
    log,
    cancelStripeIntent,
  });
  scheduler = {
    close: async () => {
      await Promise.allSettled([escrow.close(), expiry.close()]);
    },
  };
  log('starting', {
    mode: 'bullmq',
    escrowIntervalMs: ESCROW_INTERVAL_MS,
    expiryIntervalMs: EXPIRY_INTERVAL_MS,
    stripeCancel: Boolean(cancelStripeIntent),
  });
} else {
  const { startPollLoop } = await import('./poll-loop');
  scheduler = startPollLoop({
    intervalMs: ESCROW_INTERVAL_MS,
    log,
    sweeps: [
      {
        name: 'escrow-auto-release',
        run: async () => {
          const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
          if (result.holdsReleased > 0) log('released escrow', { ...result });
        },
      },
      {
        name: 'checkout-expiry',
        run: async () => {
          const result = await expireStalePendingOrders(prisma, {
            now: new Date(),
            olderThanMs: EXPIRY_OLDER_THAN_MS,
            cancelStripeIntent,
          });
          if (result.ordersExpired > 0) log('expired stale orders', { ...result });
        },
      },
    ],
  });
  log('starting', {
    mode: 'poll-loop',
    intervalMs: ESCROW_INTERVAL_MS,
    stripeCancel: Boolean(cancelStripeIntent),
  });
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down', { signal });
  await scheduler.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
```

- [ ] **Step 7: Type-check + lint the worker**

Run:
```bash
pnpm --filter @vendoora/worker type-check
pnpm --filter @vendoora/worker lint
```
Expected: both clean. The `releaseAllEligibleEscrow` / `expireStalePendingOrders` imports resolve from `@vendoora/domain`; `Stripe` resolves from the new dep; `startPollLoop` is called with the new `sweeps` shape.

- [ ] **Step 8: Commit the worker wiring**

```bash
git -c core.autocrlf=false add apps/worker/src/redis-connection.ts apps/worker/src/checkout-expiry-queue.ts apps/worker/src/escrow-queue.ts apps/worker/src/poll-loop.ts apps/worker/src/index.ts apps/worker/package.json pnpm-lock.yaml
git -c core.autocrlf=false commit -m "$(cat <<'EOF'
feat(worker): schedule checkout-expiry sweep (bullmq + poll-loop)

New checkout-expiry BullMQ queue mirroring escrow; poll-loop generalized
to drive multiple named sweeps with per-sweep overlap guards. Worker-local
Stripe client injects the best-effort PI cancel. Shared connectionFromUrl
extracted to redis-connection.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Full verification + finish

**Files:** none (verification + branch finish)

- [ ] **Step 1: Run the full pipeline from the repo root**

Ensure Postgres is up (`pnpm db:up`) and seeded, then run each gate and observe output:

```bash
pnpm type-check
pnpm lint
pnpm test
pnpm build
```
Expected:
- `type-check`: all packages pass.
- `lint`: all packages pass (the `@next/next/no-img-element` warning elsewhere is non-failing and unrelated).
- `test`: the new `checkout-expiry` suite passes alongside the existing suites (total count = previous + 6). Tests are serialized (turbo) so the shared test DB has no cross-suite race.
- `build`: all build targets succeed (worker `build` is an echo no-op; web builds).

If any gate fails, stop and fix before proceeding (four-phase debugging per Build_Prompt). Do not mark this task complete until all four are observed green.

- [ ] **Step 2: Finish the development branch**

Use **superpowers:finishing-a-development-branch** to verify tests, present options, and execute the chosen workflow (the established #11–#35 convention is squash-merge via the GitHub REST API, parsing `"merged": true` before deleting the branch — secrets stay out of the shell history; the token comes from `git credential fill`).

- [ ] **Step 3: Final code-reviewer subagent pass (Build_Prompt §8)**

After the branch work is complete (PR opened or merged per the chosen option), dispatch the **code-reviewer** subagent over the full diff. Address any blocking findings with new commits before final merge.

---

## Out of scope (from spec §1 — do NOT build here)

- Buyer notification of expiry (no notification rail until P5).
- Cart restoration (cart is session-scoped; an abandoned buyer rebuilds from session).
- Refund logic (a PENDING_PAYMENT order was never captured — nothing to refund).
- Admin UI surfaces for expired orders (separate ticket; this job emits the audit rows that unblock admin queries).
- A `@@index([status, created_at])` composite migration (the two existing single-column `Order` indexes suffice at pre-launch volume; the sweep is `LIMIT 500`).
- The `payment.captured_after_expiry` follow-up audit for the rare pay-at-29:59 race (spec §8 — flagged for a separate ticket).

## Self-review notes

- **Spec coverage:** §3.1 signatures (`expirePendingOrder`, `expireStalePendingOrders`, `DEFAULT_EXPIRY_MS`, `ExpiryResult`, `ExpirySweepResult`) → Task 2. §3.2 transactional transition → Task 2 Step 1. §3.3 FIFO candidate discovery → Task 2 Step 1. §4.1 expiry queue → Task 3 Step 3. §4.2 poll-loop generalization → Task 3 Step 4. §4.3 index wiring + env vars → Task 3 Step 6 (Stripe source adjusted per documented deviation). §5 all six tests → Task 1. §7 branch/merge → Task 4 Step 2.
- **Type consistency:** `ExpirySweepResult { ordersExpired, stripeCancelFailures }` is produced by `expireStalePendingOrders` and consumed by `checkout-expiry-queue.ts`; `ExpiryResult { expiredOrderIds }` by `expirePendingOrder` and the race test. `Sweep { name, run }` defined in `poll-loop.ts` and consumed in `index.ts`. `connectionFromUrl` defined in `redis-connection.ts`, consumed by both queue files.
- **No placeholders:** every code step shows full file content or the exact edit.
