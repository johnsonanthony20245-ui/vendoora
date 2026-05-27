-- Add the SearchEvent telemetry table for /admin/search-insights.
--
-- Prisma's auto-generated migration also included a DROP INDEX +
-- ALTER COLUMN DROP DEFAULT against products.search_tsv. Those lines
-- were removed by hand because:
--   1. The GIN index products_search_tsv_idx is correct and must stay.
--   2. search_tsv is a Postgres GENERATED ALWAYS AS column; Postgres
--      refuses ALTER COLUMN ... DROP DEFAULT on generated columns
--      (E42601). The "drift" Prisma detects is the Unsupported field
--      not preserving GENERATED semantics — a known limitation flagged
--      in docs/plans/2026-05-27-search-tsvector.md.

-- CreateTable
CREATE TABLE "search_events" (
    "id" TEXT NOT NULL,
    "q" TEXT NOT NULL,
    "category_slug" TEXT,
    "condition" TEXT,
    "total_count" INTEGER NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 1,
    "anon_session_id" TEXT,
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_events_q_idx" ON "search_events"("q");

-- CreateIndex
CREATE INDEX "search_events_total_count_idx" ON "search_events"("total_count");

-- CreateIndex
CREATE INDEX "search_events_created_at_idx" ON "search_events"("created_at");
