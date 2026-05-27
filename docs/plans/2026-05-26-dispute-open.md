# Vendoora — Dispute Open Flow

> Inline execution. The "Open a dispute" button on the tracking page becomes a real form.

**Goal:**
1. `/orders/[orderNumber]/dispute` — form to open a dispute (category, reason, description)
2. `createDispute` server action — writes Dispute + transitions EscrowHolds to HELD_DISPUTED + writes audit
3. `/disputes/[disputeNumber]` — read-only status view (open status, 48hr SLA countdown, frozen-in-escrow indicator, order context)

After this slice the buyer can open a dispute and watch the order/escrow state move into "under review" territory. Resolution (T&S admin queue, FULL_REFUND_TO_BUYER / RELEASE_TO_SELLER / INSURANCE_PAYOUT actions) stays deferred to P6 Admin/RBAC.

---

**Date:** 2026-05-26
**Estimated complexity:** M
**Phase:** P2 Core Marketplace bridge into P3 Trust Mechanic
**Estimated session time:** 2-3 hours

## Approach

**`createDispute` server action**

A single transaction that:
1. Reads `orderNumber` + form fields (category, reason, description, optional message body).
2. Looks up the Order with its escrow_holds. 404-style failure (redirect to /orders?error=) if not found.
3. Validates the buyer's permission to open: for now, any order can be opened from its `orderNumber` URL — this matches the no-auth posture of the rest of the buyer surface and parallels the dev-stage-advance affordance. When Clerk lands, replace with `order.buyer_user_id === currentUserId`.
4. Validates that the order is in a disputable state (PAID, ACCEPTED, PREPARING, PICKED_UP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, COMPLETED). Refuses CANCELLED / REFUNDED / EXPIRED / already-DISPUTED.
5. Generates `dispute_number` like `VDR-DIS-${cuid().slice(-6).toUpperCase()}`.
6. In `prisma.$transaction`:
   - Creates `Dispute` (status=OPEN, sla_due_at = now + 48h, sla_breached=false, initiated_by_user_id = order.buyer_user_id)
   - For each existing `EscrowHold` on the order in state HELD: transitions to HELD_DISPUTED, writes an `EscrowStateTransition` row (HELD → HELD_DISPUTED, reason=`dispute_opened`)
   - Transitions Order.status → DISPUTED, writes `OrderStatusHistory`
   - Writes `AuditLog` entry (action=`dispute.opened`, resource_type=`dispute`, resource_id=new dispute id, before/after JSON)
   - If the form included a `description_message`, creates an initial `DisputeMessage` from the buyer
7. Redirects to `/disputes/[disputeNumber]`.

**`/orders/[orderNumber]/dispute` form**

Server component that:
- Loads the order
- Renders a form with:
  - `category` select (NOT_RECEIVED / DAMAGED / WRONG_ITEM / COUNTERFEIT / QUALITY_ISSUE / IN_TRANSIT_DAMAGE / OTHER)
  - `reason` hidden (BUYER_INITIATED — sellers initiating is a separate flow)
  - `description` textarea (required, min 20 chars enforced client-side and re-validated server-side)
  - submit button → `createDispute` action
- Refuses to render the form if order isn't disputable (renders an informational panel instead)

**`/disputes/[disputeNumber]` view**

Server component:
- Loads dispute with associated order
- Header strip: dispute_number, status pill, 48hr countdown (rendered as remaining hours)
- Main panel: category, reason, description, opened-at timestamp
- Escrow-frozen indicator: "Your payment is frozen in escrow while Trust & Safety reviews. No one is paid until this resolves."
- Order context card: order_number, items count, total amount
- Messages list (if any messages, render them; for this slice just the initial description message)
- T&S decision section (empty placeholder until P6)

**Tracking page wire-up**

`/orders/[orderNumber]` stage 4 panel — replace the disabled "Open a dispute (coming soon)" button with a `<Link href={/orders/${orderNumber}/dispute}>` styled as the primary CTA.

## Scope

- [ ] `apps/web/app/actions/dispute.ts` — createDispute server action
- [ ] `apps/web/app/orders/[orderNumber]/dispute/page.tsx` — open-dispute form
- [ ] `apps/web/app/disputes/[disputeNumber]/page.tsx` — read-only dispute view
- [ ] `apps/web/lib/dispute-helpers.ts` — `isOrderDisputable(status)` + `hoursUntil(date)` utilities
- [ ] Tracking page (stage 4) links to /orders/[orderNumber]/dispute
- [ ] Order confirmation page (low priority — defer the link here; stage 4 is where users actually need it)
- [ ] Integration tests: createDispute creates Dispute + transitions escrow + transitions order + writes audit + refuses re-open

## Out of scope

- Real T&S admin queue / resolution actions (P6)
- Evidence file upload (needs R2 wiring — P1.3.7)
- Messages thread / reply form (defer; just the initial message lands on dispute creation)
- 48hr SLA timer worker (P3 — fires alerts at 24h/36h/48h)
- Seller-initiated disputes (P4 seller console)
- Chargeback flow (P3)
- Insurance fund payout (P3)
- Dispute notifications to seller + admin (P3)
- Email/SMS to buyer on dispute resolution (P3)

## Files to be created

- `apps/web/app/actions/dispute.ts`
- `apps/web/app/orders/[orderNumber]/dispute/page.tsx`
- `apps/web/app/disputes/[disputeNumber]/page.tsx`
- `apps/web/lib/dispute-helpers.ts`
- `apps/web/__tests__/dispute-actions.test.ts`

## Files to be modified

- `apps/web/app/orders/[orderNumber]/page.tsx` — stage 4 stub button becomes a Link

## Tests (~5)

- [ ] createDispute on a DELIVERED order creates Dispute with status=OPEN + sla_due_at ~48h from now
- [ ] createDispute transitions all HELD EscrowHolds to HELD_DISPUTED and writes EscrowStateTransition rows
- [ ] createDispute writes Order.status=DISPUTED + OrderStatusHistory entry
- [ ] createDispute writes audit_log entry (action='dispute.opened')
- [ ] createDispute refuses CANCELLED order with a redirect to ?error=
- [ ] (Bonus) createDispute creates an initial DisputeMessage if description is provided

## Risks

1. **Re-opening the same dispute** — the schema doesn't prevent multiple Dispute rows per Order. The action checks `Order.status === 'DISPUTED'` and refuses if already in dispute. Good enough for MVP. Real P3 will add a unique-active constraint.
2. **State transition concurrency** — same as the order-status slice, no SELECT FOR UPDATE. P3 will harden this with proper locking.
3. **Auth model** — guest checkout means anyone with the URL can open a dispute on an order. This matches the no-auth posture of the rest of the buyer surface; flag for Clerk slice.

---

## Tasks

1. dispute-helpers utility (isOrderDisputable, hoursUntil)
2. createDispute server action
3. /orders/[orderNumber]/dispute form route
4. /disputes/[disputeNumber] view route
5. Tracking-page stub → real link
6. Integration tests + commit
