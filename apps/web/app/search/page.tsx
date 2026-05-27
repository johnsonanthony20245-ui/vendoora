import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { searchProducts, type ProductCondition } from '../../lib/search';
import { ProductCard, type ProductCardData } from '../../components/ProductCard';
import { SearchBox } from '../../components/SearchBox';

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

const CONDITION_LABEL: Record<ProductCondition, string> = {
  NEW: 'New',
  LIKE_NEW: 'Like new',
  USED_GOOD: 'Used — good',
  USED_FAIR: 'Used — fair',
  REFURBISHED: 'Refurbished',
  FOR_PARTS: 'For parts',
};

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

/** Build a /search URL preserving the given filter set with optional overrides. */
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

  // Load filter chip vocabularies in parallel with the search.
  const [result, categories] = await Promise.all([
    searchProducts({ q, categorySlug: cat, condition: cond, page, perPage: 24 }),
    prisma.category.findMany({
      where: { is_active: true },
      orderBy: { display_order: 'asc' },
      select: { slug: true, name: true },
    }),
  ]);

  const cards: ProductCardData[] = result.products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price,
    compare_at_price: p.compare_at_price,
    condition: p.condition,
    seller: p.seller,
    primary_image_url: p.primary_image_url,
  }));

  const currentParams = { q, cat, cond, page: String(page) };
  const hasFilters = q.length > 0 || cat || cond;

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Search hero */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-2xl font-bold text-neutral-900 md:text-3xl">
            {q ? `Results for “${q}”` : 'Browse all products'}
          </h1>
          <p className="mt-1 text-sm text-neutral-600">
            {result.totalCount === 0
              ? 'No matches.'
              : `${result.totalCount} ${result.totalCount === 1 ? 'product' : 'products'} · every seller KYC-verified · every order escrow-protected`}
          </p>

          <div className="mt-4">
            <SearchBox initialValue={q} />
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-4">
        <div className="mx-auto max-w-7xl space-y-3">
          <FilterRow label="Category">
            <FilterChip
              label="All"
              active={!cat}
              href={buildHref(currentParams, { cat: undefined, page: undefined })}
            />
            {categories.map((c) => (
              <FilterChip
                key={c.slug}
                label={c.name}
                active={cat === c.slug}
                href={buildHref(currentParams, { cat: c.slug, page: undefined })}
              />
            ))}
          </FilterRow>

          <FilterRow label="Condition">
            <FilterChip
              label="Any"
              active={!cond}
              href={buildHref(currentParams, { cond: undefined, page: undefined })}
            />
            {ALLOWED_CONDITIONS.map((c) => (
              <FilterChip
                key={c}
                label={CONDITION_LABEL[c]}
                active={cond === c}
                href={buildHref(currentParams, { cond: c, page: undefined })}
              />
            ))}
          </FilterRow>

          {hasFilters && (
            <div>
              <Link
                href="/search"
                className="text-xs font-semibold text-blue-700 hover:underline"
              >
                Clear all filters
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-7xl">
          {cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center">
              <p className="text-base font-semibold text-neutral-900">No matching products.</p>
              <p className="mt-2 text-sm text-neutral-600">
                Try a different word, clear filters, or{' '}
                <Link href="/" className="font-semibold text-blue-700 hover:underline">
                  browse by category
                </Link>
                .
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {cards.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {result.totalPages > 1 && (
            <nav
              aria-label="Search pagination"
              className="mt-10 flex items-center justify-between gap-3"
            >
              <PaginationLink
                disabled={page <= 1}
                href={buildHref(currentParams, { page: String(page - 1) })}
              >
                ← Previous
              </PaginationLink>
              <span className="text-sm text-neutral-600">
                Page {page} of {result.totalPages}
              </span>
              <PaginationLink
                disabled={page >= result.totalPages}
                href={buildHref(currentParams, { page: String(page + 1) })}
              >
                Next →
              </PaginationLink>
            </nav>
          )}
        </div>
      </section>
    </main>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
        {label}
      </span>
      {children}
    </div>
  );
}

function FilterChip({
  label,
  active,
  href,
}: {
  label: string;
  active: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-blue-700 bg-blue-700 text-neutral-0'
          : 'border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-blue-700 hover:text-blue-700'
      }`}
    >
      {label}
    </Link>
  );
}

function PaginationLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-400">
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-sm font-semibold text-neutral-900 hover:border-blue-700 hover:text-blue-700"
    >
      {children}
    </Link>
  );
}
