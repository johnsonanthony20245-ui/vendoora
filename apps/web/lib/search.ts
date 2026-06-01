/**
 * Full-text product search across PUBLISHED + APPROVED + non-deleted products.
 *
 * Uses the Postgres `products.search_tsv` generated column (see migration
 * 20260527052330_add_product_search_tsvector). The column concatenates
 * setweight(name, 'A') || setweight(description, 'B') so title matches
 * outrank description matches via the default ts_rank weights.
 *
 * Two execution paths:
 *   - q empty/whitespace -> standard prisma.findMany ordered by sort
 *   - q has content      -> $queryRaw rank, then findMany by id, re-ordered in TS
 *
 * Filters supported (all optional, all combine with AND):
 *   - categorySlug    — single category match
 *   - conditions[]    — OR-set of ProductCondition enum values
 *   - sellerTiers[]   — OR-set of integer KYC tiers (1..4)
 *   - authenticities[] — OR-set of AuthenticityStatus enum values
 *   - minRating       — rating_average >= N
 *
 * Sort options:
 *   - 'best'      ts_rank when there's a query, created_at desc otherwise
 *   - 'price-asc' base_price asc
 *   - 'price-desc' base_price desc
 *   - 'new'       created_at desc
 *   - 'rating'    rating_average desc nulls last
 */
import { Prisma, prisma } from '@vendoora/db';
import { resolveProductImageUrl } from './r2';

const DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 60;

export type ProductCondition =
  | 'NEW'
  | 'LIKE_NEW'
  | 'USED_GOOD'
  | 'USED_FAIR'
  | 'REFURBISHED'
  | 'FOR_PARTS';

export type AuthenticityStatus =
  | 'PLATFORM_VERIFIED'
  | 'PROOF_PROVIDED'
  | 'CLAIMED'
  | 'UNCLAIMED';

export type SortOption = 'best' | 'price-asc' | 'price-desc' | 'new' | 'rating';

export interface SearchFilters {
  q?: string | undefined;
  categorySlug?: string | undefined;
  conditions?: ProductCondition[] | undefined;
  sellerTiers?: number[] | undefined;
  authenticities?: AuthenticityStatus[] | undefined;
  minRating?: number | undefined;
  sort?: SortOption | undefined;
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
  rating_average: number | null;
  rating_count: number;
  authenticity_status: string;
  is_featured: boolean;
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

async function toHit(p: ProductWithRelations): Promise<SearchProductHit> {
  // `images[0].url` is a dual-purpose field: full https URLs for seed data,
  // R2 object keys for seller uploads (PR #25). Resolve every hit here so
  // browse/search result cards render bytes for both shapes. See lib/r2.ts.
  const raw = p.images[0]?.url ?? null;
  const primary_image_url = raw ? await resolveProductImageUrl(raw) : null;

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price.toString(),
    compare_at_price: p.compare_at_price ? p.compare_at_price.toString() : null,
    condition: p.condition,
    category_slug: p.category.slug,
    rating_average: p.rating_average,
    rating_count: p.rating_count,
    authenticity_status: p.authenticity_status,
    is_featured: p.is_featured,
    seller: p.seller,
    primary_image_url,
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

/**
 * Build the shared Prisma `where` clause that both the result query and the
 * facet-count helpers use. Pulled out so a facet-count helper that wants to
 * exclude one dimension can omit just that dimension.
 */
export function buildBaseWhere(filters: SearchFilters, omit?: keyof SearchFilters): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {
    status: 'PUBLISHED',
    moderation_status: 'APPROVED',
    deleted_at: null,
  };
  if (filters.categorySlug && omit !== 'categorySlug') {
    where.category = { slug: filters.categorySlug };
  }
  if (filters.conditions && filters.conditions.length > 0 && omit !== 'conditions') {
    where.condition = { in: filters.conditions };
  }
  if (filters.sellerTiers && filters.sellerTiers.length > 0 && omit !== 'sellerTiers') {
    where.seller = { is: { kyc_tier: { in: filters.sellerTiers } } };
  }
  if (filters.authenticities && filters.authenticities.length > 0 && omit !== 'authenticities') {
    where.authenticity_status = { in: filters.authenticities };
  }
  if (filters.minRating !== undefined && filters.minRating > 0 && omit !== 'minRating') {
    where.rating_average = { gte: filters.minRating };
  }
  return where;
}

/** Map a sort key to a Prisma orderBy for the no-query browse path. */
function orderByForSort(sort: SortOption | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'price-asc':
      return [{ base_price: 'asc' }, { created_at: 'desc' }];
    case 'price-desc':
      return [{ base_price: 'desc' }, { created_at: 'desc' }];
    case 'new':
      return [{ created_at: 'desc' }];
    case 'rating':
      return [{ rating_average: { sort: 'desc', nulls: 'last' } }, { created_at: 'desc' }];
    case 'best':
    default:
      // No-query 'best' falls back to recency.
      return [{ is_featured: 'desc' }, { rating_average: { sort: 'desc', nulls: 'last' } }, { created_at: 'desc' }];
  }
}

