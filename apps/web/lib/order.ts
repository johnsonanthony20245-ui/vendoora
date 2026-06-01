import { randomUUID } from 'node:crypto';
import { prisma as defaultPrisma, type Prisma, type PrismaClient } from '@vendoora/db';
import { generateDeliveryCode } from './delivery-code';

/**
 * Order lifecycle, split so the same logic backs both payment paths:
 *
 *   assembleOrderDraft  — validate the cart + checkout form into a clean draft
 *                         (no next/* imports → testable).
 *   buildPendingOrder   — persist Order(PENDING_PAYMENT) + OrderItems + a PENDING
 *                         Payment. No escrow, no code, no cart clear yet.
 *   finalizePaidOrder   — the success transition: PENDING_PAYMENT → PAID, create
 *                         per-seller EscrowHolds (HELD), capture the Payment,
 *                         generate + store the delivery-code hash, audit.
 *                         Idempotent + state-guarded so a webhook retry (or the
 *                         mock path racing it) can't double-finalize.
 *
 * Mock rails (MTN MoMo / Orange / no Stripe) call build → finalize synchronously.
 * The real Card rail calls build, creates a Stripe PaymentIntent, and lets the
 * `payment_intent.succeeded` webhook call finalize.
 */

const DELIVERY_CODE_TTL_MS = 72 * 3600 * 1000;

type Db = PrismaClient;

export type PaymentMethod = 'MTN_MOMO' | 'ORANGE_MONEY' | 'CARD';

const PROVIDER_BY_METHOD: Record<PaymentMethod, 'STRIPE' | 'MTN_MOMO' | 'ORANGE_MONEY'> = {
  CARD: 'STRIPE',
  MTN_MOMO: 'MTN_MOMO',
  ORANGE_MONEY: 'ORANGE_MONEY',
};

export interface OrderLineItem {
  product_id: string;
  variant_id: string | null;
  seller_id: string;
  product_snapshot: Prisma.InputJsonValue;
  quantity: number;
  unit_price: number;
  subtotal: number;
  commission_rate: number;
  commission_amount: number;
  seller_net: number;
}

export interface OrderDraft {
  cartId: string;
  buyer: { name: string; email: string; phone: string | null };
  delivery: {
    street: string;
    city: string;
    county: string | null;
    country: string;
    zone: string;
    notes: string | null;
  };
  paymentMethod: PaymentMethod;
  items: OrderLineItem[];
  subtotal: number;
  shippingFee: number;
  totalAmount: number;
  currency: string;
}

export type AssembleResult = { ok: true; draft: OrderDraft } | { ok: false; error: string };

const PAYMENT_METHODS = new Set<PaymentMethod>(['MTN_MOMO', 'ORANGE_MONEY', 'CARD']);

/**
 * Validate the session cart + checkout form into an OrderDraft. Returns a
 * typed error instead of redirecting, so both the form action (which redirects)
 * and the Card action (which returns JSON to the client) can consume it.
 */
