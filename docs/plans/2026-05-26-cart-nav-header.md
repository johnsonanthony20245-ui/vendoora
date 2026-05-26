# Vendoora — Cart + Nav Header

> Inline execution. Makes "Add to cart" actually do something.

**Goal:** Three coordinated additions:
1. **Persistent nav header** at the top of every route — logo + categories link + cart icon with item count badge
2. **Anonymous cart functionality** — clicking "Add to cart" on a PDP actually adds the item via a Server Action; persists in `Cart` + `CartItem` rows tied to an HTTP-only cookie session ID
3. **`/cart` route** showing items with remove button + total

No auth required for this slice. Anonymous carts use the `Cart.user_id` null + `Cart.session_id` set pattern (already in the slice 3 schema).

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P2 Core Marketplace (Playbook §4.1.5 cart)
**Estimated session time:** 3 hours

## Approach

**Cart identity via cookie**

A new HTTP-only, Secure, SameSite=Lax cookie `vdr_cart` holds a `cuid()`-style session id. Server actions read it; if missing, generate one and set it. The Cart row is created lazily on first item add (don't create empty carts).

**Server Action shape**

`apps/web/app/actions/cart.ts` exports:
- `addToCart(formData)` — reads productId/variantId/quantity from form, finds-or-creates Cart for the cookie's session_id, upserts CartItem (sums quantity on duplicate productId+variantId), `revalidatePath('/cart')` + `revalidatePath(referer pdp path)`, returns the new cart count
- `removeCartItem(formData)` — reads cartItemId, deletes if owned by current session, revalidatePath('/cart')
- `getCartCount()` — async function readable from server components to render the badge

**Header**

`apps/web/components/Header.tsx` — server component for the structure (logo, links), reads `getCartCount()` to render the badge. No client component yet (the dropdown menus that would need state come later). Applied via `layout.tsx` above `{children}` so it's persistent.

Header content:
- Left: Vendoora wordmark (links to /)
- Middle: "Browse" link → opens to a category landing (link to /c/fashion as a placeholder until a category index page exists; better: link to the homepage's #categories anchor)
- Right: cart icon with item-count badge (links to /cart). When count is 0, badge is hidden.
- No search bar yet (deferred)
- No user/auth menu yet (deferred to Clerk slice)
- Mobile responsive: collapses to logo + cart only at <640px

**`/cart` route**

`apps/web/app/cart/page.tsx` — server component. Reads cookie, queries Cart with items + product joins. Renders:
- Header section: "Your cart" + item count
- List of items: image + name + seller name + condition pill + variant name (if any) + quantity + line subtotal + Remove button (form posting to `removeCartItem` Server Action)
- Right rail (mobile: below list): subtotal, "Checkout" button (stub, disabled with tooltip "Checkout flow lands in next slice")
- Empty state when no cart or empty cart

**PDP wire-up**

Replace the disabled "Add to cart" `<button disabled>` with an actual `<form action={addToCart}>`. Hidden inputs for productId + variantId (optional). The button is no longer disabled.

## Scope

- [ ] Header component applied via layout.tsx
- [ ] `app/actions/cart.ts` server actions (addToCart, removeCartItem, getCartCount)
- [ ] Cookie-based session ID (server-only, HTTP-only, Secure, SameSite=Lax)
- [ ] `app/cart/page.tsx` route
- [ ] PDP "Add to cart" form wired
- [ ] Cart count badge in header
- [ ] Integration tests: add → cart row exists, remove → row deleted, multi-add coalesces quantity

## Out of scope

- **Auth-linked cart sync** — when Clerk wires up, anon carts merge to logged-in user's cart. Defer.
- **Cart icon dropdown preview** — clicking goes to /cart for now; the hover popover is a future polish slice
- **Stock checks at add time** — Cart accepts arbitrary quantities; inventory enforcement is checkout-time (P2.1.6)
- **Promo code entry** — promo schema exists but the UI defers
- **Shipping fee calculation** — checkout slice
- **Mini search bar in header** — separate search slice
- **User menu / login button in header** — Clerk slice

## Files to be created

- `apps/web/app/actions/cart.ts`
- `apps/web/app/cart/page.tsx`
- `apps/web/components/Header.tsx`
- `apps/web/components/CartIcon.tsx` (small client component for the icon + count, or keep server-only)

## Files to be modified

- `apps/web/app/layout.tsx` — wrap `<body>` content in `<Header>` + `{children}`
- `apps/web/app/p/[sellerSlug]/[productSlug]/page.tsx` — Add-to-cart `<form>` with Server Action

## Test cases

Integration in `apps/web/__tests__/`:
- [ ] `cart-server-actions.test.ts`: addToCart creates Cart + CartItem; sets cookie if absent
- [ ] addToCart with same productId+variantId increments quantity (no duplicate rows)
- [ ] removeCartItem deletes; only the session's own cart can be modified

Skipping React render tests in this slice; they need jsdom setup. Manual verification covers the UI.

## Risks

1. **Cookie reading in Server Actions** — `cookies()` from `next/headers` is available; needs `await` in Next 15. Verify pattern during execution.
2. **revalidatePath specificity** — the PDP path needs to refresh the cart count after addToCart. `revalidatePath('/')` would invalidate too much; use `revalidatePath('/cart')` and rely on layout-level refresh for the header badge (which is also re-rendered server-side per request since the page is dynamic).
3. **Decimal price math** — line subtotal calculations must use Decimal arithmetic, not floating-point. Prisma returns Decimals as strings; convert with care.

---

## Tasks

1. Cart server actions + cookie helper
2. Cart route + render
3. Header component + layout integration
4. PDP form wire-up
5. Integration tests + cold-state + commit
