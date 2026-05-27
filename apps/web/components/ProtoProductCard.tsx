import Link from 'next/link';

/**
 * Product card — mirrors docs/prototype/Vendoora_App.html
 * `Screens.productCard()`. Used inside .proto-home (Featured row)
 * and .proto-browse (browse + search grid).
 *
 * Defaults to local-audience pricing (LRD primary, USD secondary)
 * at the prototype's 180 LRD/USD reference rate. Diaspora audience
 * inversion will land when the GeoRouter wires up.
 */

export interface ProtoProductCardData {
  id: string;
  slug: string;
  name: string;
  base_price: number | string;
  compare_at_price: number | string | null;
  rating_average: number | null;
  rating_count: number;
  primary_image_url: string | null;
  is_featured?: boolean;
  authenticity_status?: string;
  condition?: string;
  seller: {
    business_slug: string;
    business_name: string;
    kyc_tier: number;
  };
}

const LRD_RATE = 180;

function formatLrd(usd: number): string {
  return Math.round(usd * LRD_RATE).toLocaleString('en-US');
}

export function ProtoProductCard({ product }: { product: ProtoProductCardData }) {
  const price = Number(product.base_price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const tier = product.seller.kyc_tier;
  const tierClass = tier >= 4 ? 'tier-4' : tier >= 3 ? 'tier-3' : 'tier-2';
  const tierLabel = tier >= 4 ? 'T4 ELITE' : `T${tier} VERIFIED`;
  const trustScore = 82 + (product.id.charCodeAt(product.id.length - 1) % 16);

  return (
    <Link
      href={`/p/${product.seller.business_slug}/${product.slug}`}
      className="product-card"
    >
      <div
        className="product-card-image"
        style={{
          background: product.primary_image_url
            ? `center / cover no-repeat url(${product.primary_image_url})`
            : 'radial-gradient(ellipse 80% 60% at 50% 45%, #B6C5EC 0%, #8FA5DD 55%, #5A78C9 100%)',
        }}
      >
        {product.is_featured && <div className="product-card-promoted">PROMOTED</div>}
        <div className="product-card-image-overlay">
          {product.condition === 'NEW' && (
            <span className="badge badge-success">NEW</span>
          )}
          {(product.authenticity_status === 'PROOF_PROVIDED' ||
            product.authenticity_status === 'PLATFORM_VERIFIED') && (
            <span className="badge badge-info">✓ AUTHENTIC</span>
          )}
        </div>
      </div>

      <div className="product-card-body">
        <div className="product-card-name">{product.name}</div>
        <div className="product-card-seller">
          {product.seller.business_name}
          <span className="trust-score-mini" style={{ marginLeft: 6 }}>
            <span className="dot"></span>
            {trustScore}
          </span>
        </div>
        <div className="product-card-trust-row">
          <span className={`trust-pill ${tierClass}`}>
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>{' '}
            {tierLabel}
          </span>
          <span className="trust-pill escrow">
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
            </svg>{' '}
            ESCROW
          </span>
          <span className="trust-pill code">CODE</span>
        </div>
        <div className="product-card-rating">
          <span className="product-card-stars">★★★★★</span>
          <span>{product.rating_average?.toFixed(1) ?? '—'}</span>
          <span style={{ color: 'var(--color-text-subtle)' }}>
            ({product.rating_count})
          </span>
        </div>
        <div className="product-card-price">
          <span className="price-primary">L${formatLrd(price)}</span>
          <span className="price-secondary">≈ ${price.toFixed(2)} USD</span>
          {compareAt && compareAt > price && (
            <span className="product-card-price-compare">L${formatLrd(compareAt)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
