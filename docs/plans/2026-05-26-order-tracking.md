# Vendoora — Order Tracking Page + Dev Stage-Advance

> Inline execution. The trust mechanic becomes visceral.

**Goal:** Build the 5-stage post-checkout tracking page from Polish_Phase_Addendum §1.3 at `/orders/[orderNumber]`, plus a dev-only "Advance stage" server action that lets you progress an order through all the OrderStatus states for demo purposes (the real driver-app + seller-app flows that drive these transitions live in P3/P4/P7).

After this slice, you can place an order and watch it move through:
- Stage 0: Payment confirmed (PAID INTO ESCROW)
- Stage 1: Seller is preparing (BEING PREPARED)
- Stage 2: Your code is live (DRIVER EN ROUTE)
- Stage 3: Out for delivery (ARRIVING NOW)
- Stage 4: Delivered. Code verified. (COMPLETE)

Each stage has its own visual treatment + appropriate UI elements (driver visibility, code display, etc.).

---

**Date:** 2026-05-26
**Estimated complexity:** M
**Phase:** P2 Core Marketplace (Playbook §4.1.7) + Polish_Phase_Addendum §1.3
**Estimated session time:** 2-3 hours

## Approach

Map `Order.status` enum values to stage numbers:
- `PAID` → Stage 0 (payment confirmed)
- `ACCEPTED` | `PREPARING` | `READY_FOR_PICKUP` → Stage 1 (seller preparing)
- `PICKED_UP` → Stage 2 (driver en route, code live)
- `OUT_FOR_DELIVERY` | `ARRIVED` → Stage 3 (arriving now)
- `DELIVERED` | `COMPLETED` → Stage 4 (delivered)
- `CANCELLED` | `REFUNDED` | `EXPIRED` | `DISPUTED` → terminal/edge states (separate panels)

The tracking page renders a header + progress strip showing all 5 stages with the current one highlighted, then a stage-specific main panel below.

**Dev advance flow:** A server action `advanceOrderStatus(orderNumber)` reads the current status, maps to the next status in the linear progression, writes an `OrderStatusHistory` row + audit_log entry, transitions any matching `EscrowHold`s when needed (e.g., on DELIVERED → schedule release). For now this just walks the happy path; real state-machine guards (transitioning concurrency-safely with `SELECT FOR UPDATE`) live in P3.

The advance button is rendered only when `process.env.NODE_ENV !== 'production'` — a visible dev affordance that won't ship.

**Order code reveal at Stage 2:** the `vdr_dc_<orderNumber>` cookie set at checkout expires after 5 minutes. For the tracking page to keep showing the code, we'd need to either extend the cookie life or do something fancier. For now, the tracking page shows a "Check your phone" placeholder past the cookie expiry — honest, matches the "SMS in production" reality.

## Scope

- [ ] `/orders/[orderNumber]/page.tsx` — server component reading Order + items + escrow holds
- [ ] Stage-aware rendering with all 5 stages (progress strip + stage panel)
- [ ] Terminal-state rendering (cancelled / refunded / disputed)
- [ ] `app/actions/order-status.ts` exporting `advanceOrderStatus(orderNumber)` server action
- [ ] Confirmation page links to /orders/[orderNumber]
- [ ] Integration tests: advanceOrderStatus walks the happy path; writes OrderStatusHistory + AuditLog
- [ ] Dev-only "Advance to next stage" button on the tracking page

## Out of scope

- **Real state-machine guards** — SELECT FOR UPDATE, valid-transition enforcement, concurrent-modification handling: P3
- **Driver app endpoint** that POSTs the code → triggers PICKED_UP → DELIVERED: P7
- **Seller console "mark accepted/preparing/ready"** actions: P4
- **24h auto-release worker** (DELIVERED → COMPLETED → release escrow): P3
- **SMS push notifications** on stage transitions: P3
- **Photo proof-of-delivery upload**: P7
- **Dispute open from tracking page**: separate slice
- **Live location map** (Polish_Phase_Addendum §2B.5 Monrovia map): P6 admin tools

## Files to be created

- `apps/web/app/orders/[orderNumber]/page.tsx`
- `apps/web/app/actions/order-status.ts`
- `apps/web/components/OrderStageStrip.tsx` (the 5-stage progress strip)
- `apps/web/__tests__/order-status-actions.test.ts`

## Files to be modified

- `apps/web/app/order-confirmation/[orderNumber]/page.tsx` — add CTA to /orders/[orderNumber]

## Test cases

- [ ] advanceOrderStatus on PAID → ACCEPTED writes OrderStatusHistory transition
- [ ] advanceOrderStatus on DELIVERED is a no-op (terminal happy state for this slice)
- [ ] advanceOrderStatus writes an audit_log entry
- [ ] advanceOrderStatus returns the new status

## Risks

1. **OrderStatus has 14 values** including failure modes (CANCELLED, REFUNDED, EXPIRED, DISPUTED). The dev advance flow only walks the happy path — failure modes aren't reachable from the dev button. Confirm Production never relies on this advance function (it's gated by NODE_ENV).
2. **EscrowState transitions** on DELIVERED should set `scheduled_release_at` for the 24h timer. The schedule already happened at checkout; on DELIVERED we just update `state_changed_at`. Don't double-schedule.

---

## Tasks

1. OrderStageStrip component + stage helper
2. /orders/[orderNumber] route with stage-aware rendering
3. advanceOrderStatus server action + dev button
4. Tests + commit
