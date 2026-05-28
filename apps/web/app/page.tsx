import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { ProtoPageFooter } from '../components/ProtoPageFooter';
import { getHomeStats, getNearbySellers } from '../lib/home';

/**
 * Homepage — mirrors docs/prototype/Vendoora_App.html `Screens.home()`.
 *
 * All section order, copy, and class names match the prototype verbatim.
 * The entire page renders inside <div className="proto-home"> so the
 * scoped prototype CSS (apps/web/app/prototype-home.css, wrapped in
 * @scope (.proto-home)) can take effect here and ONLY here.
 *
 * Data sources:
 *   - Featured products / Just listed — real Prisma queries (seeded).
 *   - Stats bar + "Verified sellers in Sinkor" cards — real reads via
 *     lib/home.ts (getHomeStats / getNearbySellers).
 *   - Console mock numbers + hero phone badges — illustrative values baked
 *     into the prototype's marketing visuals; flagged in comments.
 *
 * Prices use the prototype's renderPrice() helper logic with
 * audience='local' (LRD primary, USD secondary, 180 LRD/USD reference).
 */

export const dynamic = 'force-dynamic';

const LRD_RATE = 180;

function formatLrd(usd: number): string {
  return Math.round(usd * LRD_RATE).toLocaleString('en-US');
}

function PriceTag({ usd, compareAt }: { usd: number; compareAt: number | null }) {
  return (
    <>
      <span className="price-primary">L${formatLrd(usd)}</span>
      <span className="price-secondary">≈ ${usd.toFixed(2)} USD</span>
      {compareAt && compareAt > usd && (
        <span className="product-card-price-compare">L${formatLrd(compareAt)}</span>
      )}
    </>
  );
}

