'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { placeOrder, createCardPaymentIntent } from '../app/actions/order';

/**
 * Checkout form, client component. Renders all address + payment-method fields
 * and branches by payment method on submit:
 *
 *   MoMo / Orange (or Card when Stripe isn't configured) → posts to the
 *     placeOrder server action (mock rail).
 *   Card + Stripe configured → calls createCardPaymentIntent (gets clientSecret),
 *     mounts inline Stripe Elements (PaymentElement), and on confirm hands the
 *     card to Stripe.js (the card never touches our server). On success Stripe
 *     redirects to /order-confirmation/[orderNumber], where the webhook will
 *     have finalized the order (or finalization is a refresh away).
 */

const PAYMENT_OPTIONS = [
  { value: 'MTN_MOMO', label: 'MTN Mobile Money', desc: "Pay from your MoMo wallet. You'll receive a USSD prompt to confirm.", iconText: 'M', iconBg: '#FFCB05', iconColor: '#000' },
  { value: 'ORANGE_MONEY', label: 'Orange Money', desc: 'Pay from your Orange Money wallet.', iconText: 'O', iconBg: '#FF6600', iconColor: '#fff' },
  { value: 'CARD', label: 'Debit / Credit card', desc: 'Visa, Mastercard, or local debit card. Processed by Stripe.', iconText: '💳', iconBg: 'var(--color-bg-app)', iconColor: 'inherit' },
] as const;

interface ZoneOpt { id: string; name: string; baseFee: number; etaHours: number }
interface ItemRow { name: string; qty: number; price: number }

interface Props {
  zones: ZoneOpt[];
  itemRows: ItemRow[];
  subtotal: number;
  delivery: number;
  total: number;
  initialError: string | null;
  /** null = Stripe not configured → Card falls back to the mock rail. */
  stripePublishableKey: string | null;
}

