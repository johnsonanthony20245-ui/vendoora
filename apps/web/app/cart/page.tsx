import Link from 'next/link';
import { cookies } from 'next/headers';
import { prisma } from '@vendoora/db';
import { removeCartItem, updateCartItemQuantity } from '../actions/cart';
import { resolveProductImageUrl } from '../../lib/r2';

/**
 * Cart page — mirrors docs/prototype/Vendoora_App.html `Screens.cart()`.
 * Wrapped in <div class="proto-cart"> so the scoped prototype-cart.css applies.
 *
 * Section order matches the prototype verbatim:
 *   empty state — OR — cart-layout with cart-items (grouped by seller) +
 *   right-rail cart-summary.
 *
 * Delivery fee + free-over-50 logic mirrors the prototype's App.cartTotals():
 *   - subtotal = Σ price × qty
 *   - delivery = subtotal >= 50 ? 0 : 2
 *   - total    = subtotal + delivery
 */
export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const jar = await cookies();
  const sessionId = jar.get('vdr_cart')?.value ?? null;

  const cart = sessionId
    ? await prisma.cart.findFirst({
        where: { session_id: sessionId },
        include: { items: true },
      })
    : null;

  // Load product + seller for each cart item; group by seller.
  const itemRows = cart
    ? await Promise.all(
        cart.items.map(async (item) => {
          const product = await prisma.product.findUnique({
            where: { id: item.product_id },
            include: {
              seller: {
                select: {
                  id: true,
                  business_slug: true,
                  business_name: true,
                  kyc_tier: true,
                  business_address: true,
                },
              },
              images: { where: { is_primary: true }, take: 1, select: { url: true } },
            },
          });
          return { item, product };
        }),
      )
    : [];

  const rows = itemRows.filter(
    (r): r is typeof itemRows[number] & { product: NonNullable<typeof r.product> } =>
      r.product !== null,
  );

  // Resolve each row's primary image up front. `images[0].url` may be a
  // direct https URL (seed) or an R2 object key (seller upload via
  // createProduct, PR #25). resolveProductImageUrl passes URLs through and
  // presigns keys for 24h. Keyed by cart_item.id so the JSX can look up by
  // row. PR #29 wired this through home / store / PDP / search; the cart
  // line-item thumbs were missed there and rendered raw keys until now.
  // See lib/r2.ts.
  const imageUrlByItem = new Map(
    await Promise.all(
      rows.map(async (r) => {
        const stored = r.product.images[0]?.url;
        const resolved = stored ? await resolveProductImageUrl(stored) : null;
        return [r.item.id, resolved] as const;
      }),
    ),
  );

  // Empty state.
  if (rows.length === 0) {
    return (
      <div className="proto-cart">
        <div className="screen-container">
          <h1 className="screen-title">Your cart</h1>
          <div className="cart-empty">
            <div className="cart-empty-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              Your cart is empty
            </h2>
            <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-5)' }}>
              Find something authentic from a verified Liberian seller.
            </p>
            <Link href="/search" className="btn btn-primary">
              Browse products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Group by seller_id
  const sellerGroups = new Map<
    string,
    {
      seller: typeof rows[number]['product']['seller'];
      items: { item: typeof rows[number]['item']; product: typeof rows[number]['product'] }[];
    }
  >();
  for (const r of rows) {
    const sid = r.product.seller.id;
    const existing = sellerGroups.get(sid);
    if (existing) {
      existing.items.push(r);
    } else {
      sellerGroups.set(sid, { seller: r.product.seller, items: [r] });
    }
  }

  // Totals — match the prototype's App.cartTotals() shape.
  const subtotal = rows.reduce(
    (s, r) => s + Number(r.item.price_at_add) * r.item.quantity,
    0,
  );
  const delivery = subtotal >= 50 ? 0 : 2;
  const total = subtotal + delivery;
  const itemCount = rows.reduce((s, r) => s + r.item.quantity, 0);

  return (
    <div className="proto-cart">
      <div className="screen-container">
        <h1 className="screen-title">Your cart</h1>
        <p className="screen-subtitle">
          {itemCount} {itemCount === 1 ? 'item' : 'items'} from {sellerGroups.size}{' '}
          {sellerGroups.size === 1 ? 'seller' : 'sellers'}.
        </p>

        <div className="cart-layout">
          <div className="cart-items">
            {Array.from(sellerGroups.values()).map(({ seller, items }) => {
              const sellerCity = extractCity(seller.business_address);
              const sellerQty = items.reduce((s, x) => s + x.item.quantity, 0);
              return (
                <div key={seller.id} className="cart-seller-group">
                  <div className="cart-seller-header">
                    <div className="cart-seller-name">
                      <span className="badge badge-info">TIER {seller.kyc_tier}</span>
                      {seller.business_name} · {sellerCity}
                    </div>
                    <span
                      style={{ color: 'var(--color-text-muted)', fontSize: 12 }}
                    >
                      {sellerQty} item(s)
                    </span>
                  </div>
                  {items.map(({ item, product }) => {
                    const price = Number(item.price_at_add);
                    const lineTotal = price * item.quantity;
                    const img = imageUrlByItem.get(item.id);
                    return (
                      <div key={item.id} className="cart-item">
                        <Link
                          href={`/p/${product.seller.business_slug}/${product.slug}`}
                          className="cart-item-img"
                          style={{
                            background: img
                              ? `center / cover no-repeat url(${img})`
                              : 'radial-gradient(ellipse 80% 60% at 50% 45%, #B6C5EC 0%, #8FA5DD 55%, #5A78C9 100%)',
                          }}
                          aria-label={product.name}
                        />
                        <div>
                          <div className="cart-item-name">{product.name}</div>
                          <div className="cart-item-meta">
                            {product.condition === 'NEW' ? 'Brand new' : product.condition.replace(/_/g, ' ')}
                            {' · '}
                            {product.authenticity_status === 'PROOF_PROVIDED' ||
                            product.authenticity_status === 'PLATFORM_VERIFIED'
                              ? '✓ Authentic'
                              : 'Standard'}
                          </div>
                          <div className="cart-item-actions">
                            <span>Qty:</span>
                            <form action={updateCartItemQuantity} style={{ display: 'inline' }}>
                              <input type="hidden" name="cartItemId" value={item.id} />
                              <input type="hidden" name="delta" value="-1" />
                              <button
                                type="submit"
                                aria-label="Decrease quantity"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 8px' }}
                              >
                                −
                              </button>
                            </form>
                            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                              {item.quantity}
                            </span>
                            <form action={updateCartItemQuantity} style={{ display: 'inline' }}>
                              <input type="hidden" name="cartItemId" value={item.id} />
                              <input type="hidden" name="delta" value="1" />
                              <button
                                type="submit"
                                aria-label="Increase quantity"
                                className="btn btn-ghost btn-sm"
                                style={{ padding: '2px 8px' }}
                              >
                                +
                              </button>
                            </form>
                            <span style={{ margin: '0 var(--space-2)', color: 'var(--color-text-subtle)' }}>
                              ·
                            </span>
                            <form action={removeCartItem} style={{ display: 'inline' }}>
                              <input type="hidden" name="cartItemId" value={item.id} />
                              <button
                                type="submit"
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  padding: 0,
                                  color: 'var(--color-accent)',
                                  cursor: 'pointer',
                                  font: 'inherit',
                                }}
                              >
                                Remove
                              </button>
                            </form>
                          </div>
                        </div>
                        <div className="cart-item-price">${lineTotal.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <aside className="cart-summary">
            <div className="cart-summary-title">Order summary</div>
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <span className="value">${subtotal.toFixed(2)}</span>
            </div>
            <div className="cart-summary-row">
              <span>Delivery</span>
              <span className="value">{delivery === 0 ? 'Free' : `$${delivery.toFixed(2)}`}</span>
            </div>
            {delivery === 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-verified)',
                  padding: '0 0 var(--space-2)',
                }}
              >
                ✓ Free delivery on orders over $50
              </div>
            )}
            <div className="cart-summary-row total">
              <span>Total</span>
              <span className="value">${total.toFixed(2)}</span>
            </div>
            <Link
              href="/checkout"
              className="btn btn-primary btn-block btn-lg"
              style={{ marginTop: 'var(--space-4)' }}
            >
              Checkout (escrow protected)
            </Link>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-muted)',
                textAlign: 'center',
                marginTop: 'var(--space-3)',
                lineHeight: 1.5,
              }}
            >
              🔒 Your payment is held safely by Vendoora until you confirm delivery
              with your 6-digit code.
            </div>
          </aside>
        </div>
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
