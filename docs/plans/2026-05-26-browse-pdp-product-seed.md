# Vendoora — Browse + PDP + Product Seed

> Inline execution. Makes the site navigable: click a category → see products → click a product → see details.

**Goal:** Three coordinated additions:
1. **Sample seed data** — 3 sellers + 18 products (1-2 per category) with variants and image stub URLs, so browse pages aren't empty
2. **Category browse page** at `apps/web/app/c/[slug]/page.tsx` — lists active PUBLISHED products in that category with seller name, price, condition, KYC tier badge, trust pills (per Polish_Phase_Addendum §1.1)
3. **Product detail page (PDP)** at `apps/web/app/p/[sellerSlug]/[productSlug]/page.tsx` — product images, variants picker, description, price, "How this order is protected" trust panel (Polish_Phase_Addendum §1.2), seller summary, similar products row

Plus a small homepage tweak: the existing categories grid links to `/c/[slug]` (already there); the homepage gains a "Just listed today" row showing 6 most-recently-created products from the seed (per Polish_Phase_Addendum §2A.5 Liberia homepage improvements).

---

**Date:** 2026-05-26
**Estimated complexity:** L
**Phase:** P2 Core Marketplace (Playbook §4.1.3 — buyer browsing, partial)
**Estimated session time:** 3-4 hours

## Approach

**Phase 1 — Sample data seed** (most of the value, smallest code surface):

Append a `SAMPLE_SELLERS` + `SAMPLE_PRODUCTS` data block to `packages/db/prisma/seed.ts`. The seed is idempotent (upserts by `business_slug` and `(seller_id, slug)`).

Three sellers covering different KYC tiers:
- **Konah Boutique** (T3 verified — apparel, fashion, fabrics)
- **Sundayma Foods** (T4 elite — Liberian food + spices)
- **Mariama's Liberian Crafts** (T3 verified — arts, crafts, fabrics)

Products distributed across 8 of the 12 seeded categories: Fashion (4), Food & Drink (4), Beauty (2), Electronics (2), Arts & Crafts (4), Home & Garden (1), Children (1). 18 total. Each has:
- Realistic Liberian-market name + description
- `base_price` in USD per spec defaults
- `condition: NEW` (some `LIKE_NEW` for crafts)
- `status: PUBLISHED`, `moderation_status: APPROVED`
- 1-2 variants where applicable (size for clothing, weight for food)
- 1-3 image URLs pointing at picsum.photos (deterministic by seed) until R2 lands

Stub image URLs: `https://picsum.photos/seed/${slug}-${idx}/800/800` — deterministic, free, no R2 wiring needed.

**Phase 2 — Browse page `app/c/[slug]/page.tsx`:**

Next.js 15 server component, dynamic route. Fetches:
- The category by slug (404 if not found)
- Products in that category where `status = PUBLISHED` and `moderation_status = APPROVED` and `deleted_at IS NULL` (per Build_Prompt §11.7 search rules), ordered by `created_at desc`
- Each product joins its seller (for KYC tier badge) and primary image

Renders a 2/3/4-col responsive grid of ProductCard components (inline, no packages/ui yet). Each card shows:
- Primary image (16:9 aspect ratio, lazy-loaded by Next/Image)
- Product name
- Seller name + KYC tier badge (T2/T3/T4 styled per Polish_Phase_Addendum §1.1)
- Condition pill (NEW / LIKE_NEW with green/blue treatment)
- Price (USD primary; LRD conversion left for the geo-routing slice)
- Trust pills: `ESCROW` (blue) + `CODE` (red) at the bottom

Header strip with category name + count + filter placeholders.

**Phase 3 — PDP `app/p/[sellerSlug]/[productSlug]/page.tsx`:**

Server component. Fetches:
- The seller by `business_slug` (404 if not found)
- The product by `(seller_id, slug)` (404 if not found)
- Product variants, images, category, and the seller summary (KYC tier, rating, total orders)

Renders the full product detail per the prototype:
- Left: image gallery (primary + thumbs)
- Right: name, seller (linked to /store/[slug]), price, condition, variants picker (HTML select for now), warranty/return policy summary, "Add to cart" stub button (does nothing yet)
- Below: "How this order is protected" — the 4-step navy panel from Polish_Phase_Addendum §1.2
- Below: seller summary card
- Below: "More from this seller" row (stub or real, time permitting)

