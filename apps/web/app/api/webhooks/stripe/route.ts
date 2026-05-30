import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { prisma, type Prisma } from '@vendoora/db';
import { constructWebhookEvent } from '../../../../lib/stripe';
import { finalizePaidOrder } from '../../../../lib/order';

/**
 * Stripe webhook — the source of truth for "payment succeeded". On
 * payment_intent.succeeded we finalize the order (PAID + escrow + delivery
 * code) via the shared, idempotent finalizePaidOrder. Signature is verified
 * against STRIPE_WEBHOOK_SECRET; the order id rides in the PaymentIntent
 * metadata set when the intent was created, and the captured amount/currency
 * is reconciled against the order before anything is marked PAID.
 *
 * Status semantics (so Stripe's retry behaviour is correct, not incidental):
 *   - finalized / already finalized → 200 (no retry needed)
 *   - order not found yet (webhook beat the create-intent commit) → 503 (retry)
 *   - amount mismatch → 200 + audit (don't retry a tampered/mismatched charge;
 *     surface it for manual review instead)
 */
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  // Raw body is required for signature verification.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent;
    const orderId = intent.metadata?.['order_id'];
    if (!orderId) {
      return NextResponse.json({ received: true, ignored: 'no order_id' });
    }

    const result = await finalizePaidOrder(prisma, {
      orderId,
      provider: 'stripe',
      providerPaymentId: intent.id,
      expectedAmountCents: intent.amount_received ?? intent.amount,
      expectedCurrency: intent.currency,
    });

    if (!result.finalized && result.reason === 'not_found') {
      // The create-intent write may not have committed yet — let Stripe retry.
      return NextResponse.json({ error: 'order not found' }, { status: 503 });
    }

    if (!result.finalized && result.reason === 'amount_mismatch') {
      await prisma.auditLog.create({
        data: {
          actor_system: true,
          action: 'payment.amount_mismatch',
          resource_type: 'order',
          resource_id: orderId,
          metadata: {
            payment_intent_id: intent.id,
            captured_amount_cents: intent.amount_received ?? intent.amount,
            currency: intent.currency,
          } satisfies Prisma.InputJsonValue,
        },
      });
      // Verified event, but we refuse to finalize a mismatched charge.
      return NextResponse.json({ received: true, ignored: 'amount_mismatch' });
    }
  }

  return NextResponse.json({ received: true });
}
