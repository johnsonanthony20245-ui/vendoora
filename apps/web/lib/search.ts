/**
 * Full-text product search across PUBLISHED + APPROVED + non-deleted products.
 *
 * Uses the Postgres `products.search_tsv` generated column (see migration
 * 20260527052330_add_product_search_tsvector). The column concatenates
 * setweight(name, 'A') || setweight(description, 'B') so title matches
 * outrank description matches via the default ts_rank weights.
 *
 * Two execution paths:
 *   - q empty/whitespace -> standard prisma.findMany ordered by created_at desc
 *   - q has content      -> $queryRaw rank, then findMany by id, re-ordered in TS
 *
 * Filter clauses (categorySlug, condition) apply to both paths.
 */
import { Prisma, prisma } from '@vendoora/db';

const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 60;

export type ProductCondition =
  | 'NEW'
  | 'LIKE_NEW'
  | 'USED_GOOD'
  | 'USED_FAIR'
  | 'REFURBISHED'
  | 'FOR_PARTS';

export interface SearchFilters {
  q?: string | undefined;
  categorySlug?: string | undefined;
  condition?: ProductCondition | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface SearchProductHit {
  id: string;
  slug: string;
  name: string;
  base_price: string;
  compare_at_price: string | null;
  condition: string;
  category_slug: string;
  seller: {
    business_slug: string;
    business_name: string;
    kyc_tier: number;
  };
  primary_image_url: string | null;
}

export interface SearchResult {
  products: SearchProductHit[];
  totalCount: number;
  page: number;
  perPage: number;
  totalPages: number;
}

const BASE_INCLUDE = {
  seller: { select: { business_slug: true, business_name: true, kyc_tier: true } },
  category: { select: { slug: true } },
  images: {
    where: { is_primary: true },
    take: 1,
    select: { url: true },
  },
} as const;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof BASE_INCLUDE }>;

function toHit(p: ProductWithRelations): SearchProductHit {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price.toString(),
    compare_at_price: p.compare_at_price ? p.compare_at_price.toString() : null,
    condition: p.condition,
    category_slug: p.category.slug,
    seller: p.seller,
    primary_image_url: p.images[0]?.url ?? null,
  };
}

function clampPerPage(value: number | undefined): number {
  if (!value || value < 1) return DEFAULT_PER_PAGE;
  if (value > MAX_PER_PAGE) return MAX_PER_PAGE;
  return Math.floor(value);
}

function clampPage(value: number | undefined): number {
  if (!value || value < 1) return 1;
  return Math.floor(value);
}

export async function searchProducts(filters: SearchFilters = {}): Promise<SearchResult> {
  const q = (filters.q ?? '').trim();
  const page = clampPage(filters.page);
  const perPage = clampPerPage(filters.perPage);
  const skip = (page - 1) * perPage;

  const baseWhere: Prisma.ProductWhereInput = {
    status: 'PUBLISHED',
    moderation_status: 'APPROVED',
    deleted_at: null,
  };
  if (filters.categorySlug) {
    baseWhere.category = { slug: filters.categorySlug };
  }
  if (filters.condition) {
    baseWhere.condition = filters.condition;
  }

  // No-query path: browse with optional filters, ordered by recency.
  if (q.length === 0) {
    const [rows, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: baseWhere,
        include: BASE_INCLUDE,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
      }),
      prisma.product.count({ where: baseWhere }),
    ]);

    return {
      products: rows.map(toHit),
      totalCount,
      page,
      perPage,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / perPage),
    };
  }

  // Query path: rank by ts_rank, then load + re-order.
  //
  // We compose the whole query as one Prisma.Sql and pass it as the single
  // argument to $queryRaw (not the tagged-template form). This avoids subtle
  // parameter-numbering bugs that surfaced under Next.js dev's SWC build but
  // not under vitest's tsx/esbuild — same code, two slightly different
  // template-tag emit paths.
  const categoryFilter = filters.categorySlug
    ? Prisma.sql`AND c.slug = ${filters.categorySlug}`
    : Prisma.empty;
  const conditionFilter = filters.condition
    ? Prisma.sql`AND p.condition::text = ${filters.condition}`
    : Prisma.empty;

  const rankExpr = Prisma.sql`ts_rank(p."search_tsv", websearch_to_tsquery('english', ${q}))`;

  const rankedQuery = Prisma.sql`
    SELECT p.id
    FROM "products" p
    INNER JOIN "categories" c ON p."category_id" = c.id
    WHERE p."status"::text = 'PUBLISHED'
      AND p."moderation_status"::text = 'APPROVED'
      AND p."deleted_at" IS NULL
      AND p."search_tsv" @@ websearch_to_tsquery('english', ${q})
      ${categoryFilter}
      ${conditionFilter}
    ORDER BY ${rankExpr} DESC, p."created_at" DESC
  `;
  const ranked = await prisma.$queryRaw<Array<{ id: string }>>(rankedQuery);

  const totalCount = ranked.length;
  if (totalCount === 0) {
    return { products: [], totalCount: 0, page, perPage, totalPages: 0 };
  }

  const idsForPage = ranked.slice(skip, skip + perPage).map((r) => r.id);
  if (idsForPage.length === 0) {
    return {
      products: [],
      totalCount,
      page,
      perPage,
      totalPages: Math.ceil(totalCount / perPage),
    };
  }

  const rows = await prisma.product.findMany({
    where: { id: { in: idsForPage } },
    include: BASE_INCLUDE,
  });

  // findMany doesn't preserve the order we passed; rebuild from the ranked list.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = idsForPage
    .map((id) => byId.get(id))
    .filter((p): p is ProductWithRelations => p !== undefined);

  return {
    products: ordered.map(toHit),
    totalCount,
    page,
    perPage,
    totalPages: Math.ceil(totalCount / perPage),
  };
}
