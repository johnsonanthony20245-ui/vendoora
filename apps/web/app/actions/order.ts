'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import {
  assembleOrderDraft,
  buildPendingOrder,
  finalizePaidOrder,
  type OrderDraft,
} from '../../lib/order';
import { IS_STRIPE_ENABLED, getStripe, getStripePublishableKey } from '../../lib/stripe';

const CART_COOKIE = 'vdr_cart';

function failValidation(message: string): never {
  redirect(`/checkout?error=${encodeURIComponent(message)}`);
}

function readForm(formData: FormData) {
  return {
    buyer_name: String(formData.get('buyer_name') ?? '').trim(),
    buyer_email: String(formData.get('buyer_email') ?? '').trim(),
    buyer_phone: String(formData.get('buyer_phone') ?? '').trim() || null,
    delivery_street: String(formData.get('delivery_street') ?? '').trim(),
    delivery_city: String(formData.get('delivery_city') ?? '').trim(),
    delivery_county: String(formData.get('delivery_county') ?? '').trim() || null,
    delivery_country: String(formData.get('delivery_country') ?? 'LR').trim(),
    delivery_zone: String(formData.get('delivery_zone') ?? '').trim(),
    delivery_notes: String(formData.get('delivery_notes') ?? '').trim() || null,
    payment_method: String(formData.get('payment_method') ?? '').trim(),
  };
}

async function setDeliveryCodeCookie(orderNumber: string, code: string | null): Promise<void> {
  if (!code) return;
  const jar = await cookies();
  // One-time 5-minute cookie so the confirmation page can show the code once.
  // In production the code arrives by SMS (Africa's Talking, §5).
  jar.set(`vdr_dc_${orderNumber}`, code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
}

/**
 * Place an order via a mock-captured rail (MTN MoMo / Orange Money, or Card
 * when Stripe isn't configured). Builds the PENDING_PAYMENT order then finalizes
 * it immediately. The real Card rail goes through createCardPaymentIntent +
 * the Stripe webhook instead.
 */
export async function placeOrder(formData: FormData): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(CART_COOKIE)?.value;

  const assembled = await assembleOrderDraft(prisma, sessionId, readForm(formData));
  if (!assembled.ok) failValidation(assembled.error);
  const draft: OrderDraft = assembled.draft;

  const pending = await buildPendingOrder(prisma, draft);
  const result = await finalizePaidOrder(prisma, { orderId: pending.orderId, provider: 'wallet' });

  // Clear the cart on success.
  await prisma.cartItem.deleteMany({ where: { cart_id: draft.cartId } });
  await prisma.cart.deleteMany({ where: { id: draft.cartId } });
  jar.delete(CART_COOKIE);

  await setDeliveryCodeCookie(pending.orderNumber, result.deliveryCode);
  redirect(`/order-confirmation/${pending.orderNumber}`);
}

export type CreateCardIntentResult =
  | { ok: true; orderNumber: string; clientSecret: string; publishableKey: string }
  | { ok: false; error: string };

/**
 * Real Card rail: build a PENDING_PAYMENT order and open a Stripe PaymentIntent.
 * Returns the client_secret for the inline Payment Element to confirm. The
 * order is finalized (PAID + escrow) by the payment_intent.succeeded webhook —
 * never here — so a closed browser tab can't strand a paid order.
 */
export async function createCardPaymentIntent(formData: FormData): Promise<CreateCardIntentResult> {
  if (!IS_STRIPE_ENABLED) {
    return { ok: false, error: 'Card payments are not configured yet.' };
  }
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) {
    return { ok: false, error: 'Card payments are not configured yet.' };
  }

  const jar = await cookies();
  const sessionId = jar.get(CART_COOKIE)?.value;

  const assembled = await assembleOrderDraft(prisma, sessionId, {
    ...readForm(formData),
    payment_method: 'CARD',
  });
  if (!assembled.ok) return { ok: false, error: assembled.error };

  const pending = await buildPendingOrder(prisma, assembled.draft);

  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: Math.round(pending.totalAmount * 100),
    currency: pending.currency.toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata: {
      order_id: pending.orderId,
      order_number: pending.orderNumber,
      cart_id: assembled.draft.cartId,
    },
  });

  await prisma.payment.updateMany({
    where: { order_id: pending.orderId },
    data: { provider_payment_id: intent.id },
  });

  if (!intent.client_secret) {
    return { ok: false, error: 'Could not start the card payment. Try again.' };
  }
  return {
    ok: true,
    orderNumber: pending.orderNumber,
    clientSecret: intent.client_secret,
    publishableKey,
  };
}
