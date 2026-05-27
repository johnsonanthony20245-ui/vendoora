# Vendoora — Search Slice (Postgres tsvector + /search + header bar)

> Inline execution. Polish_Phase_Addendum §1.13 + Engineering_Spec §4.18.

**Goal:** A working search experience across all PUBLISHED+APPROVED products with:
1. Postgres full-text-search column (`search_tsv` `tsvector` generated from `name` + `description`, GIN-indexed)
2. `searchProducts({ q, categorySlug, condition, page, perPage })` helper returning ranked, paginated results
3. `/search?q=...&cat=...&cond=...&page=...` server component with ProductCard grid + filter bar + pagination
4. `<SearchBox/>` client component wired into the persistent `<Header/>` (visible on every page)

**Date:** 2026-05-27
**Estimated complexity:** M
**Phase:** P2 Core Marketplace

## Approach

**Column + index:** Add a `search_tsv` `tsvector` column on `products` that is `GENERATED ALWAYS AS` from `setweight(to_tsvector('english', name), 'A') || setweight(to_tsvector('english', description), 'B')` stored. Index it with GIN. Title matches outrank description matches via ts_rank's default weights (A=1.0, B=0.4).

Prisma exposes the column as `Unsupported("tsvector")?` so drift detection is happy, but reads/writes go through `prisma.$queryRaw`. The column is auto-populated by Postgres on insert/update — no application code needs to maintain it.

**searchProducts helper** — Two paths:
- **No query** (browse-with-filters mode): `prisma.product.findMany` with the filter where-clause, order by `created_at desc`, skip/take for pagination.
- **With query**: `prisma.$queryRaw` ranks IDs by `ts_rank(search_tsv, websearch_to_tsquery('english', q))`, then a second `findMany({ where: { id: { in: ids } } })` loads the full structured data with relations. Re-ordered in TS to preserve rank.

Both paths return the same `SearchResult` shape with `products`, `totalCount`, `page`, `perPage`, `totalPages`.

**`/search` route** — Server component reading typed search params, calling `searchProducts`, rendering:
- Filter bar (category chips + condition chips, clicking toggles)
- Result count + active-filters summary
- ProductCard grid (matches /c/[slug] layout)
- Pagination (Prev / page X of Y / Next)
- Empty state with suggestion to clear filters

**`<SearchBox/>`** — Client component (needs controlled input). GET form posting to `/search?q=...`. Wired into Header so it persists across every page.

## Scope

- [ ] `packages/db/prisma/schema.prisma` — add `search_tsv Unsupported("tsvector")?` to Product
- [ ] `packages/db/prisma/migrations/<ts>_add_product_search_tsvector/migration.sql` — generated column + GIN index
- [ ] `apps/web/lib/search.ts` — `searchProducts()` + types
- [ ] `apps/web/__tests__/search.test.ts` — 7 tests covering finding-by-title, finding-by-description, exclusions, category filter, condition filter, pagination
- [ ] `apps/web/app/search/page.tsx` — search route
- [ ] `apps/web/components/SearchBox.tsx` — client search input
- [ ] `apps/web/components/Header.tsx` — embed SearchBox
- [ ] Verify: type-check + lint + tests + build

## Out of scope

- Search autocomplete / typeahead suggestions
- Fuzzy matching / spell correction (`pg_trgm`)
- Search analytics (track what users search for)
- Saved searches
- Multilingual stemming (only `english` config for now)
- Per-seller search (would need its own slice on the storefront)

## Risks

1. **`Unsupported` field drift:** if Prisma migrate dev decides to "reset" the generated column on schema change, the GIN index could be silently dropped. Mitigation: the migration uses explicit `GENERATED ALWAYS AS` syntax that Prisma can't auto-generate, so any subsequent `migrate dev` will create a new migration to revert it — we'd see it in review.
2. **GIN index size on small dataset:** wasteful for 18 products but the right shape for production. Acceptable.
3. **Empty-query path returns ALL 18 products paginated:** that's the intended "browse with filters only" mode, e.g. `/search?cat=food-drink`.

---

## Tasks

1. Write failing search.test.ts (RED)
2. Add Unsupported field to schema + create migration with GENERATED column + GIN index
3. Implement searchProducts() helper (GREEN)
4. /search route
5. SearchBox client + wire into Header
6. Verify + commit + merge