**Phase 4 — Homepage "Just listed today" row:**

Update `apps/web/app/page.tsx` to fetch 6 most-recently-created products and render a row of small product cards between the trust strip and the categories grid. Per Polish_Phase_Addendum §2A.5 the Liberia-audience version of the homepage has this section; we add the unified version for now (audience routing comes later).

## Scope

- [ ] Sample product seed (3 sellers + 18 products + variants + images), idempotent
- [ ] `apps/web/app/c/[slug]/page.tsx` — category browse page (server component)
- [ ] `apps/web/app/p/[sellerSlug]/[productSlug]/page.tsx` — PDP (server component)
- [ ] `apps/web/components/ProductCard.tsx` — shared inline component for the card shape
- [ ] Homepage: add "Just listed today" row above categories
- [ ] 4-5 integration tests: category-route renders + correct product count, PDP renders + 404 on missing slug, "Just listed" returns latest 6 products
- [ ] Cold-state passes; `pnpm build` succeeds

## Out of scope

- **Real images via Cloudflare R2** — using picsum.photos until R2 lands (P1.3.7)
- **Add to cart functionality** — button is stub; cart logic is P2.1.5
- **Search bar** — Postgres tsvector + GIN landing in a search slice
- **Filters** (price, seller tier, rating) — separate slice
- **Geo-routing pill / LRD pricing** — Polish_Phase_Addendum §2A in its own slice
- **Lucide icons** — emoji fallbacks still in place
- **Reviews on PDP** — review aggregate display defers until we have sample reviews seeded
- **Seller storefront page `/store/[slug]`** — defer; PDP links to it as a placeholder
- **Promoted listings, featured product placement** — defer

## Files to be created

- `apps/web/app/c/[slug]/page.tsx`
- `apps/web/app/p/[sellerSlug]/[productSlug]/page.tsx`
- `apps/web/components/ProductCard.tsx`
- `apps/web/components/TrustPills.tsx` — small reusable for ESCROW/CODE/KYC badges
- `apps/web/__tests__/browse-page.test.ts`

## Files to be modified

- `packages/db/prisma/seed.ts` — append SAMPLE_SELLERS + SAMPLE_PRODUCTS + variants + images
- `apps/web/app/page.tsx` — add "Just listed today" row
- `apps/web/__tests__/db-integration.test.ts` — extend with `prisma.product.count() >= 18`

## Tests

- [ ] Seed: `prisma.product.count() >= 18` after seed
- [ ] Browse page: `/c/fashion` renders with all 4 fashion products
- [ ] Browse page: `/c/nonexistent-slug` returns 404
- [ ] PDP: `/p/konah-boutique/<some-product-slug>` renders with product name + seller name in HTML
- [ ] PDP: `/p/konah-boutique/nonexistent` returns 404
- [ ] Homepage: "Just listed today" section contains 6 product links

## Risks

1. **Next 15 dynamic routes with async params** — Next 15 changed params to be a Promise. The route signature is `{ params: Promise<{ slug: string }> }` and the component needs to `await params`. Verify this against the latest Next docs during execution.
2. **Image domains in next.config.mjs** — `next/image` requires explicit `images.remotePatterns` for external hosts. Add `picsum.photos` there.
3. **18-product seed is small but adds 25+ test-fixture inserts.** Keep the seed code well-organized so the 18 products don't become spaghetti.

---

## Tasks

### Task 1 — Sample product seed
Append SAMPLE_SELLERS, SAMPLE_PRODUCTS, SAMPLE_VARIANTS, SAMPLE_IMAGES to `seed.ts`. Idempotent upserts. RED test: `prisma.product.count() >= 18` fails (currently 0). Add seed code. GREEN.

### Task 2 — ProductCard + TrustPills components

### Task 3 — Browse page `app/c/[slug]/page.tsx`

### Task 4 — PDP `app/p/[sellerSlug]/[productSlug]/page.tsx`

### Task 5 — Homepage "Just listed today" row + image domain config

### Task 6 — Cold-state + commit + merge
