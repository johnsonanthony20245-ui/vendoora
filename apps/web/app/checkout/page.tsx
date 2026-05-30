import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { CheckoutForm } from '../../components/CheckoutForm';
import { getStripePublishableKey, IS_STRIPE_ENABLED } from '../../lib/stripe';

/**
 * Checkout — mirrors docs/prototype/Vendoora_App.html `Screens.checkout()`.
 * Wrapped in <div class="proto-cart"> so the scoped prototype-cart.css applies.
 *
 * The page is a server component that loads the cart + zones + line totals,
 * then hands them to the <CheckoutForm/> client component. The form posts to
 * the placeOrder server action for MoMo/Orange (and Card when Stripe isn't
 * configured); for Card + Stripe it opens the inline Payment Element and the
 * card is confirmed via Stripe.js without ever touching our server.
 */
export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

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

  const zones = (
    await prisma.deliveryZone.findMany({
      where: { is_active: true },
      orderBy: { base_delivery_fee: 'asc' },
    })
  ).map((z) => ({
    id: z.id,
    name: z.name,
    baseFee: Number(z.base_delivery_fee),
    etaHours: z.estimated_delivery_hours,
  }));

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

        <CheckoutForm
          zones={zones}
          itemRows={itemRows}
          subtotal={subtotal}
          delivery={delivery}
          total={total}
          initialError={error ? decodeURIComponent(error) : null}
          stripePublishableKey={IS_STRIPE_ENABLED ? getStripePublishableKey() : null}
        />
      </div>
    </div>
  );
}