export async function searchProducts(filters: SearchFilters = {}): Promise<SearchResult> {
  const q = (filters.q ?? '').trim();
  const page = clampPage(filters.page);
  const perPage = clampPerPage(filters.perPage);
  const skip = (page - 1) * perPage;

  const baseWhere = buildBaseWhere(filters);

  // No-query path: standard prisma.findMany with sort.
  if (q.length === 0) {
    const [rows, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: baseWhere,
        include: BASE_INCLUDE,
        orderBy: orderByForSort(filters.sort),
        skip,
        take: perPage,
      }),
      prisma.product.count({ where: baseWhere }),
    ]);

    return {
      products: await Promise.all(rows.map(toHit)),
      totalCount,
      page,
      perPage,
      totalPages: totalCount === 0 ? 0 : Math.ceil(totalCount / perPage),
    };
  }

  // Query path: rank by ts_rank, then load + re-order. Sort 'best' uses
  // ts_rank; other sorts override the rank ordering but still use the
  // ts_query for filtering.
  const sql = buildRankedQuerySql(filters, q);
  const ranked = await prisma.$queryRaw<Array<{ id: string }>>(sql);

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

  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = idsForPage
    .map((id) => byId.get(id))
    .filter((p): p is ProductWithRelations => p !== undefined);

  return {
    products: await Promise.all(ordered.map(toHit)),
    totalCount,
    page,
    perPage,
    totalPages: Math.ceil(totalCount / perPage),
  };
}

function buildRankedQuerySql(filters: SearchFilters, q: string): Prisma.Sql {
  const categoryClause = filters.categorySlug
    ? Prisma.sql`AND c.slug = ${filters.categorySlug}`
    : Prisma.empty;

  const conditionClause =
    filters.conditions && filters.conditions.length > 0
      ? Prisma.sql`AND p.condition::text IN (${Prisma.join(filters.conditions)})`
      : Prisma.empty;

  const tierClause =
    filters.sellerTiers && filters.sellerTiers.length > 0
      ? Prisma.sql`AND s.kyc_tier IN (${Prisma.join(filters.sellerTiers)})`
      : Prisma.empty;

  const authClause =
    filters.authenticities && filters.authenticities.length > 0
      ? Prisma.sql`AND p.authenticity_status::text IN (${Prisma.join(filters.authenticities)})`
      : Prisma.empty;

  const ratingClause =
    filters.minRating !== undefined && filters.minRating > 0
      ? Prisma.sql`AND p.rating_average >= ${filters.minRating}`
      : Prisma.empty;

  const rankExpr = Prisma.sql`ts_rank(p."search_tsv", websearch_to_tsquery('english', ${q}))`;

  // Sort selection.
  let orderClause: Prisma.Sql;
  switch (filters.sort) {
    case 'price-asc':
      orderClause = Prisma.sql`ORDER BY p.base_price ASC, p.created_at DESC`;
      break;
    case 'price-desc':
      orderClause = Prisma.sql`ORDER BY p.base_price DESC, p.created_at DESC`;
      break;
    case 'new':
      orderClause = Prisma.sql`ORDER BY p.created_at DESC`;
      break;
    case 'rating':
      orderClause = Prisma.sql`ORDER BY p.rating_average DESC NULLS LAST, p.created_at DESC`;
      break;
    case 'best':
    default:
      orderClause = Prisma.sql`ORDER BY ${rankExpr} DESC, p.created_at DESC`;
      break;
  }

  return Prisma.sql`
    SELECT p.id
    FROM "products" p
    INNER JOIN "categories" c ON p."category_id" = c.id
    INNER JOIN "sellers" s     ON p."seller_id"   = s.id
    WHERE p."status"::text = 'PUBLISHED'
      AND p."moderation_status"::text = 'APPROVED'
      AND p."deleted_at" IS NULL
      AND p."search_tsv" @@ websearch_to_tsquery('english', ${q})
      ${categoryClause}
      ${conditionClause}
      ${tierClause}
      ${authClause}
      ${ratingClause}
    ${orderClause}
  `;
}

