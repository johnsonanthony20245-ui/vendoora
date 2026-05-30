import Stripe from 'stripe';

/**
 * Stripe server adapter. Reads STRIPE_SECRET_KEY from the environment; when it
 * is absent the rest of the app degrades gracefully (the Card path falls back
 * to the mock flow), the same pattern as the Clerk gate. Test-mode keys are
 * fully functional — only real money movement is gated behind production keys.
 */

const secretKey = process.env.STRIPE_SECRET_KEY;

export const IS_STRIPE_ENABLED = Boolean(secretKey);

let client: Stripe | null = null;

/** The Stripe client. Throws if STRIPE_SECRET_KEY is not configured. */
export function getStripe(): Stripe {
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!client) {
    // No explicit apiVersion → use the SDK's pinned version.
    client = new Stripe(secretKey, { typescript: true });
  }
  return client;
}

export function getStripePublishableKey(): string | null {
  return process.env.STRIPE_PUBLISHABLE_KEY ?? null;
}

/**
 * Verify + parse a Stripe webhook payload. Throws if the signature is invalid
 * or STRIPE_WEBHOOK_SECRET is not configured.
 */
export function constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return getStripe().webhooks.constructEvent(payload, signature, webhookSecret);
}