export async function assembleOrderDraft(
  db: Db,
  sessionId: string | undefined,
  form: {
    buyer_name: string;
    buyer_email: string;
    buyer_phone: string | null;
    delivery_street: string;
    delivery_city: string;
    delivery_county: string | null;
    delivery_country: string;
    delivery_zone: string;
    delivery_notes: string | null;
    payment_method: string;
  },
): Promise<AssembleResult> {
  if (!sessionId) return { ok: false, error: 'Your cart is empty.' };

  const cart = await db.cart.findFirst({ where: { session_id: sessionId }, include: { items: true } });
  if (!cart || cart.items.length === 0) return { ok: false, error: 'Your cart is empty.' };

  if (
    !form.buyer_name ||
    !form.buyer_email ||
    !form.delivery_street ||
    !form.delivery_city ||
    !form.delivery_zone
  ) {
    return { ok: false, error: 'Please fill all required fields.' };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.buyer_email)) {
    return { ok: false, error: 'Email looks invalid.' };
  }
  if (!PAYMENT_METHODS.has(form.payment_method as PaymentMethod)) {
    return { ok: false, error: 'Pick a payment method.' };
  }
  const paymentMethod = form.payment_method as PaymentMethod;

  const zone = await db.deliveryZone.findUnique({ where: { name: form.delivery_zone } });
  if (!zone || !zone.is_active) return { ok: false, error: 'That delivery zone is not available.' };

  const products = await db.product.findMany({
    where: { id: { in: cart.items.map((i) => i.product_id) } },
    include: {
      seller: { select: { id: true, business_slug: true, business_name: true, saas_commission_rate: true } },
      images: { where: { is_primary: true }, take: 1 },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const items: OrderLineItem[] = [];
  let subtotal = 0;
  for (const ci of cart.items) {
    const p = productById.get(ci.product_id);
    if (!p || p.status !== 'PUBLISHED' || p.moderation_status !== 'APPROVED' || p.deleted_at) {
      return { ok: false, error: 'An item in your cart is no longer available. Remove it and try again.' };
    }
    const unit_price = Number(p.base_price);
    const item_subtotal = unit_price * ci.quantity;
    const commission_rate = p.seller.saas_commission_rate;
    const commission_amount = Number((item_subtotal * commission_rate).toFixed(2));
    const seller_net = Number((item_subtotal - commission_amount).toFixed(2));
    subtotal += item_subtotal;
    items.push({
      product_id: p.id,
      variant_id: ci.variant_id,
      seller_id: p.seller.id,
      product_snapshot: {
        name: p.name,
        slug: p.slug,
        base_price: unit_price.toFixed(2),
        condition: p.condition,
        image_url: p.images[0]?.url ?? null,
        seller_business_slug: p.seller.business_slug,
        seller_business_name: p.seller.business_name,
      } satisfies Prisma.InputJsonValue,
      quantity: ci.quantity,
      unit_price,
      subtotal: item_subtotal,
      commission_rate,
      commission_amount,
      seller_net,
    });
  }

  const shippingFee = Number(zone.base_delivery_fee);
  return {
    ok: true,
    draft: {
      cartId: cart.id,
      buyer: { name: form.buyer_name, email: form.buyer_email, phone: form.buyer_phone },
      delivery: {
        street: form.delivery_street,
        city: form.delivery_city,
        county: form.delivery_county,
        country: form.delivery_country,
        zone: form.delivery_zone,
        notes: form.delivery_notes,
      },
      paymentMethod,
      items,
      subtotal,
      shippingFee,
      totalAmount: subtotal + shippingFee,
      currency: 'USD',
    },
  };
}

export interface PendingOrder {
  orderId: string;
  orderNumber: string;
  buyerUserId: string;
  totalAmount: number;
  currency: string;
}

/**
 * Options controlling buyer attribution.
 *
 * `buyerUserId` — when the caller has an authenticated buyer (Clerk → local
 * User), pass that id. It becomes authoritative for Order.buyer_user_id
 * regardless of the contact email entered on the form, closing the gap where a
 * signed-in buyer who typed a different email had their order forked onto an
 * orphan guest_ row (or a guest could attach an order to any account by email).
 * Omit it for guest checkout: the buyer is then find-or-created from the email.
 */
export interface BuildPendingOrderOptions {
  buyerUserId?: string | null;
}

/**
 * Thrown by buildPendingOrder when an unauthenticated (guest) checkout enters a
 * contact email that already belongs to a registered (non-guest) account. We
 * refuse rather than silently attach the order to that account: only the account
 * owner, signed in, may check out under their identity. (User.email is unique,
 * so a guest_ row can't be minted for that email either.) Callers map this to a
 * friendly "please sign in" message on the checkout surface.
 */
export class GuestEmailBelongsToAccountError extends Error {
  constructor() {
    super('GUEST_EMAIL_BELONGS_TO_ACCOUNT');
    this.name = 'GuestEmailBelongsToAccountError';
  }
}

/**
 * Resolve the buyer for a guest (unauthenticated) checkout: find-or-create a
 * guest_ user keyed by the form email. Repeat guests with the same email reuse
 * their guest_ row. If the email belongs to a real account, refuse — see
 * GuestEmailBelongsToAccountError.
 */
async function resolveGuestBuyer(db: Db, draft: OrderDraft) {
  const existing = await db.user.findUnique({ where: { email: draft.buyer.email } });
  if (existing) {
    // The `guest_` clerk_id prefix is the sole discriminator between a synthetic
    // guest row (freely mintable) and a real, sign-in-backed account. A non-guest
    // match means this email belongs to an account — refuse rather than attach.
    if (!existing.clerk_id.startsWith('guest_')) {
      throw new GuestEmailBelongsToAccountError();
    }
    return existing;
  }
  return db.user.create({
    data: {
      clerk_id: `guest_${randomUUID()}`,
      email: draft.buyer.email,
      full_name: draft.buyer.name,
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
  });
}

/**
 * Persist a PENDING_PAYMENT order + items + a PENDING Payment. The buyer User
 * is resolved (authenticated id, else guest upsert) outside the transaction.
 */
export async function buildPendingOrder(
  db: Db,
  draft: OrderDraft,
  opts: BuildPendingOrderOptions = {},
): Promise<PendingOrder> {
  const buyerUser = opts.buyerUserId
    ? // Authenticated: the signed-in account is authoritative for attribution.
      // The form contact fields (name/email/phone) are still recorded as-is below.
      // The caller derives buyerUserId from getCurrentBuyerUserId(), which only
      // returns an id after syncClerkUser find-or-created the row — so this throws
      // only if that account was hard-deleted in the sub-second gap. Throwing is
      // intentional: never silently fork a signed-in buyer onto a guest_ row.
      await db.user.findUniqueOrThrow({ where: { id: opts.buyerUserId } })
    : // Guest checkout: find-or-create a guest_ user (refuses real-account emails).
      await resolveGuestBuyer(db, draft);

  const orderNumber = `VDR-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        order_number: orderNumber,
        buyer_user_id: buyerUser.id,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: draft.buyer.name,
        buyer_email: draft.buyer.email,
        buyer_phone: draft.buyer.phone,
        delivery_address: {
          street: draft.delivery.street,
          city: draft.delivery.city,
          country: draft.delivery.country,
        } satisfies Prisma.InputJsonValue,
        delivery_city: draft.delivery.city,
        delivery_county: draft.delivery.county,
        delivery_country: draft.delivery.country,
        delivery_zone: draft.delivery.zone,
        delivery_notes: draft.delivery.notes,
        subtotal: draft.subtotal,
        shipping_fee: draft.shippingFee,
        total_amount: draft.totalAmount,
        currency: draft.currency,
        fx_rate_locked: 1.0,
        fx_rate_at_order: new Date(),
        payment_method: draft.paymentMethod,
        payment_provider: PROVIDER_BY_METHOD[draft.paymentMethod].toLowerCase(),
        payment_status: 'PENDING',
        status: 'PENDING_PAYMENT',
        status_updated_at: new Date(),
      },
    });

    for (const item of draft.items) {
      await tx.orderItem.create({ data: { order_id: created.id, ...item } });
    }

    await tx.payment.create({
      data: {
        order_id: created.id,
        amount: draft.totalAmount,
        currency: draft.currency,
        provider: PROVIDER_BY_METHOD[draft.paymentMethod],
        status: 'PENDING',
      },
    });

    await tx.auditLog.create({
      data: {
        actor_user_id: buyerUser.id,
        actor_system: false,
        action: 'order.placed',
        resource_type: 'order',
        resource_id: created.id,
        after_state: {
          order_number: created.order_number,
          total_amount: draft.totalAmount.toFixed(2),
          item_count: draft.items.length,
          payment_method: draft.paymentMethod,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return created;
  });

  return {
    orderId: order.id,
    orderNumber: order.order_number,
    buyerUserId: buyerUser.id,
    totalAmount: draft.totalAmount,
    currency: draft.currency,
  };
}

export type FinalizeFailureReason = 'not_found' | 'already_finalized' | 'amount_mismatch';

export type FinalizeResult =
  | { finalized: true; deliveryCode: string }
  | { finalized: false; deliveryCode: null; reason: FinalizeFailureReason };

/**
 * Mark a paid order PAID and stand up escrow. Idempotent + state-guarded: only
 * transitions from PENDING_PAYMENT, so a webhook retry (or the mock path racing
 * the webhook) is a safe no-op.
 *
 * When `expectedAmountCents` is supplied (the Stripe path passes the amount the
 * provider actually captured), the order's own total is reconciled against it
 * before anything is marked PAID — the webhook is the source of truth for money
 * captured, so it must not trust that the succeeded intent matches the order.
 */
export async function finalizePaidOrder(
  db: Db,
  args: {
    orderId: string;
    provider?: string;
    providerPaymentId?: string | null;
    expectedAmountCents?: number;
    expectedCurrency?: string;
    now?: Date;
  },
): Promise<FinalizeResult> {
  const { orderId } = args;
  const now = args.now ?? new Date();
  // bcrypt is slow — hash outside the transaction.
  const { plaintext, hash } = await generateDeliveryCode();

  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) return { finalized: false, deliveryCode: null, reason: 'not_found' };
    if (order.status !== 'PENDING_PAYMENT') {
      return { finalized: false, deliveryCode: null, reason: 'already_finalized' };
    }

    // Reconcile captured amount/currency against the order before marking PAID.
    if (args.expectedAmountCents !== undefined) {
      const orderCents = Math.round(Number(order.total_amount) * 100);
      const currencyOk =
        !args.expectedCurrency ||
        args.expectedCurrency.toLowerCase() === order.currency.toLowerCase();
      if (orderCents !== args.expectedAmountCents || !currencyOk) {
        return { finalized: false, deliveryCode: null, reason: 'amount_mismatch' };
      }
    }

    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING_PAYMENT' },
      data: {
        status: 'PAID',
        status_updated_at: now,
        paid_at: now,
        payment_status: 'CAPTURED',
        ...(args.provider ? { payment_provider: args.provider } : {}),
        ...(args.providerPaymentId ? { payment_intent_id: args.providerPaymentId } : {}),
        delivery_code_hash: hash,
        delivery_code_sent_at: now,
        delivery_code_expires_at: new Date(now.getTime() + DELIVERY_CODE_TTL_MS),
      },
    });
    if (count === 0) return { finalized: false, deliveryCode: null, reason: 'already_finalized' };

    // Per-seller EscrowHolds (aggregate seller_net across this order's items).
    const sellerTotals = new Map<string, number>();
    for (const item of order.items) {
      sellerTotals.set(
        item.seller_id,
        (sellerTotals.get(item.seller_id) ?? 0) + Number(item.seller_net),
      );
    }
    for (const [seller_id, amount] of sellerTotals) {
      const hold = await tx.escrowHold.create({
        data: {
          order_id: orderId,
          beneficiary_type: 'SELLER',
          beneficiary_seller_id: seller_id,
          amount,
          currency: order.currency,
          state: 'HELD',
          state_changed_at: now,
        },
      });
      await tx.escrowStateTransition.create({
        data: {
          escrow_hold_id: hold.id,
          from_state: 'PENDING_PAYMENT',
          to_state: 'HELD',
          actor_system: true,
          reason: 'payment_captured',
          transitioned_at: now,
        },
      });
    }

    await tx.payment.updateMany({
      where: { order_id: orderId },
      data: {
        status: 'CAPTURED',
        captured_at: now,
        ...(args.providerPaymentId ? { provider_payment_id: args.providerPaymentId } : {}),
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: orderId,
        from_status: 'PENDING_PAYMENT',
        to_status: 'PAID',
        changed_by_system: true,
        reason: 'payment_captured',
      },
    });

    await tx.auditLog.create({
      data: {
        actor_system: true,
        action: 'order.paid',
        resource_type: 'order',
        resource_id: orderId,
        before_state: { status: 'PENDING_PAYMENT' } satisfies Prisma.InputJsonValue,
        after_state: {
          status: 'PAID',
          provider: args.provider ?? null,
          provider_payment_id: args.providerPaymentId ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { finalized: true, deliveryCode: plaintext };
  });
}

export const orderDb = defaultPrisma;