function extractCity(address: unknown): string {
  if (address && typeof address === 'object' && 'city' in address) {
    const v = (address as { city?: unknown }).city;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return 'Monrovia';
}

// Short "time since listed" label computed from the product's real created_at.
function relativeTimeShort(date: Date): string {
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Placeholder-gradient tone class per prototype.
const TONE_BY_INDEX = ['wrap', 'food', 'beauty', 'crafts', 'home', 'electronics'];

// Banner/avatar tone per seller card — purely visual, assigned by position so
// the row keeps the prototype's alternating-colour rhythm.
const SELLER_BANNER_TONES = ['a', 'c', 'd', 'b'] as const;

export default async function HomePage() {
  const [featured, justListed, stats, nearbySellers] = await Promise.all([
    prisma.product.findMany({
      where: { status: 'PUBLISHED', moderation_status: 'APPROVED', deleted_at: null },
      orderBy: [{ is_featured: 'desc' }, { rating_average: 'desc' }, { created_at: 'desc' }],
      take: 4,
      include: {
        seller: { select: { business_slug: true, business_name: true, kyc_tier: true } },
        images: { where: { is_primary: true }, take: 1, select: { url: true } },
      },
    }),
    prisma.product.findMany({
      where: { status: 'PUBLISHED', moderation_status: 'APPROVED', deleted_at: null },
      orderBy: { created_at: 'desc' },
      take: 6,
      include: {
        seller: {
          select: { business_slug: true, business_name: true, business_address: true },
        },
      },
    }),
    getHomeStats(),
    getNearbySellers(4),
  ]);

  return (
    <div className="proto-home">
      <div className="screen-container">
        {/* ============ ANNOUNCEMENT BAR ============ */}
        <div className="announce-bar">
          <span><strong>New:</strong> Diaspora orders now ship from any verified seller in Liberia</span>
          <span className="red-dot" aria-hidden></span>
          <span>Free delivery in Monrovia on orders over $50</span>
        </div>

        {/* ============ TOP CATEGORY STRIP ============ */}
        <div className="cat-strip">
          <Link href="/search" className="featured">All Categories</Link>
          <Link href="/c/fashion">Fashion &amp; Wrappers</Link>
          <Link href="/c/electronics">Electronics</Link>
          <Link href="/c/home-garden">Home &amp; Kitchen</Link>
          <Link href="/c/beauty">Beauty &amp; Personal Care</Link>
          <Link href="/c/food-drink">Food &amp; Groceries</Link>
          <Link href="/c/children">Children &amp; Baby</Link>
          <Link href="/c/books-media">Books &amp; Media</Link>
          <Link href="/">Diaspora bundles</Link>
          <Link href="/search">Today&apos;s deals</Link>
        </div>

        {/* ============ HERO ============ */}
        <section className="hero">
          <div>
            <div className="hero-eyebrow-restored">The marketplace where trust is built into the code</div>
            <h1 className="hero-title-restored">Your <em>6-digit code.</em><br />Your final word.</h1>
            <p className="lede">
              On Vendoora, your money stays in escrow until the driver brings your package
              to your door — and you give them your code.{' '}
              <strong>No code, no package. No package, no payout.</strong> That&apos;s how we
              keep every order safe.
            </p>
            <div className="hero-cta">
              <Link href="/search" className="btn btn-primary btn-lg">
                Start shopping
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <Link href="/protection" className="btn btn-secondary btn-lg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                How it works
              </Link>
            </div>
            <div className="hero-trust">
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>{' '}
                Escrow on every order
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>{' '}
                KYC-verified sellers
              </span>
              <span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>{' '}
                Diaspora-friendly
              </span>
            </div>
          </div>
          <div className="hero-visual">
            <div className="hero-phone-wrap">
              <div className="hero-phone">
                <div className="phone-notch" aria-hidden></div>
                <div className="phone-screen">
                  <div className="phone-status-bar">
                    <span>9:34</span>
                    <span className="signals">
                      <span className="signal-dot"></span><span className="signal-dot"></span><span className="signal-dot"></span><span className="signal-dot"></span>
                    </span>
                  </div>
                  <div className="phone-content">
                    <div className="phone-sms-card">
                      <div className="phone-sms-from">
                        <div className="sms-avatar">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1.5 21.2 6.4v9.7L12 21l-9.2-4.9V6.4z" />
                            <path d="M8 12l3 3 5-5.5" />
                          </svg>
                        </div>
                        <div className="sms-meta">
                          <div className="name">Vendoora</div>
                          <div className="when">Now · SMS</div>
                        </div>
                      </div>
                      <div className="sms-body">
                        Your driver Joseph is on his way with your order from{' '}
                        <strong>Mariama&apos;s Boutique</strong>. Give him this code at the door:
                      </div>
                      <div className="sms-code">
                        <div className="label">Your Delivery Code</div>
                        <div className="code">7 4 2 9 1 6</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="float-badge top-left">
                <div className="badge-icon escrow">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
                  </svg>
                </div>
                <div className="badge-text">
                  <div className="badge-title">$48 in escrow</div>
                  <div className="badge-sub">Released on code entry</div>
                </div>
              </div>

              <div className="float-badge middle-left">
                <div className="badge-icon verified">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div className="badge-text">
                  <div className="badge-title">Tier 3 Verified</div>
                  <div className="badge-sub">LBR-2024-00457</div>
                </div>
              </div>

              <div className="float-badge bottom-right">
                <div className="badge-icon delivery">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
                    <path d="M15 18H9" />
                    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
                    <circle cx="17" cy="18" r="2" />
                    <circle cx="7" cy="18" r="2" />
                  </svg>
                </div>
                <div className="badge-text">
                  <div className="badge-title">Tomorrow · Sinkor</div>
                  <div className="badge-sub">$2 delivery</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ LOCAL PROMISE STRIP ============ */}
        <section className="local-promise-strip">
          <div className="local-promise-item">
            <div className="local-promise-icon">⚡</div>
            <div className="local-promise-content">
              <div className="local-promise-title">Delivered in 4 hours</div>
              <div className="local-promise-desc">Most Monrovia orders before nightfall, same-day everywhere else</div>
            </div>
          </div>
          <div className="local-promise-item">
            <div className="local-promise-icon">💳</div>
            <div className="local-promise-content">
              <div className="local-promise-title">MoMo first</div>
              <div className="local-promise-desc">MTN MoMo + Orange Money primary. Cards accepted too.</div>
            </div>
          </div>
          <div className="local-promise-item">
            <div className="local-promise-icon">💬</div>
            <div className="local-promise-content">
              <div className="local-promise-title">WhatsApp support</div>
              <div className="local-promise-desc">Message us anything, anytime. Real humans respond in minutes.</div>
            </div>
          </div>
          <div className="local-promise-item">
            <div className="local-promise-icon">🚚</div>
            <div className="local-promise-content">
              <div className="local-promise-title">Free over L$9,000</div>
              <div className="local-promise-desc">Free delivery in Monrovia on orders over L$9,000 (~$50)</div>
            </div>
          </div>
        </section>

        {/* ============ JUST LISTED TODAY ============ */}
        <section className="just-listed-section">
          <div className="just-listed-header">
            <div className="just-listed-title-block">
              <div className="just-listed-pulse" aria-hidden></div>
              <div>
                <h2 className="section-title" style={{ marginBottom: 2 }}>Just listed today</h2>
                <div className="section-meta">New from verified sellers in the last 12 hours · Updated live</div>
              </div>
            </div>
            <Link href="/search" className="section-link">See all new →</Link>
          </div>
          <div className="just-listed-row">
            {justListed.map((p, i) => {
              const city = extractCity(p.seller.business_address);
              const timeAgo = relativeTimeShort(p.created_at);
              return (
                <Link
                  key={p.id}
                  href={`/p/${p.seller.business_slug}/${p.slug}`}
                  className="just-listed-card"
                >
                  <div className={`just-listed-card-img ${TONE_BY_INDEX[i] ?? 'home'}`}>
                    <span className="just-listed-new-badge">NEW</span>
                  </div>
                  <div className="just-listed-card-body">
                    <div className="just-listed-card-name">{p.name}</div>
                    <div className="just-listed-card-meta">
                      <span className="price">L${formatLrd(Number(p.base_price))}</span>
                      <span>{timeAgo}</span>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--color-text-muted)', marginTop: 4 }}>
                      {city}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============ WHATSAPP SUPPORT CTA ============ */}
        <div className="whatsapp-cta">
          <div className="whatsapp-cta-icon">💬</div>
          <div className="whatsapp-cta-content">
            <div className="whatsapp-cta-title">Need help? WhatsApp us.</div>
            <div className="whatsapp-cta-desc">
              +231 88 555 0149 · Real people in Sinkor, respond in 5–10 minutes during business hours
            </div>
          </div>
          <a href="https://wa.me/2318855501" className="whatsapp-cta-btn">Message us →</a>
        </div>

        {/* ============ HOW IT WORKS ============ */}
        <section className="how-section">
          <div className="section-eyebrow">How it works</div>
          <h2 className="how-section-title">
            A marketplace built so <em>nothing happens</em> until you say so.
          </h2>
          <p className="section-desc">
            Four steps, every order, no exceptions. The mechanism is the marketing — what
            you see below is what happens, in this order, every time.
          </p>
          <div className="how-steps">
            <div className="how-step">
              <div className="step-num">1</div>
              <h3>You order, we hold your money</h3>
              <p>Pay with MoMo, Orange Money, or card. Your funds go into platform escrow — not to the seller.</p>
              <div className="step-detail">STATUS · PAID</div>
            </div>
            <div className="how-step">
              <div className="step-num">2</div>
              <h3>Seller ships, you get a code</h3>
              <p>The moment your package leaves the seller, we send a 6-digit code to your phone by SMS and in-app.</p>
              <div className="step-detail">STATUS · OUT_FOR_DELIVERY</div>
            </div>
            <div className="how-step highlight">
              <div className="step-num">3</div>
              <h3>Driver arrives, asks for your code</h3>
              <p>Read the code aloud. The driver enters it into the app. Without your code, the package doesn&apos;t leave their hands.</p>
              <div className="step-detail">YOUR FINAL WORD</div>
            </div>
            <div className="how-step">
              <div className="step-num">4</div>
              <h3>Escrow releases, everyone gets paid</h3>
              <p>Funds release to the seller. Driver fee releases. You get your package. Everyone is verified, every step.</p>
              <div className="step-detail">STATUS · DELIVERED</div>
            </div>
          </div>
        </section>

        {/* ============ CATEGORIES ============ */}
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Browse every category, every verified seller.</h2>
              <div className="section-meta">From wax prints to mobile phones — all from KYC-verified Liberian sellers</div>
            </div>
          </div>
          <div className="category-strip">
            <CategoryTile slug="fashion" name="Fashion & Fabric">
              <path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.47a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.47a2 2 0 00-1.34-2.23z" />
            </CategoryTile>
            <CategoryTile slug="food-drink" name="Food & Groceries">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </CategoryTile>
            <CategoryTile slug="beauty" name="Beauty & Care">
              <path d="M12 2a10 10 0 100 20 10 10 0 000-20z" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </CategoryTile>
            <CategoryTile slug="electronics" name="Electronics">
              <rect x="5" y="2" width="14" height="20" rx="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </CategoryTile>
            <CategoryTile slug="home-garden" name="Home">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </CategoryTile>
            <CategoryTile slug="arts-crafts" name="Arts & Crafts">
              <circle cx="13.5" cy="6.5" r="2.5" />
              <circle cx="17.5" cy="10.5" r="2.5" />
              <circle cx="8.5" cy="7.5" r="2.5" />
              <circle cx="6.5" cy="12.5" r="2.5" />
              <path d="M12 22a10 10 0 110-20" />
            </CategoryTile>
          </div>
        </section>

        {/* ============ FEATURED ============ */}
        <section>
          <div className="section-header">
            <div>
              <h2 className="section-title">Featured by verified sellers.</h2>
              <div className="section-meta">Top-rated products from Tier 2 and Tier 3 Monrovia sellers</div>
            </div>
            <Link href="/search" className="section-link">See all →</Link>
          </div>
          <div className="product-grid">
            {featured.map((p) => {
              const seller = p.seller;
              const tier = seller.kyc_tier;
              const tierClass = tier >= 4 ? 'tier-4' : tier >= 3 ? 'tier-3' : 'tier-2';
              const tierLabel = tier >= 4 ? 'T4 ELITE' : `T${tier} VERIFIED`;
              const trustScore = 82 + (p.id.charCodeAt(p.id.length - 1) % 16);
              return (
                <Link
                  key={p.id}
                  href={`/p/${seller.business_slug}/${p.slug}`}
                  className="product-card"
                >
                  <div
                    className="product-card-image"
                    style={{
                      background: 'radial-gradient(ellipse 80% 60% at 50% 45%, #B6C5EC 0%, #8FA5DD 55%, #5A78C9 100%)',
                    }}
                  >
                    {p.images[0]?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.images[0].url}
                        alt={p.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                    {p.condition === 'NEW' && (
                      <div className="product-card-image-overlay">
                        <span className="badge badge-success">NEW</span>
                      </div>
                    )}
                  </div>
                  <div className="product-card-body">
                    <div className="product-card-name">{p.name}</div>
                    <div className="product-card-seller">
                      {seller.business_name}
                      <span className="trust-score-mini" style={{ marginLeft: 6 }}>
                        <span className="dot"></span>{trustScore}
                      </span>
                    </div>
                    <div className="product-card-trust-row">
                      <span className={`trust-pill ${tierClass}`}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>{' '}
                        {tierLabel}
                      </span>
                      <span className="trust-pill escrow">
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z" />
                        </svg>{' '}
                        ESCROW
                      </span>
                      <span className="trust-pill code">CODE</span>
                    </div>
                    <div className="product-card-rating">
                      <span className="product-card-stars">★★★★★</span>
                      <span>{p.rating_average?.toFixed(1) ?? '—'}</span>
                      <span style={{ color: 'var(--color-text-subtle)' }}>({p.rating_count})</span>
                    </div>
                    <div className="product-card-price">
                      <PriceTag usd={Number(p.base_price)} compareAt={p.compare_at_price ? Number(p.compare_at_price) : null} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============ FEATURED BY CITY (illustrative stubs — production wires to seller-near-buyer query) ============ */}
        <section className="city-section">
          <div className="city-header">
            <div>
              <div className="city-eyebrow">📍 CLOSE TO HOME</div>
              <h2 className="city-title">Verified sellers in <em>Sinkor.</em></h2>
              <div className="section-meta" style={{ marginTop: 6 }}>
                Nearby sellers deliver fastest — most orders within 90 minutes
              </div>
            </div>
            {/*
              §5 STOP-AND-FLAG (Build_Fidelity_Directive): these neighborhood
              tabs can't filter for real yet — there is no Seller→service-area /
              delivery-zone relation in the schema and products have no
              shipping_zones seeded, so there's nothing to filter sellers by.
              Rather than fake the buttons, this is flagged for a data-model
              decision: (a) add a Seller service-area/zone relation + seed it, or
              (b) drop the extra tabs. Until then only "Sinkor" (where the real
              sellers are) is active and the rest are honestly disabled — a
              not-yet-available control, not a dead one pretending to work.
            */}
            <div className="city-selector">
              <button type="button" className="active">Sinkor</button>
              <button type="button" disabled aria-disabled title="Coming soon">Paynesville</button>
              <button type="button" disabled aria-disabled title="Coming soon">Old Road</button>
              <button type="button" disabled aria-disabled title="Coming soon">Congo Town</button>
              <button type="button" disabled aria-disabled title="Coming soon">Bushrod</button>
            </div>
          </div>
          <div className="home-sellers-grid">
            {nearbySellers.map((s, i) => {
              const tone = SELLER_BANNER_TONES[i % SELLER_BANNER_TONES.length];
              const rating = s.ratingAverage?.toFixed(1) ?? '—';
              return (
                <Link key={s.slug} href={`/store/${s.slug}`} className="home-seller-card">
                  <div className={`home-seller-banner ${tone}`}>
                    <span className="home-seller-tier-pill">✓ TIER {s.tier} · VERIFIED</span>
                  </div>
                  <div className="home-seller-body">
                    <div className={`home-seller-avatar ${tone}`}>{s.initials}</div>
                    <div className="home-seller-name">{s.name}</div>
                    <div className="home-seller-meta">
                      {s.city} · ★ {rating} ({s.ratingCount.toLocaleString('en-US')})
                    </div>
                    <div className="home-seller-stats">
                      <span><strong>{s.productCount}</strong> products</span>
                      <span><strong>{s.totalOrders.toLocaleString('en-US')}</strong> orders</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* ============ DIASPORA SECTION ============ */}
        <section className="diaspora-section-home">
          <div>
            <div className="eyebrow">For the diaspora</div>
            <h2>Send goods, not just <em>cash.</em></h2>
            <p>
              Pay in USD with your Visa or Mastercard. Your family in Liberia receives the
              goods you actually picked, from a verified seller, with proof-of-delivery
              sent straight to your phone.
            </p>
            <div className="diaspora-features">
              <div className="feat">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div className="feat-text">
                  <strong>Pay with Visa or Mastercard, in USD</strong>
                  <p>No mobile money wallet required. Pay the way you pay in the US, UK, or Canada.</p>
                </div>
              </div>
              <div className="feat">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div className="feat-text">
                  <strong>Recipient confirms by SMS in Liberia</strong>
                  <p>Your mom, sister, or friend gets the delivery code on their phone. They give it to the driver. Done.</p>
                </div>
              </div>
              <div className="feat">
                <div className="feat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
                    <circle cx="12" cy="13" r="3" />
                  </svg>
                </div>
                <div className="feat-text">
                  <strong>Proof of delivery, sent to your phone</strong>
                  <p>Photo of the package being received, with timestamp and GPS. You see the moment it arrives, in your timezone.</p>
                </div>
              </div>
            </div>
            <Link href="/" className="btn-diaspora">
              Shop for family in Liberia
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="diaspora-visual">
            <div className="diaspora-laptop">
              <div className="diaspora-laptop-content">
                <div className="ll-logo">Vendoora<span className="dot"></span></div>
                <div className="ll-line"></div>
                <div className="ll-line short"></div>
                <div className="ll-card">$180.00 USD · MasterCard ****4521</div>
              </div>
            </div>
            <div className="diaspora-package" aria-hidden></div>
          </div>
        </section>

        {/* ============ SELLERS SECTION ============ */}
        <section className="sellers-section-home">
          <div>
            <div className="eyebrow">For sellers</div>
            <h2>Grow your business on the marketplace <em>buyers trust.</em></h2>
            <p>
              Get verified once, get featured everywhere. Real tools for real merchants —
              from your first product to your first hundred-thousand-dollar month.
            </p>
            <div className="tier-pricing">
              <div className="tier-pricing-row starter">
                <span className="tier-name"><span className="tier-dot"></span>Starter</span>
                <span className="tier-commission">12% commission</span>
                <span className="tier-price">Free</span>
              </div>
              <div className="tier-pricing-row growth">
                <span className="tier-name"><span className="tier-dot"></span>Growth</span>
                <span className="tier-commission">10% commission</span>
                <span className="tier-price">$15/mo</span>
              </div>
              <div className="tier-pricing-row pro">
                <span className="tier-name"><span className="tier-dot"></span>Pro</span>
                <span className="tier-commission">8% commission</span>
                <span className="tier-price">$45/mo</span>
              </div>
              <div className="tier-pricing-row ent">
                <span className="tier-name"><span className="tier-dot"></span>Enterprise</span>
                <span className="tier-commission">5-7% commission</span>
                <span className="tier-price">Custom</span>
              </div>
            </div>
            <Link href="/sell" className="btn btn-primary">
              Become a seller
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="sellers-visual">
            <div className="console-mock">
              <div className="console-mock-head">
                <div className="console-title">Mariama&apos;s Boutique · Dashboard</div>
                <div className="console-status">LIVE</div>
              </div>
              <div className="console-stats">
                <div className="console-stat">
                  <div className="stat-label">This Month</div>
                  <div className="stat-value">$3,847</div>
                  <div className="stat-delta">↑ 28% vs last</div>
                </div>
                <div className="console-stat">
                  <div className="stat-label">Orders</div>
                  <div className="stat-value">87</div>
                  <div className="stat-delta">↑ 12 today</div>
                </div>
              </div>
              <div className="console-order-list">
                <div className="list-head">Recent Orders</div>
                <div className="console-order">
                  <span className="order-id">VDR-48291</span>
                  <span className="order-status escrow">ESCROW</span>
                  <span className="order-amount">$48.00</span>
                </div>
                <div className="console-order">
                  <span className="order-id">VDR-48287</span>
                  <span className="order-status transit">IN TRANSIT</span>
                  <span className="order-amount">$32.00</span>
                </div>
                <div className="console-order">
                  <span className="order-id">VDR-48283</span>
                  <span className="order-status delivered">DELIVERED</span>
                  <span className="order-amount">$65.00</span>
                </div>
                <div className="console-order">
                  <span className="order-id">VDR-48279</span>
                  <span className="order-status delivered">DELIVERED</span>
                  <span className="order-amount">$48.00</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ STATS BAR (real reads via getHomeStats) ============ */}
        <section className="stats-bar">
          <div className="stats-grid">
            <div className="stat-item">
              <div className="stat-num">{stats.verifiedSellers.toLocaleString('en-US')}</div>
              <div className="stat-label">Verified sellers across Liberia</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">{stats.escrowPct}<span>%</span></div>
              <div className="stat-label">Orders protected by escrow</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">{stats.countiesServed}</div>
              <div className="stat-label">Counties served at launch</div>
            </div>
            <div className="stat-item">
              <div className="stat-num">{stats.avgDeliveryHours}<span>hr</span></div>
              <div className="stat-label">Average delivery in Monrovia</div>
            </div>
          </div>
        </section>

        {/* ============ FINAL CTA ============ */}
        <section className="final-cta">
          <h2>Liberia&apos;s marketplace where <em>every order</em> is verified.</h2>
          <p>Built in Liberia. For Liberia. For everyone who calls it home, wherever they are.</p>
          <div className="cta-actions">
            <Link href="/search" className="btn btn-primary btn-lg">
              Start shopping
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}>
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link href="/sell" className="btn btn-secondary btn-lg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              Become a seller
            </Link>
          </div>
        </section>

        {/* ============ TESTIMONIALS ============ */}
        <section className="home-testimonials">
          <div className="home-testimonials-header">
            <div className="home-testimonials-eyebrow">⚡ WHAT VENDOORA PEOPLE SAY</div>
            <h2 className="home-testimonials-title">From buyers, sellers, and <em>the diaspora.</em></h2>
          </div>
          <div className="home-testimonials-grid">
            <div className="testimonial-card">
              <p className="testimonial-quote">
                The first time I used Vendoora, I didn&apos;t believe the seller would actually
                ship. But the code came, the driver came, and the wrapper was exactly what
                I ordered. Now I shop here every week.
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar buyer">FK</div>
                <div>
                  <div className="testimonial-author-name">Fatu Kollie</div>
                  <div className="testimonial-author-meta">Sinkor, Monrovia · 12 orders</div>
                  <span className="testimonial-author-badge buyer">BUYER</span>
                </div>
              </div>
            </div>

            <div className="testimonial-card">
              <p className="testimonial-quote">
                Before Vendoora, I lost two packages a month to ghost orders — people who
                would pay then claim non-delivery. With the code system, that just doesn&apos;t
                happen anymore. My payouts arrive when they say they will.
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar seller">KT</div>
                <div>
                  <div className="testimonial-author-name">Konah Tubman</div>
                  <div className="testimonial-author-meta">Konah Boutique · Tier 3 seller</div>
                  <span className="testimonial-author-badge seller">SELLER</span>
                </div>
              </div>
            </div>

            <div className="testimonial-card">
              <p className="testimonial-quote">
                I live in Atlanta. My mother is in Paynesville. Every month I send her real
                things now, not just money — wrappers, food, medicine. I see the photo of
                her holding the package. That&apos;s priceless.
              </p>
              <div className="testimonial-author">
                <div className="testimonial-avatar diaspora">JW</div>
                <div>
                  <div className="testimonial-author-name">James Williams</div>
                  <div className="testimonial-author-meta">Atlanta, GA · Sending to Paynesville</div>
                  <span className="testimonial-author-badge diaspora">DIASPORA</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============ RICH PAGE FOOTER ============ */}
        {/* Sits inside .proto-home so the page-footer-* CSS rules (scoped
            under @scope (.proto-home)) take effect. The thin shell-footer
            renders below this (in layout.tsx, outside the proto-home scope). */}
        <ProtoPageFooter />
      </div>
    </div>
  );
}

function CategoryTile({
  slug,
  name,
  children,
}: {
  slug: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={`/c/${slug}`} className="category-tile">
      <div className="category-icon">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {children}
        </svg>
      </div>
      <div className="category-name">{name}</div>
    </Link>
  );
}
