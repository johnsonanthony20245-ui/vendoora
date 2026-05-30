import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { prisma } from '@vendoora/db';

/**
 * Order confirmation — mirrors docs/prototype/Vendoora_App.html
 * `Screens.confirmed()`. Wrapped in <div class="proto-cart"> so the
 * scoped prototype-cart.css (.confirmation-* rules) applies.
 *
 * Layout matches the prototype:
 *   confirmation-hero (big check + title + escrow subtitle + order id pill
 *     + Track / Keep shopping buttons)
 *   "What happens next" card with 4 numbered steps
 *
 * Step 1 (Payment received) is checkmarked because the order has been
 * placed. Steps 2-4 are inactive numbered circles.
 *
 * The 6-digit delivery code reveal lives below the hero — it's read from
 * the one-shot vdr_dc_<order_number> cookie placed by placeOrder().
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function OrderConfirmationPage({ params }: PageProps) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    include: {
      items: { include: { seller: { select: { business_name: true } } } },
      escrow_holds: true,
    },
  });
  if (!order) notFound();

  const jar = await cookies();
  const deliveryCodePlaintext = jar.get(`vdr_dc_${order.order_number}`)?.value ?? null;

  // Async Card path: Stripe redirected back, but the payment_intent.succeeded
  // webhook may not have run yet → order is still PENDING_PAYMENT. Show a
  // "confirming" interstitial that meta-refreshes every 2s until it flips.
  if (order.status === 'PENDING_PAYMENT') {
    return (
      <div className="proto-cart">
        <meta httpEquiv="refresh" content="2" />
        <div className="screen-container">
          <div className="confirmation-hero" style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)' }}>
            <div className="confirmation-check" style={{ background: 'var(--amber-100)', color: 'var(--amber-700)' }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <polyline points="12 7 12 12 15 14" />
              </svg>
            </div>
            <h1 className="confirmation-title">Confirming your payment…</h1>
            <p className="confirmation-subtitle">
              Stripe is finalizing the charge. This page refreshes automatically — usually a few seconds.
            </p>
            <div className="confirmation-order-id">
              <span style={{ color: 'var(--color-text-muted)' }}>Order</span>
              <span>{order.order_number}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="proto-cart">
      <div className="screen-container">
        <div className="confirmation-hero">
          <div className="confirmation-check">
            <svg
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="confirmation-title">Order placed!</h1>
          <p className="confirmation-subtitle">
            Your payment of{' '}
            <strong>${Number(order.total_amount).toFixed(2)}</strong> is now held safely
            in escrow.
          </p>
          <div className="confirmation-order-id">
            <span style={{ color: 'var(--color-text-muted)' }}>Order</span>
            <span>{order.order_number}</span>
          </div>

          <div
            style={{
              marginTop: 'var(--space-6)',
              display: 'flex',
              gap: 'var(--space-3)',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href={`/orders/${order.order_number}`}
              className="btn btn-primary"
            >
              Track your order
            </Link>
            <Link href="/" className="btn btn-secondary">
              Keep shopping
            </Link>
          </div>
        </div>

        {/* Delivery code reveal — only on the very first paint after placeOrder
            stores the plaintext in vdr_dc_<order> cookie; the cookie clears
            on subsequent visits so the code never persists. */}
        {deliveryCodePlaintext && (
          <div
            className="card"
            style={{
              marginBottom: 'var(--space-4)',
              borderColor: 'var(--color-action-primary)',
              background:
                'linear-gradient(135deg, rgba(26,61,174,0.04) 0%, var(--color-bg-surface) 100%)',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--color-accent)',
                marginBottom: 'var(--space-2)',
              }}
            >
              🔐 YOUR 6-DIGIT DELIVERY CODE
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 36,
                fontWeight: 800,
                letterSpacing: 12,
                color: 'var(--color-action-primary)',
                lineHeight: 1.2,
              }}
            >
              {deliveryCodePlaintext.split('').join(' ')}
            </div>
            <p
              style={{
                fontSize: 12,
                color: 'var(--color-text-muted)',
                marginTop: 'var(--space-2)',
                lineHeight: 1.5,
              }}
            >
              Save this somewhere safe. You&apos;ll need it when the driver arrives to
              hand over the package. Vendoora will also send it by SMS once the
              seller marks the order as shipped.
            </p>
          </div>
        )}

        <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginBottom: 'var(--space-3)',
            }}
          >
            What happens next
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr',
              gap: 'var(--space-3) var(--space-4)',
              alignItems: 'start',
            }}
          >
            <div
              className="confirmation-check"
              style={{ width: 32, height: 32 }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <strong>Payment received and held safely</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Your money is in escrow — the seller has not been paid yet.
              </div>
            </div>

            <NumberCircle n={2} />
            <div>
              <strong>Seller prepares your order</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Usually within 24 hours. You&apos;ll get an SMS when a driver picks up.
              </div>
            </div>

            <NumberCircle n={3} />
            <div>
              <strong>You receive your 6-digit delivery code</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Sent via SMS the moment the driver picks up. Only you see it.
              </div>
            </div>

            <NumberCircle n={4} />
            <div>
              <strong>Code match = delivery confirmed = payment released</strong>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Driver enters your code at your door. If it doesn&apos;t match, payment
                stays in escrow.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NumberCircle({ n }: { n: number }) {
  return (
    <div
      className="confirmation-check"
      style={{
        width: 32,
        height: 32,
        background: 'var(--color-bg-app)',
        color: 'var(--color-text-muted)',
      }}
    >
      <span style={{ fontWeight: 700 }}>{n}</span>
    </div>
  );
}
