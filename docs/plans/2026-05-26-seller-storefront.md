# Vendoora — Seller Storefront `/store/[slug]`

> Inline execution. Closes the PDP's 404 link to the seller.

**Goal:** Build the public seller storefront at `/store/[slug]`. Hero with business name + KYC tier + rating + tenure, "All products" grid using the existing `ProductCard`, a small trust strip ("delivered on time", "code-verified rate", "active since"). No new schema, no new server actions.

After this slice the seller link on the PDP works ("by **Konah Boutique** [T3]" → `/store/konah-boutique`).

---

**Date:** 2026-05-26
**Estimated complexity:** S
**Phase:** P2 Core Marketplace (Playbook §4.1.3 buyer browsing, seller storefront partial)
**Estimated session time:** 1-2 hours

## Approach

Single server component at `apps/web/app/store/[slug]/page.tsx`:

1. Look up seller by `business_slug` (404 if missing or `is_suspended` or `deleted_at`).
2. Load PUBLISHED + APPROVED + not-soft-deleted products for that seller, with primary image.
3. Render:
   - **Hero**: business name in Inter Tight 800, optional Fraunces italic tagline (`business_description` from DB), KYC tier badge, star rating, total orders, active-since date.
   - **Trust strip**: on-time rate, dispute-free rate, total orders. Three small stat tiles.
   - **Products grid**: reuse `ProductCard`. Empty state if seller has no published products.
4. Optional: small "Message seller" button (stubbed — messaging lands in P4 seller console).

## Scope

- [ ] `apps/web/app/store/[slug]/page.tsx` — server component
- [ ] Hero + trust strip + product grid using existing components
- [ ] 404 for missing/suspended/deleted sellers
- [ ] Integration test: storefront renders for known seller; 404 for unknown slug

## Out of scope

- Real "Message seller" thread (P4)
- Seller-page-level filters (price, condition)
- Per-store featured products / pinned-position section (Polish_Phase_Addendum §1.16 + §4.17 — needs the `pinned_position` field + the SaaS tier entitlement engine; defer)
- Reviews aggregate on storefront (Polish_Phase_Addendum §1.14) — needs review seed data + ReviewAggregate hydration; defer to a reviews-display slice
- Store hours, store banner, store theme customization — defer

## Files to be created

- `apps/web/app/store/[slug]/page.tsx`
- `apps/web/__tests__/storefront-render.test.ts` — small smoke test

## Files to be modified

- None (PDP already links to `/store/[seller.business_slug]`)

## Tests

- [ ] Storefront renders for `konah-boutique` with the seeded business_name + at least 1 product card
- [ ] Storefront 404s for unknown slug
- [ ] Storefront 404s when seller is suspended
- [ ] Hides products that are DRAFT / not-APPROVED / soft-deleted

## Risks

1. **Tenure date display**: `Seller.created_at` is when the row was written, not when the seller signed up in the real world. Acceptable for now; document the eventual swap to a `joined_at` semantic.
2. **Rating star display when `rating_average` is null**: handle gracefully (don't show stars, show "new seller" instead).
