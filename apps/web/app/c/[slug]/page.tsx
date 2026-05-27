import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vendoora/db';
import {
  searchProducts,
  getFacetCounts,
  type SortOption,
} from '../../../lib/search';
import {
  ProtoFilterSidebar,
  parseFilterParams,
} from '../../../components/ProtoFilterSidebar';
import { ProtoSortDropdown } from '../../../components/ProtoSortDropdown';
import { ProtoProductCard } from '../../../components/ProtoProductCard';

/**
 * Category browse page — mirrors prototype `Screens.browse()`.
 *
 * Sidebar checkboxes drive real URL-encoded multi-select filters
 * (cond=NEW,LIKE_NEW · tier=3,2 · auth=PROOF_PROVIDED · rating=4).
 * Counts come from getFacetCounts(); sort dropdown drives orderBy.
 */
export const dynamic = 'force-dynamic';

const VALID_SORTS = new Set<SortOption>([
  'best',
  'price-asc',
  'price-desc',
  'new',
  'rating',
]);

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    cond?: string;
    tier?: string;
    auth?: string;
    rating?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const filterState = parseFilterParams(sp);
  const sort: SortOption = VALID_SORTS.has(sp.sort as SortOption)
    ? (sp.sort as SortOption)
    : 'best';
  const pageNum = Number(sp.page);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;

  const searchFilters = {
    categorySlug: slug,
    conditions: filterState.conditions.length > 0 ? filterState.conditions : undefined,
    sellerTiers: filterState.sellerTiers.length > 0 ? filterState.sellerTiers : undefined,
    authenticities:
      filterState.authenticities.length > 0 ? filterState.authenticities : undefined,
    minRating: filterState.minRating > 0 ? filterState.minRating : undefined,
    sort,
    page,
    perPage: 24,
  };

  const [result, facetCounts] = await Promise.all([
    searchProducts(searchFilters),
    getFacetCounts(searchFilters),
  ]);

  const cards = result.products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price,
    compare_at_price: p.compare_at_price,
    rating_average: p.rating_average,
    rating_count: p.rating_count,
    primary_image_url: p.primary_image_url,
    is_featured: p.is_featured,
    authenticity_status: p.authenticity_status,
    condition: p.condition,
    seller: p.seller,
  }));

  const basePath = `/c/${slug}`;
  const preservedParams: Record<string, string | undefined> = sort !== 'best' ? { sort } : {};

  return (
    <div className="proto-browse">
      <div className="screen-container">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{category.name}</span>
        </div>

        <div className="browse-layout">
          <ProtoFilterSidebar
            basePath={basePath}
            preservedParams={preservedParams}
            state={filterState}
            counts={facetCounts}
          />

          <div>
            <div className="browse-toolbar">
              <div>
                <h1 className="screen-title" style={{ fontSize: 24, marginBottom: 4 }}>
                  {category.name}
                </h1>
                <div className="browse-results-count">
                  {result.totalCount}{' '}
                  {result.totalCount === 1 ? 'product' : 'products'} · Verified
                  sellers only
                </div>
              </div>
              <ProtoSortDropdown basePath={basePath} current={sort} />
            </div>

            {cards.length === 0 ? (
              <div className="empty-state">
                <p>No products match the current filters.</p>
              </div>
            ) : (
              <div className="product-grid">
                {cards.map((p) => (
                  <ProtoProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
