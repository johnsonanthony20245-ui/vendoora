-- Add a Postgres-managed full-text-search column to the products table.
--
-- The column is GENERATED ALWAYS AS (..) STORED, so Postgres maintains it
-- automatically on every insert/update — application code never writes to it.
--
-- setweight() gives title matches an 'A' rank (1.0) and description matches a
-- 'B' rank (0.4), so ts_rank() naturally orders title hits ahead of description
-- hits when the same query word lands in both fields.
--
-- Reads use prisma.$queryRaw with websearch_to_tsquery — see apps/web/lib/search.ts.

ALTER TABLE "products"
  ADD COLUMN "search_tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "products_search_tsv_idx" ON "products" USING GIN ("search_tsv");
