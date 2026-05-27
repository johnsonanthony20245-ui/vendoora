import Link from 'next/link';
import {
  searchProducts,
  getFacetCounts,
  type SortOption,
} from '../../lib/search';
import { logSearchEvent } from '../../lib/search-analytics';
import {
  ProtoFilterSidebar,
  parseFilterParams,
} from '../../components/ProtoFilterSidebar';
import { ProtoSortDropdown } from '../../components/ProtoSortDropdown';
import { ProtoProductCard } from '../../components/ProtoProductCard';

/**
 * Search results page — mirrors prototype `Screens.browse()` shape, driven
 * by Postgres tsvector matching via searchProducts(). Sidebar uses the
 * shared ProtoFilterSidebar with real facet counts; sort drives orderBy.
 *
 * URL shape: /search?q=rice&cond=NEW,LIKE_NEW&tier=3,2&auth=PROOF_PROVIDED&rating=4&sort=price-asc&page=2
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
  searchParams: Promise<{
    q?: string;
    cat?: string;
    cond?: string;
    tier?: string;
    auth?: string;
    rating?: string;
    sort?: string;
    page?: string;
  }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const cat = sp.cat?.trim() || undefined;
  const filterState = parseFilterParams(sp);
  const sort: SortOption = VALID_SORTS.has(sp.sort as SortOption)
    ? (sp.sort as SortOption)
    : 'best';
  const pageNum = Number(sp.page);
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;

  const searchFilters = {
    q,
    categorySlug: cat,
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

  await logSearchEvent({
    q,
    categorySlug: cat,
    condition: filterState.conditions[0],
    totalCount: result.totalCount,
    page,
  });

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

  const basePath = '/search';
  const preservedParams: Record<string, string | undefined> = {};
  if (q) preservedParams['q'] = q;
  if (cat) preservedParams['cat'] = cat;
  if (sort !== 'best') preservedParams['sort'] = sort;

  const titleText = q ? `Results for "${q}"` : 'Browse all products';

  function pageUrl(targetPage: number): string {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (cat) params.set('cat', cat);
    if (filterState.conditions.length > 0) params.set('cond', filterState.conditions.join(','));
    if (filterState.sellerTiers.length > 0) params.set('tier', filterState.sellerTiers.join(','));
    if (filterState.authenticities.length > 0) params.set('auth', filterState.authenticities.join(','));
    if (filterState.minRating > 0) params.set('rating', String(filterState.minRating));
    if (sort !== 'best') params.set('sort', sort);
    if (targetPage > 1) params.set('page', String(targetPage));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div className="proto-browse">
      <div className="screen-container">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">
            {q ? `Search: ${q}` : 'All products'}
          </span>
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
                  {titleText}
                </h1>
                <div className="browse-results-count">
                  {result.totalCount === 0
                    ? 'No matches'
                    : `${result.totalCount} ${result.totalCount === 1 ? 'product' : 'products'} · Verified sellers only`}
                </div>
              </div>
              <ProtoSortDropdown basePath={basePath} current={sort} />
            </div>

            {cards.length === 0 ? (
              <div className="empty-state">
                <p>
                  No matching products. <Link href="/search">Clear filters</Link>{' '}
                  or <Link href="/">browse by category</Link>.
                </p>
              </div>
            ) : (
              <>
                <div className="product-grid">
                  {cards.map((p) => (
                    <ProtoProductCard key={p.id} product={p} />
                  ))}
                </div>

                {result.totalPages > 1 && (
                  <nav
                    aria-label="Search pagination"
                    style={{
                      marginTop: 'var(--space-8)',
                      display: 'flex',
                      gap: 'var(--space-3)',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    {page > 1 ? (
                      <Link href={pageUrl(page - 1)} className="btn btn-secondary">
                        &larr; Previous
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                      Page {page} of {result.totalPages}
                    </span>
                    {page < result.totalPages ? (
                      <Link href={pageUrl(page + 1)} className="btn btn-secondary">
                        Next &rarr;
                      </Link>
                    ) : (
                      <span />
                    )}
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