export function CheckoutForm({ zones, itemRows, subtotal, delivery, total, initialError, stripePublishableKey }: Props) {
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_OPTIONS[number]['value']>('MTN_MOMO');
  const [cardSession, setCardSession] = useState<{ clientSecret: string; orderNumber: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  const stripeEnabled = Boolean(stripePublishableKey);
  const useStripeForCard = paymentMethod === 'CARD' && stripeEnabled;

  // loadStripe should be called once outside React lifecycle to share the instance.
  // useMemo here means we recompute only when the publishable key changes (it doesn't).
  const stripePromise: Promise<StripeJs | null> | null = useMemo(
    () => (stripePublishableKey ? loadStripe(stripePublishableKey) : null),
    [stripePublishableKey],
  );

  async function onPlaceOrCard(event: FormEvent<HTMLFormElement>): Promise<void> {
    if (!useStripeForCard) return; // let the native form post to placeOrder for the mock rails

    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    const result = await createCardPaymentIntent(fd);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setCardSession({ clientSecret: result.clientSecret, orderNumber: result.orderNumber });
  }

  // Step B (inline Elements): after we have a clientSecret, swap the bottom of
  // the form for the PaymentElement + a "Pay $X" button.
  if (cardSession && stripePromise) {
    return (
      <div className="checkout-layout">
        <div>
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 'var(--space-2)' }}>Pay with card</h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)' }}>
              Order <strong style={{ fontFamily: 'var(--font-mono)' }}>{cardSession.orderNumber}</strong> is held in
              <strong> PENDING_PAYMENT</strong> until your card confirms. The card never touches our server.
            </p>
            <Elements stripe={stripePromise} options={{ clientSecret: cardSession.clientSecret }}>
              <PayCardSection orderNumber={cardSession.orderNumber} total={total} />
            </Elements>
            <button
              type="button"
              onClick={() => setCardSession(null)}
              style={{ marginTop: 'var(--space-3)', background: 'transparent', border: 'none', color: 'var(--color-text-muted)', fontSize: 12, cursor: 'pointer' }}
            >
              ← Change details
            </button>
          </div>
        </div>
        <CartSummary itemRows={itemRows} subtotal={subtotal} delivery={delivery} total={total} placeOrderLabel={null} />
      </div>
    );
  }

  // Step A: the full form. For MoMo/Orange/Card-without-Stripe this submits to
  // placeOrder (server action); for Card+Stripe we intercept onSubmit above.
  return (
    <form action={placeOrder} onSubmit={onPlaceOrCard}>
      {error && (
        <div
          style={{
            marginBottom: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)',
            background: 'var(--red-50)', border: '1px solid var(--red-100)',
            borderRadius: 'var(--radius-lg)', color: 'var(--red-700)', fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
      <div className="checkout-layout">
        <div>
          <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 'var(--space-4)' }}>Delivery address</h3>
            <div className="field">
              <label className="label" htmlFor="buyer_name">Full name</label>
              <input id="buyer_name" name="buyer_name" className="input" required defaultValue="Anthony Tubman" />
            </div>
            <div className="field">
              <label className="label" htmlFor="buyer_phone">Phone number</label>
              <input id="buyer_phone" name="buyer_phone" type="tel" className="input" defaultValue="+231 77 555 0142" />
            </div>
            <div className="field">
              <label className="label" htmlFor="buyer_email">Email</label>
              <input id="buyer_email" name="buyer_email" type="email" className="input" required defaultValue="buyer@vendoora.test" />
            </div>
            <div className="field">
              <label className="label" htmlFor="delivery_street">Address line 1</label>
              <input id="delivery_street" name="delivery_street" className="input" required defaultValue="14 Tubman Boulevard, Sinkor" />
            </div>
            <div className="field-row">
              <div>
                <label className="label" htmlFor="delivery_city">City</label>
                <input id="delivery_city" name="delivery_city" className="input" required defaultValue="Monrovia" />
              </div>
              <div>
                <label className="label" htmlFor="delivery_county">County</label>
                <input id="delivery_county" name="delivery_county" className="input" defaultValue="Montserrado" />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="delivery_zone">Delivery zone</label>
              <select id="delivery_zone" name="delivery_zone" className="input" required defaultValue="sinkor">
                {zones.map((z) => (
                  <option key={z.id} value={z.name}>
                    {z.name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    {' — $'}{z.baseFee.toFixed(2)}, ~{z.etaHours}h
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="delivery_notes">Delivery notes (optional)</label>
              <textarea id="delivery_notes" name="delivery_notes" className="input" placeholder="Apartment number, gate code, landmark..." />
            </div>
            <input type="hidden" name="delivery_country" value="LR" />
          </div>

          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 'var(--space-4)' }}>Payment method</h3>
            {PAYMENT_OPTIONS.map((opt) => {
              const selected = paymentMethod === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`payment-option${selected ? ' selected' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  <input
                    type="radio"
                    name="payment_method"
                    value={opt.value}
                    checked={selected}
                    onChange={() => setPaymentMethod(opt.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  />
                  <div className="payment-option-radio"></div>
                  <div className="payment-option-icon" style={{ background: opt.iconBg, color: opt.iconColor }}>
                    {opt.iconText}
                  </div>
                  <div className="payment-option-body">
                    <div className="payment-option-name">{opt.label}</div>
                    <div className="payment-option-desc">{opt.desc}</div>
                  </div>
                </label>
              );
            })}
            {paymentMethod === 'CARD' && !stripeEnabled && (
              <p style={{ marginTop: 'var(--space-3)', fontSize: 12, color: 'var(--color-text-muted)' }}>
                Card processing is not configured in this environment — the order will be placed against the mock rail.
              </p>
            )}
          </div>
        </div>

        <CartSummary
          itemRows={itemRows}
          subtotal={subtotal}
          delivery={delivery}
          total={total}
          placeOrderLabel={
            useStripeForCard
              ? submitting ? 'Starting…' : 'Continue to card'
              : 'Place order (escrow)'
          }
        />
      </div>
    </form>
  );
}

/**
 * The PaymentElement-mounted section. Lives inside <Elements> so it can call
 * useStripe + useElements. Confirm hands the card to Stripe; Stripe redirects
 * to /order-confirmation/[orderNumber] on success (the webhook will already
 * have finalized the order, or a refresh away from it).
 */
function PayCardSection({ orderNumber, total }: { orderNumber: string; total: number }): React.ReactElement {
  const stripe = useStripe();
  const elements = useElements();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!stripe || !elements) return;
    setConfirming(true);
    setError(null);

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation/${orderNumber}`,
      },
    });
    // If we're still here, confirmation failed (no redirect); show the error.
    if (stripeError) setError(stripeError.message ?? 'Card was declined.');
    setConfirming(false);
  }

  return (
    <form onSubmit={onConfirm}>
      <PaymentElement />
      {error && (
        <div
          style={{
            marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)',
            background: 'var(--red-50)', border: '1px solid var(--red-100)',
            borderRadius: 'var(--radius-md)', color: 'var(--red-700)', fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || confirming}
        className="btn btn-primary btn-block btn-lg"
        style={{ marginTop: 'var(--space-4)' }}
      >
        {confirming ? 'Confirming…' : `Pay $${total.toFixed(2)}`}
      </button>
    </form>
  );
}

function CartSummary({
  itemRows, subtotal, delivery, total, placeOrderLabel,
}: {
  itemRows: ItemRow[]; subtotal: number; delivery: number; total: number;
  /** When null the summary aside renders without a submit button (Elements step). */
  placeOrderLabel: string | null;
}): React.ReactElement {
  return (
    <aside className="cart-summary">
      <div className="cart-summary-title">Order summary</div>
      {itemRows.map((r, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) 0', fontSize: 12, gap: 'var(--space-2)' }}>
          <span style={{ color: 'var(--color-text-muted)' }}>{r.name.split('—')[0]?.trim()} × {r.qty}</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>${(r.price * r.qty).toFixed(2)}</span>
        </div>
      ))}
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)' }}></div>
      <div className="cart-summary-row"><span>Subtotal</span><span className="value">${subtotal.toFixed(2)}</span></div>
      <div className="cart-summary-row"><span>Delivery</span><span className="value">{delivery === 0 ? 'Free' : `$${delivery.toFixed(2)}`}</span></div>
      <div className="cart-summary-row total"><span>Total</span><span className="value">${total.toFixed(2)}</span></div>
      {placeOrderLabel !== null && (
        <button type="submit" className="btn btn-primary btn-block btn-lg" style={{ marginTop: 'var(--space-4)' }}>
          {placeOrderLabel}
        </button>
      )}
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
        🔒 Your ${total.toFixed(2)} is held safely by Vendoora until you confirm delivery with your 6-digit code.
      </div>
    </aside>
  );
}
