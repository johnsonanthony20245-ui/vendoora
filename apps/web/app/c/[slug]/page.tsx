import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { ProtoProductCard } from '../../../components/ProtoProductCard';

/**
 * Category browse page — mirrors docs/prototype/Vendoora_App.html
 * `Screens.browse(category)`. Wrapped in <div class="proto-browse"> so
 * the scoped prototype-browse.css applies.
 *
 * Section order matches the prototype:
 *   breadcrumb → browse-layout (.filter-sidebar + .browse-toolbar +
 *   .product-grid)
 *
 * The filter sidebar checkboxes are decorative-only in this slice
 * (the prototype's are too — the checked-state is hard-coded). The
 * sort dropdown is rendered but does not yet drive the orderBy.
 * Those wire to real Prisma where-clauses in a later slice.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;

  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const products = await prisma.product.findMany({
    where: {
      category_id: category.id,
      status: 'PUBLISHED',
      moderation_status: 'APPROVED',
      deleted_at: null,
    },
    orderBy: { created_at: 'desc' },
    include: {
      seller: {
        select: { business_slug: true, business_name: true, kyc_tier: true },
      },
      images: { where: { is_primary: true }, take: 1, select: { url: true } },
    },
  });

  const cards = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    base_price: p.base_price.toString(),
    compare_at_price: p.compare_at_price ? p.compare_at_price.toString() : null,
    rating_average: p.rating_average,
    rating_count: p.rating_count,
    primary_image_url: p.images[0]?.url ?? null,
    is_featured: p.is_featured,
    authenticity_status: p.authenticity_status,
    condition: p.condition,
    seller: p.seller,
  }));

  return (
    <div className="proto-browse">
      <div className="screen-container">
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{category.name}</span>
        </div>

        <div className="browse-layout">
          <aside className="filter-sidebar">
            <div className="filter-group">
              <div className="filter-group-label">Condition</div>
              <label className="filter-option">
                <input type="checkbox" defaultChecked /> Brand new{' '}
                <span className="filter-option-count">412</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked /> Like new{' '}
                <span className="filter-option-count">87</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Used – Good{' '}
                <span className="filter-option-count">124</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Used – Fair{' '}
                <span className="filter-option-count">38</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Refurbished{' '}
                <span className="filter-option-count">29</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Authenticity</div>
              <label className="filter-option">
                <input type="checkbox" /> Platform verified{' '}
                <span className="filter-option-count">42</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Proof uploaded{' '}
                <span className="filter-option-count">186</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Claimed authentic{' '}
                <span className="filter-option-count">312</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Seller tier</div>
              <label className="filter-option">
                <input type="checkbox" /> Tier 4 (Trusted){' '}
                <span className="filter-option-count">28</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked /> Tier 3 (Verified){' '}
                <span className="filter-option-count">147</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" defaultChecked /> Tier 2 (Standard){' '}
                <span className="filter-option-count">386</span>
              </label>
              <label className="filter-option">
                <input type="checkbox" /> Tier 1 (New){' '}
                <span className="filter-option-count">142</span>
              </label>
            </div>
            <div className="filter-group">
              <div className="filter-group-label">Rating</div>
              <label className="filter-option">
                <input type="checkbox" /> 4★ &amp; up
              </label>
              <label className="filter-option">
                <input type="checkbox" /> 3★ &amp; up
              </label>
            </div>
          </aside>

          <div>
            <div className="browse-toolbar">
              <div>
                <h1 className="screen-title" style={{ fontSize: 24, marginBottom: 4 }}>
                  {category.name}
                </h1>
                <div className="browse-results-count">
                  {cards.length} {cards.length === 1 ? 'product' : 'products'} ·
                  Verified sellers only
                </div>
              </div>
              <select className="input sort-select">
                <option>Sort: Best match</option>
                <option>Price: low to high</option>
                <option>Price: high to low</option>
                <option>Newest first</option>
                <option>Top rated</option>
              </select>
            </div>

            {cards.length === 0 ? (
              <div className="empty-state">
                <p>No products in {category.name} yet. Check back soon.</p>
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
