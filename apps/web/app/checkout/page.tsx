import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { placeOrder } from '../actions/order';

/**
 * Checkout — mirrors docs/prototype/Vendoora_App.html `Screens.checkout()`.
 * Wrapped in <div class="proto-cart"> so the scoped prototype-cart.css applies.
 *
 * Section order matches the prototype:
 *   checkout-steps (1 active / 2 / 3) → screen-title → checkout-layout:
 *     left  = delivery address card + payment-method card
 *     right = cart-summary aside with line items + totals + Place Order
 *
 * Form submits to placeOrder() server action — field names match the
 * action's existing API (buyer_name, buyer_email, delivery_street,
 * delivery_zone, payment_method, etc.).
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

const PAYMENT_OPTIONS = [
  {
    value: 'MTN_MOMO',
    label: 'MTN Mobile Money',
    desc: "Pay from your MoMo wallet. You'll receive a USSD prompt to confirm.",
    iconText: 'M',
    iconBg: '#FFCB05',
    iconColor: '#000',
  },
  {
    value: 'ORANGE_MONEY',
    label: 'Orange Money',
    desc: 'Pay from your Orange Money wallet.',
    iconText: 'O',
    iconBg: '#FF6600',
    iconColor: '#fff',
  },
  {
    value: 'CARD',
    label: 'Debit / Credit card',
    desc: 'Visa, Mastercard, or local debit card. Processed by Stripe.',
    iconText: '💳',
    iconBg: 'var(--color-bg-app)',
    iconColor: 'inherit',
  },
] as const;

export default async function CheckoutPage({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const jar = await cookies();
  const sessionId = jar.get('vdr_cart')?.value ?? null;

  const cart = sessionId
    ? await prisma.cart.findFirst({
        where: { session_id: sessionId },
        include: { items: true },
      })
    : null;
  if (!cart || cart.items.length === 0) redirect('/cart');

  const productIds = cart.items.map((i) => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, base_price: true },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const itemRows = cart.items.map((ci) => {
    const p = productById.get(ci.product_id);
    return {
      name: p?.name ?? '(deleted)',
      qty: ci.quantity,
      price: p ? Number(p.base_price) : 0,
    };
  });
  const subtotal = itemRows.reduce((s, r) => s + r.price * r.qty, 0);
  const delivery = subtotal >= 50 ? 0 : 2;
  const total = subtotal + delivery;

  const zones = await prisma.deliveryZone.findMany({
    where: { is_active: true },
    orderBy: { base_delivery_fee: 'asc' },
  });

  return (
    <div className="proto-cart">
      <div className="screen-container">
        <div className="checkout-steps">
          <div className="checkout-step active">
            <div className="checkout-step-num">1</div>Address &amp; payment
          </div>
          <span className="checkout-step-sep">→</span>
          <div className="checkout-step">
            <div className="checkout-step-num">2</div>Review
          </div>
          <span className="checkout-step-sep">→</span>
          <div className="checkout-step">
            <div className="checkout-step-num">3</div>Confirmation
          </div>
        </div>

        <h1 className="screen-title">Checkout</h1>

        {error && (
          <div
            style={{
              marginBottom: 'var(--space-4)',
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--red-50)',
              border: '1px solid var(--red-100)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--red-700)',
              fontSize: 13,
            }}
          >
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={placeOrder}>
          <div className="checkout-layout">
            <div>
              <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  Delivery address
                </h3>
                <div className="field">
                  <label className="label" htmlFor="buyer_name">
                    Full name
                  </label>
                  <input
                    id="buyer_name"
                    name="buyer_name"
                    className="input"
                    required
                    defaultValue="Anthony Tubman"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="buyer_phone">
                    Phone number
                  </label>
                  <input
                    id="buyer_phone"
                    name="buyer_phone"
                    type="tel"
                    className="input"
                    defaultValue="+231 77 555 0142"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="buyer_email">
                    Email
                  </label>
                  <input
                    id="buyer_email"
                    name="buyer_email"
                    type="email"
                    className="input"
                    required
                    defaultValue="buyer@vendoora.test"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="delivery_street">
                    Address line 1
                  </label>
                  <input
                    id="delivery_street"
                    name="delivery_street"
                    className="input"
                    required
                    defaultValue="14 Tubman Boulevard, Sinkor"
                  />
                </div>
                <div className="field-row">
                  <div>
                    <label className="label" htmlFor="delivery_city">
                      City
                    </label>
                    <input
                      id="delivery_city"
                      name="delivery_city"
                      className="input"
                      required
                      defaultValue="Monrovia"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="delivery_county">
                      County
                    </label>
                    <input
                      id="delivery_county"
                      name="delivery_county"
                      className="input"
                      defaultValue="Montserrado"
                    />
                  </div>
                </div>
                <div className="field">
                  <label className="label" htmlFor="delivery_zone">
                    Delivery zone
                  </label>
                  <select
                    id="delivery_zone"
                    name="delivery_zone"
                    className="input"
                    required
                    defaultValue="sinkor"
                  >
                    {zones.map((z) => (
                      <option key={z.id} value={z.name}>
                        {z.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        {' — $'}
                        {Number(z.base_delivery_fee).toFixed(2)}, ~
                        {z.estimated_delivery_hours}h
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="label" htmlFor="delivery_notes">
                    Delivery notes (optional)
                  </label>
                  <textarea
                    id="delivery_notes"
                    name="delivery_notes"
                    className="input"
                    placeholder="Apartment number, gate code, landmark..."
                  />
                </div>
                <input type="hidden" name="delivery_country" value="LR" />
              </div>

              <div className="card">
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  Payment method
                </h3>

                {PAYMENT_OPTIONS.map((opt, i) => (
                  <label
                    key={opt.value}
                    className={`payment-option${i === 0 ? ' selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="payment_method"
                      value={opt.value}
                      defaultChecked={i === 0}
                      style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                    />
                    <div className="payment-option-radio"></div>
                    <div
                      className="payment-option-icon"
                      style={{ background: opt.iconBg, color: opt.iconColor }}
                    >
                      {opt.iconText}
                    </div>
                    <div className="payment-option-body">
                      <div className="payment-option-name">{opt.label}</div>
                      <div className="payment-option-desc">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <aside className="cart-summary">
              <div className="cart-summary-title">Order summary</div>
              {itemRows.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2) 0',
                    fontSize: 12,
                    gap: 'var(--space-2)',
                  }}
                >
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {r.name.split('—')[0]?.trim()} × {r.qty}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    ${(r.price * r.qty).toFixed(2)}
                  </span>
                </div>
              ))}
              <div
                style={{
                  borderTop: '1px solid var(--color-border)',
                  marginTop: 'var(--space-2)',
                  paddingTop: 'var(--space-2)',
                }}
              ></div>
              <div className="cart-summary-row">
                <span>Subtotal</span>
                <span className="value">${subtotal.toFixed(2)}</span>
              </div>
              <div className="cart-summary-row">
                <span>Delivery</span>
                <span className="value">
                  {delivery === 0 ? 'Free' : `$${delivery.toFixed(2)}`}
                </span>
              </div>
              <div className="cart-summary-row total">
                <span>Total</span>
                <span className="value">${total.toFixed(2)}</span>
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block btn-lg"
                style={{ marginTop: 'var(--space-4)' }}
              >
                Place order (escrow)
              </button>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                  marginTop: 'var(--space-3)',
                  lineHeight: 1.5,
                }}
              >
                🔒 Your ${total.toFixed(2)} is held safely by Vendoora until you confirm
                delivery with your 6-digit code.
              </div>
            </aside>
          </div>
        </form>
      </div>
    </div>
  );
}
