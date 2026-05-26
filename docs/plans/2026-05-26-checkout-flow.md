# Vendoora — Checkout Flow + Order Confirmation

> Inline execution. Bridges the cart into the trust-mechanic data spine.

**Goal:** Three coordinated additions:
1. **`/checkout` route** — delivery address form, payment-method radio, order summary, "Place Order" button
2. **`placeOrder` Server Action** — turns cart into a real `Order` + `OrderItem` rows + per-seller `EscrowHold` rows + a `Payment` row (mocked success for now), generates the 6-digit delivery code (hashed), clears the cart
3. **`/order-confirmation/[orderNumber]` route** — shows the placed order with status, escrow notice, and the delivery-code-on-its-way messaging

Real payment providers + state-machine validation + auto-release worker land in P3. This slice models the *flow* with mock payment success so the rest of the platform has Orders to act on.

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P2 Core Marketplace (Playbook §4.1.6 checkout)
**Estimated session time:** 3-4 hours

## Approach

**`placeOrder` server action — the centerpiece**

A single transaction that:
1. Reads cart from session cookie. Returns early if empty.
2. Re-validates each CartItem's product still PUBLISHED + APPROVED + not soft-deleted (defensive against products taken down between add-to-cart and checkout).
3. Validates the form: delivery address fields, delivery_zone (must match a seeded zone), payment_method (MTN_MOMO / ORANGE_MONEY / CARD).
4. Reads the form's `buyer_name` / `buyer_email` / `buyer_phone` (no auth yet → these come from the form).
5. **Within a `prisma.$transaction`:**
   - Generates an `order_number` like `VDR-${cuid().slice(-6).toUpperCase()}`.
   - Generates a 6-digit `delivery_code` (cryptographically random) and stores `delivery_code_hash` (bcrypt). The plaintext is also returned to the action's caller so it can be shown on the confirmation page (production will SMS it; for now we display it inline with a "in production this comes by SMS" note).
   - Creates the `Order` row with `status: PAID`, `payment_status: CAPTURED`, `payment_method`, FX rate snapshot (1.0 for USD).
   - For each cart item:
     - Computes commission (12% Starter / 10% Growth / 8% Pro / 5% Enterprise, based on the seller's `saas_commission_rate`).
     - Creates an `OrderItem` row with `product_snapshot` JSONB capturing immutable product state (name, price, image url, condition).
   - Groups OrderItems by seller and creates one `EscrowHold` per seller with `beneficiary_type: SELLER`, `state: HELD`, `scheduled_release_at` = now + 24h (placeholder — the auto-release worker in P3 will use this).
   - Creates a `Payment` row tied to the order with `status: CAPTURED`, `provider: WALLET` (placeholder until real providers integrate).
   - Writes an `OrderStatusHistory` row (PENDING_PAYMENT → PAID) and an `EscrowStateTransition` per hold (PENDING_PAYMENT → HELD).
   - Writes an `AuditLog` entry per Build_Prompt §10.4 (financial state change requires audit).
   - Deletes the cart items + cart (cart is single-use, recreated on next add).
6. Clears the `vdr_cart` cookie.
7. Redirects to `/order-confirmation/[orderNumber]`.

**Delivery code generation**

`generateDeliveryCode()` in a utility module:
- `crypto.randomInt(100000, 1000000)` — uniformly distributed 6-digit number
- bcrypt.hash with cost factor 10 → `delivery_code_hash` stored on Order
- Plaintext only returned from the action's transaction; never stored beyond the response.

**`bcrypt` dependency** — adds `bcrypt` + `@types/bcrypt` to `apps/web/devDependencies` (used only in server actions; tree-shaken from client bundle).

**`/checkout` page**

Server component reads the session cart. Empty cart → redirect to `/cart`. Otherwise renders:
- Left column: form
  - Buyer name + email + phone (required, no auth yet)
  - Delivery address: street, city, county (optional), country (default Liberia), delivery_zone select (populated from seeded `delivery_zones`), delivery_slot freeform, delivery_notes textarea
  - Payment method radio: MoMo / Orange / Card (Card disabled with "Diaspora only — coming soon" if buyer not flagged diaspora; for now all three are clickable)
- Right column: order summary
  - Line items (compact)
  - Subtotal, shipping fee (lookup from delivery_zone), platform fee (0), total
  - "Place Order — pay $X.XX into escrow" button
- Action: `<form action={placeOrder}>` — the Server Action redirects on success

**`/order-confirmation/[orderNumber]`**

Server component, looks up the Order by `order_number`. 404 if not found. Renders:
- Big green success: "Your order is placed and money is in escrow"
- Order number + delivery code (BIG, monospace, with a "In production this arrives by SMS" note)
- Order summary: items, total
- "What happens next" 4-step timeline matching the homepage trust panel
- Link to the (future) order tracking page (stub for now)

## Scope

- [ ] `apps/web/app/checkout/page.tsx` — server component with the form
- [ ] `apps/web/app/actions/order.ts` — `placeOrder` server action
- [ ] `apps/web/app/order-confirmation/[orderNumber]/page.tsx`
- [ ] `apps/web/lib/delivery-code.ts` — `generateDeliveryCode()` + bcrypt hash utility
- [ ] `bcrypt` + `@types/bcrypt` in apps/web devDeps
- [ ] Integration tests: place order → Order created with status=PAID + correct line items + per-seller EscrowHolds in HELD state + Payment in CAPTURED + cart deleted + delivery_code_hash present
- [ ] Lint + build + cold-state clean

## Out of scope

- **Real payment provider integration** (MoMo / Orange / Stripe) — P3 Trust Mechanic. This slice mocks payment success.
- **State-machine transition guards** — `prisma.$transaction` + `SELECT FOR UPDATE` on escrow holds for the actual escrow code path — P3 with the domain logic.
- **Auto-release worker** (24h after DELIVERED → RELEASED) — P3.
- **SMS delivery of the 6-digit code** — Africa's Talking integration, P2/P3.
- **Order tracking page** `/orders/[number]` — separate slice.
- **Buyer order history page** — needs auth; defer to Clerk slice.
- **Promo codes** — defer to marketing slice.
- **Diaspora-specific checkout fields** (recipient picker, voice message) — defer to diaspora slice.
- **Cart-to-user-cart merge on login** — Clerk slice.

## Files to be created

- `apps/web/app/actions/order.ts`
- `apps/web/app/checkout/page.tsx`
- `apps/web/app/order-confirmation/[orderNumber]/page.tsx`
- `apps/web/lib/delivery-code.ts`

## Files to be modified

- `apps/web/package.json` — add `bcrypt` + `@types/bcrypt`
- `apps/web/app/cart/page.tsx` — change the disabled Checkout button to a link to `/checkout`
- `apps/web/__tests__/cart-actions.test.ts` — no change, but a new `order-actions.test.ts` file lands

## Test cases (~7)

In `apps/web/__tests__/order-actions.test.ts`:
- [ ] placeOrder fails if cart is empty
- [ ] placeOrder creates Order with status=PAID
- [ ] placeOrder creates one OrderItem per cart item with correct commission
- [ ] placeOrder creates one EscrowHold per unique seller in HELD state
- [ ] placeOrder creates a Payment row in CAPTURED state
- [ ] placeOrder writes an OrderStatusHistory entry (PENDING_PAYMENT → PAID)
- [ ] placeOrder deletes the cart items and cart row after success
- [ ] delivery_code_hash is set on the Order; plaintext code is 6 digits

## Risks

1. **bcrypt on Windows + Next 15** — `bcrypt` is a native module (node-gyp). Sometimes pnpm postinstall hangs on Windows. If it does, fall back to `bcryptjs` (pure JS, slightly slower but no native deps).
2. **Server Action redirect behavior** — `redirect()` throws an internal Next.js error that flows up; testing it requires careful error handling.
3. **prisma.$transaction with many writes** — ordering matters because of FKs. Sequence: Order → OrderItems → EscrowHolds → Payment → OrderStatusHistory → cart delete.
4. **Commission rate snapshotting** — must be captured at order time, not looked up live, so seller plan changes don't retroactively change order math.

## Dependencies

- Seeded products + sellers + delivery zones ✓ (slice 8)
- Cart functionality ✓ (slice 9)
- All 49 schema tables ✓ (slices 1-7b)

---

## Tasks

1. Delivery code utility + bcrypt install
2. `placeOrder` server action
3. `/checkout` page
4. `/order-confirmation/[orderNumber]` page
5. Update /cart's Checkout button to link to /checkout
6. Integration tests + cold-state + commit