// ────────────────────────────────────────────────────────────────────────
// Facet counts — drive the sidebar's filter-option-count numbers.
// "Constrained" means: count for this attribute value WITH all other
// active filters applied (Amazon-style). Each call omits only its own
// dimension so toggling that dimension's option recomputes correctly.
// ────────────────────────────────────────────────────────────────────────

export interface FacetCounts {
  conditions: Record<ProductCondition, number>;
  authenticities: Record<AuthenticityStatus, number>;
  sellerTiers: Record<number, number>;
}

export async function getFacetCounts(filters: SearchFilters): Promise<FacetCounts> {
  // For each dimension, count grouped by that dimension's column, with the
  // dimension OMITTED from the where clause so toggling it doesn't zero
  // out its own counts.

  const [conditionRows, authRows, tierRows] = await Promise.all([
    prisma.product.groupBy({
      by: ['condition'],
      where: buildBaseWhere(filters, 'conditions'),
      _count: { _all: true },
    }),
    prisma.product.groupBy({
      by: ['authenticity_status'],
      where: buildBaseWhere(filters, 'authenticities'),
      _count: { _all: true },
    }),
    // Seller tier requires a different shape — group by seller's kyc_tier.
    // Prisma groupBy doesn't follow relations, so we count via a raw join.
    prisma.$queryRaw<Array<{ kyc_tier: number; count: bigint }>>(
      Prisma.sql`
        SELECT s.kyc_tier, COUNT(*)::bigint AS count
        FROM "products" p
        INNER JOIN "sellers" s ON p."seller_id" = s.id
        INNER JOIN "categories" c ON p."category_id" = c.id
        WHERE p."status"::text = 'PUBLISHED'
          AND p."moderation_status"::text = 'APPROVED'
          AND p."deleted_at" IS NULL
          ${filters.categorySlug ? Prisma.sql`AND c.slug = ${filters.categorySlug}` : Prisma.empty}
          ${filters.conditions && filters.conditions.length > 0
            ? Prisma.sql`AND p.condition::text IN (${Prisma.join(filters.conditions)})`
            : Prisma.empty}
          ${filters.authenticities && filters.authenticities.length > 0
            ? Prisma.sql`AND p.authenticity_status::text IN (${Prisma.join(filters.authenticities)})`
            : Prisma.empty}
          ${filters.minRating !== undefined && filters.minRating > 0
            ? Prisma.sql`AND p.rating_average >= ${filters.minRating}`
            : Prisma.empty}
        GROUP BY s.kyc_tier
      `,
    ),
  ]);

  const conditions: FacetCounts['conditions'] = {
    NEW: 0,
    LIKE_NEW: 0,
    USED_GOOD: 0,
    USED_FAIR: 0,
    REFURBISHED: 0,
    FOR_PARTS: 0,
  };
  for (const r of conditionRows) {
    conditions[r.condition as ProductCondition] = r._count._all;
  }

  const authenticities: FacetCounts['authenticities'] = {
    PLATFORM_VERIFIED: 0,
    PROOF_PROVIDED: 0,
    CLAIMED: 0,
    UNCLAIMED: 0,
  };
  for (const r of authRows) {
    authenticities[r.authenticity_status as AuthenticityStatus] = r._count._all;
  }

  const sellerTiers: FacetCounts['sellerTiers'] = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of tierRows) {
    sellerTiers[r.kyc_tier] = Number(r.count);
  }

  return { conditions, authenticities, sellerTiers };
}
