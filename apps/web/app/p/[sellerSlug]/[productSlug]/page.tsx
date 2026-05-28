import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { addToCart } from '../../../actions/cart';

/**
 * Product detail page — mirrors docs/prototype/Vendoora_App.html
 * `Screens.product()`. Wrapped in <div class="proto-product"> so the
 * scoped prototype-product.css (@scope (.proto-product)) takes effect.
 *
 * Section order, class names, copy match the prototype verbatim:
 *   breadcrumb → pdp-layout (images + info column) → protection-section →
 *   reviews-section
 *
 * Authenticity status maps the schema's enum (UNCLAIMED / CLAIMED /
 * PROOF_PROVIDED / PLATFORM_VERIFIED) onto the prototype's three-level
 * presentation (proof / claimed / unclaimed), with PLATFORM_VERIFIED
 * surfacing as the strongest "proof" badge.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ sellerSlug: string; productSlug: string }>;
}

type AuthenticityValue = 'proof' | 'claimed' | 'unclaimed';

function mapAuthenticity(status: string): AuthenticityValue {
  if (status === 'PROOF_PROVIDED' || status === 'PLATFORM_VERIFIED') return 'proof';
  if (status === 'CLAIMED') return 'claimed';
  return 'unclaimed';
}

function AuthenticityRow({ value }: { value: AuthenticityValue }) {
  if (value === 'proof') {
    return (
      <>
        <strong style={{ color: 'var(--color-verified)' }}>
          ✓ Authentic with proof
        </strong>
        <span className="desc">
          Distributor invoice + wholesale receipt on file with Vendoora T&amp;S
        </span>
      </>
    );
  }
  if (value === 'claimed') {
    return (
      <>
        <strong style={{ color: 'var(--color-text)' }}>
          Claimed authentic (no proof)
        </strong>
        <span className="desc">
          Seller asserts authenticity but has not uploaded supporting documents.
        </span>
      </>
    );
  }
  return (
    <>
      <strong style={{ color: 'var(--color-text)' }}>Unclaimed</strong>
      <span className="desc">Seller has made no authenticity statement.</span>
    </>
  );
}

const CONDITION_LABEL: Record<string, { label: string; desc: string }> = {
  NEW: { label: 'Brand new', desc: 'Sealed, never used, original packaging' },
  LIKE_NEW: { label: 'Like new', desc: 'Opened but unused; cosmetically perfect' },
  USED_GOOD: { label: 'Used — good', desc: 'Lightly used with minor cosmetic wear' },
  USED_FAIR: { label: 'Used — fair', desc: 'Functional with visible wear' },
  REFURBISHED: { label: 'Refurbished', desc: 'Restored to working condition by seller' },
  FOR_PARTS: { label: 'For parts', desc: 'Not working — sold as-is for parts' },
};

export default async function ProductDetailPage({ params }: PageProps) {
  const { sellerSlug, productSlug } = await params;

  const seller = await prisma.seller.findUnique({ where: { business_slug: sellerSlug } });
  if (!seller) notFound();

  const product = await prisma.product.findUnique({
    where: { seller_id_slug: { seller_id: seller.id, slug: productSlug } },
    include: {
      category: true,
      images: { orderBy: { display_order: 'asc' } },
      variants: { orderBy: { created_at: 'asc' } },
    },
  });
  if (!product) notFound();

  // Real reviews + histogram via subject_type/id polymorphic lookup. Most
  // recent first; cap at 8 cards on the PDP — full list ships in a later
  // /p/[seller]/[product]/reviews slice.
  const [reviews, histogramRaw, authorById] = await Promise.all([
    prisma.review.findMany({
      where: {
        subject_type: 'PRODUCT',
        subject_id: product.id,
        status: 'PUBLISHED',
      },
      orderBy: { created_at: 'desc' },
      take: 8,
    }),
    prisma.review.groupBy({
      by: ['rating'],
      where: {
        subject_type: 'PRODUCT',
        subject_id: product.id,
        status: 'PUBLISHED',
      },
      _count: { _all: true },
    }),
    (async () => {
      const ids = await prisma.review.findMany({
        where: {
          subject_type: 'PRODUCT',
          subject_id: product.id,
          status: 'PUBLISHED',
        },
        select: { author_user_id: true },
        distinct: ['author_user_id'],
      });
      if (ids.length === 0) return new Map<string, { full_name: string }>();
      const authors = await prisma.user.findMany({
        where: { id: { in: ids.map((r) => r.author_user_id) } },
        select: { id: true, full_name: true },
      });
      return new Map(authors.map((a) => [a.id, { full_name: a.full_name }]));
    })(),
  ]);

  const histogram: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of histogramRaw) histogram[row.rating] = row._count._all;
  const totalReviews = Object.values(histogram).reduce((s, n) => s + n, 0);

  const price = Number(product.base_price);
  const compareAt = product.compare_at_price ? Number(product.compare_at_price) : null;
  const savings = compareAt && compareAt > price ? Math.round((1 - price / compareAt) * 100) : 0;
  const authenticity = mapAuthenticity(product.authenticity_status);
  const condition = CONDITION_LABEL[product.condition] ?? { label: product.condition, desc: '' };
  const primaryImageUrl = product.images[0]?.url;

  // Authenticity badge in the badges row
  const authBadge =
    authenticity === 'proof' ? (
      <span className="badge badge-success">✓ AUTHENTIC — PROOF VERIFIED</span>
    ) : authenticity === 'claimed' ? (
      <span className="badge badge-info">AUTHENTICITY CLAIMED</span>
    ) : null;

  // Strip "—" suffix from product name for breadcrumb crumb
  const breadcrumbName = product.name.split('—')[0]?.trim() ?? product.name;

  return (
    <div className="proto-product">
      <div className="screen-container">
        {/* ============ BREADCRUMB ============ */}
        <div className="breadcrumb">
          <Link href="/">Home</Link>
          <span className="breadcrumb-sep">/</span>
          <Link href={`/c/${product.category.slug}`}>{product.category.name}</Link>
          <span className="breadcrumb-sep">/</span>
          <span className="breadcrumb-current">{breadcrumbName}</span>
        </div>

        {/* ============ PDP LAYOUT ============ */}
        <div className="pdp-layout">
          {/* ----- IMAGES ----- */}
          <div className="pdp-images">
            <div
              className="pdp-main-img"
              style={{
                background: primaryImageUrl
                  ? `center / cover no-repeat url(${primaryImageUrl})`
                  : 'radial-gradient(ellipse 80% 60% at 50% 45%, #B6C5EC 0%, #8FA5DD 55%, #5A78C9 100%)',
              }}
            >
              {!primaryImageUrl && (
                <div
                  className="hero-visual-pill"
                  style={{
                    position: 'absolute',
                    bottom: 24,
                    left: '50%',
                    transform: 'translateX(-50%)',
                  }}
                >
                  📷 {breadcrumbName} photo
                </div>
              )}
            </div>
            {product.images.length > 0 && (
              <div className="pdp-thumbs">
                {product.images.slice(0, 4).map((img, i) => (
                  <div
                    key={img.id}
                    className={`pdp-thumb${i === 0 ? ' active' : ''}`}
                    style={{
                      background: `center / cover no-repeat url(${img.url})`,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ----- INFO ----- */}
          <div className="pdp-info">
            <div className="pdp-badges-row">
              <span className="badge badge-success">✓ ESCROW PROTECTED</span>
              <span className="badge badge-info">⚡ TIER {seller.kyc_tier} SELLER</span>
              {authBadge}
            </div>

            <h1 className="pdp-title">{product.name}</h1>

            <div className="pdp-rating-row">
              <span className="pdp-stars">★★★★★</span>
              <strong style={{ color: 'var(--color-text)' }}>
                {product.rating_average?.toFixed(1) ?? '—'}
              </strong>
              <span>·</span>
              <span>{product.rating_count} verified reviews</span>
              <span>·</span>
              <span>{seller.total_orders} sold</span>
            </div>

            <div className="pdp-price">
              ${price.toFixed(2)}
              {compareAt && compareAt > price && (
                <span className="pdp-price-compare">${compareAt.toFixed(2)}</span>
              )}
              {savings > 0 && <span className="pdp-savings-tag">SAVE {savings}%</span>}
            </div>
            <div className="pdp-seller-line">
              Sold by{' '}
              <Link href={`/store/${seller.business_slug}`}>{seller.business_name}</Link>
              {' · '}
              {extractCity(seller.business_address)}, Liberia
            </div>

            <div className="pdp-trust-card">
              <div className="pdp-trust-header">Product trust information</div>
              <table className="pdp-trust-table">
                <tbody>
                  <tr>
                    <td>Condition</td>
                    <td>
                      <strong>{condition.label}</strong>
                      <span className="desc">{condition.desc}</span>
                    </td>
                  </tr>
                  <tr>
                    <td>Authenticity</td>
                    <td>
                      <AuthenticityRow value={authenticity} />
                    </td>
                  </tr>
                  <tr>
                    <td>Warranty</td>
                    <td>
                      <strong>
                        {product.warranty_terms ?? 'No warranty'}
                      </strong>
                      <span className="desc">
                        {product.warranty_terms
                          ? `Manufacturer defects only. Excludes wear-and-tear, water damage, accidental damage.${product.warranty_duration_days ? ` (${product.warranty_duration_days} days)` : ''}`
                          : 'Standard buyer protection still applies.'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Returns</td>
                    <td>
                      <strong>
                        {product.return_policy_type === 'NO_RETURNS'
                          ? 'Final sale'
                          : product.return_window_days
                          ? `${product.return_window_days}-day returns`
                          : 'Returns accepted'}
                      </strong>
                      <span className="desc">
                        Free return shipping if defective. Buyer pays shipping for
                        change-of-mind returns.
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td>Buyer protection</td>
                    <td>
                      <strong style={{ color: 'var(--color-verified)' }}>
                        ✓ Eligible
                      </strong>
                      <span className="desc">
                        Escrow holds payment until you confirm delivery with a 6-digit
                        code.
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <form action={addToCart}>
              <input type="hidden" name="productId" value={product.id} />
              <div className="pdp-buy-row">
                <select className="input qty-select" name="quantity" defaultValue="1">
                  <option value="1">Quantity: 1</option>
                  <option value="2">Quantity: 2</option>
                  <option value="3">Quantity: 3</option>
                </select>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ flex: 1 }}
                >
                  Add to cart · ${price.toFixed(2)}
                </button>
              </div>
            </form>

            <form action={addToCart}>
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="quantity" value="1" />
              <input type="hidden" name="checkoutAfter" value="1" />
              <button type="submit" className="btn btn-secondary btn-block">
                Buy now (escrow protected)
              </button>
            </form>

            <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
              <Link
                href="/"
                style={{
                  fontSize: 13,
                  color: 'var(--color-action-primary)',
                  fontWeight: 600,
                }}
              >
                🎁 Send this as a gift to Liberia →
              </Link>
            </div>

            <p
              style={{
                fontSize: 12,
                color: 'var(--color-text-subtle)',
                marginTop: 'var(--space-4)',
                lineHeight: 1.5,
              }}
            >
              {product.description}
            </p>
          </div>
        </div>

        {/* ============ HOW THIS ORDER IS PROTECTED ============ */}
        <section className="protection-section">
          <div className="protection-eyebrow">⚡ HOW THIS ORDER IS PROTECTED</div>
          <h2 className="protection-title">
            Every order on Vendoora is verified by a <em>6-digit code.</em>
          </h2>
          <p className="protection-subtitle">
            Your money never goes to the seller until you confirm the package arrived.
            No code, no payout. No exceptions.
          </p>
          <div className="protection-steps">
            <div className="protection-step">
              <div className="protection-step-num">1</div>
              <div className="protection-step-title">You pay</div>
              <div className="protection-step-desc">
                MoMo, Orange Money, or card. Money goes to platform escrow — not the
                seller.
              </div>
              <div className="protection-step-status">✓ Held safely</div>
            </div>
            <div className="protection-step">
              <div className="protection-step-num">2</div>
              <div className="protection-step-title">Seller ships</div>
              <div className="protection-step-desc">
                You get a 6-digit code by SMS the moment your package leaves the seller.
              </div>
              <div className="protection-step-status">✓ Code arrives</div>
            </div>
            <div className="protection-step">
              <div className="protection-step-num">3</div>
              <div className="protection-step-title">Driver arrives</div>
              <div className="protection-step-desc">
                You give the code to the driver at your door. Driver enters it on their app.
              </div>
              <div className="protection-step-status">⚡ You decide</div>
            </div>
            <div className="protection-step">
              <div className="protection-step-num">4</div>
              <div className="protection-step-title">Seller paid</div>
              <div className="protection-step-desc">
                Once the code is verified, escrow releases. Everyone is paid, order is
                closed.
              </div>
              <div className="protection-step-status">✓ Done</div>
            </div>
          </div>
          <div className="protection-footer">
            <span>
              <strong style={{ color: 'white' }}>Seller is verified.</strong>{' '}
              {seller.business_name} has passed{' '}
              {seller.kyc_tier >= 3 ? '7' : '4'} levels of KYC and has a public
              verification receipt on file.
            </span>
            <Link href="/trust-center">Learn how Vendoora protects you →</Link>
          </div>
        </section>

        {/* ============ REVIEWS ============ */}
        {totalReviews > 0 && (
          <section className="reviews-section">
            <h2 className="section-title" style={{ marginBottom: 'var(--space-4)' }}>
              Buyer reviews
            </h2>
            <div className="review-summary">
              <div>
                <div className="review-avg-num">
                  {product.rating_average?.toFixed(1) ?? '—'}
                </div>
                <div className="review-avg-stars">★★★★★</div>
                <div className="review-avg-count">
                  {totalReviews}{' '}
                  {totalReviews === 1 ? 'verified purchase' : 'verified purchases'}
                </div>
              </div>
              <div>
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = histogram[stars] ?? 0;
                  const pct = totalReviews === 0 ? 0 : (count / totalReviews) * 100;
                  return (
                    <RatingBar key={stars} stars={stars} pct={pct} count={count} />
                  );
                })}
              </div>
            </div>

            {reviews.map((r) => {
              const author = authorById.get(r.author_user_id);
              const fullName = author?.full_name ?? 'Anonymous';
              const initials = fullName
                .split(/\s+/)
                .map((p) => p[0]?.toUpperCase() ?? '')
                .slice(0, 2)
                .join('');
              return (
                <ReviewCard
                  key={r.id}
                  author={fullName}
                  initials={initials}
                  date={relativeDate(r.created_at)}
                  rating={r.rating}
                  verified={r.verified_purchase}
                  body={r.body}
                  helpful={r.helpful_count}
                />
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

function RatingBar({ stars, pct, count }: { stars: number; pct: number; count: number }) {
  return (
    <div className="review-bar-row">
      <span>{stars}★</span>
      <div className="review-bar">
        <div className="review-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{count}</span>
    </div>
  );
}

interface ReviewCardProps {
  author: string;
  initials: string;
  date: string;
  rating: number;
  verified?: boolean;
  diaspora?: boolean;
  body: string;
  helpful: number;
}

function ReviewCard({
  author,
  initials,
  date,
  rating,
  verified,
  diaspora,
  body,
  helpful,
}: ReviewCardProps) {
  return (
    <div className="review-card">
      <div className="review-header">
        <div
          className="user-avatar"
          style={{
            background: diaspora
              ? 'linear-gradient(135deg, #7c3aed, #5b21b6)'
              : 'linear-gradient(135deg, #3354B8, #142E7A)',
          }}
        >
          {initials}
        </div>
        <div>
          <div className="review-author-name">
            {author}
            {diaspora && (
              <span className="badge badge-info" style={{ marginLeft: 4 }}>
                DIASPORA
              </span>
            )}
          </div>
          <div className="review-meta-line">
            <span className="review-stars-sm">
              {'★'.repeat(rating)}
              {'☆'.repeat(5 - rating)}
            </span>
            <span>·</span>
            {verified && (
              <>
                <span className="badge badge-success">✓ Verified Purchase</span>
                <span>·</span>
              </>
            )}
            <span>{date}</span>
          </div>
        </div>
      </div>
      <div className="review-body">{body}</div>
      <div className="review-actions">
        <span className="review-action">👍 Helpful ({helpful})</span>
        <span className="review-action">🚩 Report</span>
      </div>
    </div>
  );
}

function extractCity(address: unknown): string {
  if (address && typeof address === 'object' && 'city' in address) {
    const v = (address as { city?: unknown }).city;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return 'Monrovia';
}

/** "12 days ago" / "3 months ago" / "just now". Server-rendered so the
 * format is deterministic across hydration. */
function relativeDate(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo} month${diffMo === 1 ? '' : 's'} ago`;
  const diffYr = Math.floor(diffMo / 12);
  return `${diffYr} year${diffYr === 1 ? '' : 's'} ago`;
}
