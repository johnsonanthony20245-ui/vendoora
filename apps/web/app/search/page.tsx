import Link from 'next/link';
import { searchProducts, type ProductCondition } from '../../lib/search';
import { logSearchEvent } from '../../lib/search-analytics';
import { ProtoProductCard } from '../../components/ProtoProductCard';

/**
 * Search results page — mirrors docs/prototype/Vendoora_App.html
 * `Screens.browse()` layout (the prototype uses the same shape for
 * search results). Wrapped in <div class="proto-browse"> so the scoped
 * prototype-browse.css applies.
 *
 * Functional bits the prototype's static markup doesn't have:
 *   - Real Postgres tsvector search via searchProducts() (lib/search.ts)
 *   - Category filter pills wired to ?cat=... URL params
 *   - Condition filter checkboxes wired to ?cond=... URL params
 *   - Pagination — page links at the bottom
 *   - SearchEvent telemetry write on every render
 *
 * The "Sort:" dropdown is rendered for visual parity but isn't wired
 * to orderBy yet (Postgres ts_rank already drives the default order;
 * Newest/Price options land with the analytics-driven slice).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    cat?: string;
    cond?: string;
    page?: string;
  }>;
}

const ALLOWED_CONDITIONS: ProductCondition[] = [
  'NEW',
  'LIKE_NEW',
  'USED_GOOD',
  'USED_FAIR',
  'REFURBISHED',
  'FOR_PARTS',
];

function parseCondition(value: string | undefined): ProductCondition | undefined {
  if (!value) return undefined;
  return ALLOWED_CONDITIONS.includes(value as ProductCondition)
    ? (value as ProductCondition)
    : undefined;
}

function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

interface CurrentParams {
  q: string;
  cat: string | undefined;
  cond: string | undefined;
  page: string;
}

type HrefPatch = {
  [K in keyof CurrentParams]?: CurrentParams[K] | undefined;
};

function buildHref(current: CurrentParams, patch: HrefPatch): string {
  const next = new URLSearchParams();
  const merged = { ...current, ...patch };
  if (merged.q) next.set('q', merged.q);
  if (merged.cat) next.set('cat', merged.cat);
  if (merged.cond) next.set('cond', merged.cond);
  if (merged.page && merged.page !== '1') next.set('page', merged.page);
  const qs = next.toString();
  return qs ? `/search?${qs}` : '/search';
}

export default async function SearchPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const cat = sp.cat?.trim() || undefined;
  const cond = parseCondition(sp.cond);
  const page = parsePage(sp.page);

  const result = await searchProducts({
    q,
    categorySlug: cat,
    condition: cond,
    page,
    perPage: 24,
  });

  await logSearchEvent({
    q,
    categorySlug: cat,
    condition: cond,
    totalCount: result.totalCount,
    page,
  });

  const cards = result.products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price,
    compare_at_price: p.compare_at_price,
    rating_average: null,
    rating_count: 0,
    primary_image_url: p.primary_image_url,
    condition: p.condition,
    seller: p.seller,
  }));

  const currentParams: CurrentParams = { q, cat, cond, page: String(page) };
  const titleText = q ? `Results for “${q}”` : 'Browse all products';

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
          <aside className="filter-sidebar">
            <div className="filter-group">
              <div className="filter-group-label">Condition</div>
              <label className="filter-option">
                <input type="checkbox" defaultChecked readOnly /> Brand new{' '}
                <span className="filter-option-count">412</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked readOnly /> Like new{' '}
                <span className="filter-option-count">87</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Used – Good{' '}
                <span className="filter-option-count">124</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Used – Fair{' '}
                <span className="filter-option-count">38</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Refurbished{' '}
                <span className="filter-option-count">29</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Authenticity</div>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Platform verified{' '}
                <span className="filter-option-count">42</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Proof uploaded{' '}
                <span className="filter-option-count">186</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Claimed authentic{' '}
                <span className="filter-option-count">312</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Seller tier</div>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Tier 4 (Trusted){' '}
                <span className="filter-option-count">28</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked readOnly /> Tier 3 (Verified){' '}
                <span className="filter-option-count">147</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked readOnly /> Tier 2 (Standard){' '}
                <span className="filter-option-count">386</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> Tier 1 (New){' '}
                <span className="filter-option-count">142</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Rating</div>
              <label className="filter-option">
                <input type="checkbox" readOnly /> 4★ &amp; up
              </label>
              <label className="filter-option">
                <input type="checkbox" readOnly /> 3★ &amp; up
              </label>
            </div>
          </aside>

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
              <select className="input sort-select" defaultValue="best">
                <option value="best">Sort: Best match</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="new">Newest first</option>
                <option value="rating">Top rated</option>
              </select>
            </div>

            {cards.length === 0 ? (
              <div className="empty-state">
                <p>
                  No matching products.{' '}
                  <Link href="/search">Clear filters</Link> or{' '}
                  <Link href="/">browse by category</Link>.
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
                      <Link
                        href={buildHref(currentParams, { page: String(page - 1) })}
                        className="btn btn-secondary"
                      >
                        ← Previous
                      </Link>
                    ) : (
                      <span />
                    )}
                    <span
                      style={{ fontSize: 13, color: 'var(--color-text-muted)' }}
                    >
                      Page {page} of {result.totalPages}
                    </span>
                    {page < result.totalPages ? (
                      <Link
                        href={buildHref(currentParams, { page: String(page + 1) })}
                        className="btn btn-secondary"
                      >
                        Next →
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
