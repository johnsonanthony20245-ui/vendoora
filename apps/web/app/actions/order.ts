'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@vendoora/db';
import { generateDeliveryCode } from '../../lib/delivery-code';

const CART_COOKIE = 'vdr_cart';

/**
 * Validation errors are signaled by redirecting to /checkout?error=<msg>.
 * The page reads the query param and renders the message above the form.
 * This keeps the Server Action's return type as `void`, which Next form
 * actions require.
 */
function failValidation(message: string): never {
  redirect(`/checkout?error=${encodeURIComponent(message)}`);
}

/**
 * Place an order from the current session's cart. Mocks payment success
 * (no real provider integration yet — P3 Trust Mechanic). Creates Order +
 * OrderItems + per-seller EscrowHolds + Payment in a single transaction.
 *
 * On success: clears the cart cookie and redirects to /order-confirmation.
 * On validation failure: redirects to /checkout?error=...
 */
export async function placeOrder(formData: FormData): Promise<void> {
  const jar = await cookies();
  const sessionId = jar.get(CART_COOKIE)?.value;
  if (!sessionId) failValidation('Your cart is empty.');

  const cart = await prisma.cart.findFirst({
    where: { session_id: sessionId },
    include: { items: true },
  });
  if (!cart || cart.items.length === 0) {
    failValidation('Your cart is empty.');
  }

  // Form fields
  const buyer_name = String(formData.get('buyer_name') ?? '').trim();
  const buyer_email = String(formData.get('buyer_email') ?? '').trim();
  const buyer_phone = String(formData.get('buyer_phone') ?? '').trim() || null;
  const delivery_street = String(formData.get('delivery_street') ?? '').trim();
  const delivery_city = String(formData.get('delivery_city') ?? '').trim();
  const delivery_county = String(formData.get('delivery_county') ?? '').trim() || null;
  const delivery_country = String(formData.get('delivery_country') ?? 'LR').trim();
  const delivery_zone = String(formData.get('delivery_zone') ?? '').trim();
  const delivery_notes = String(formData.get('delivery_notes') ?? '').trim() || null;
  const payment_method_raw = String(formData.get('payment_method') ?? '').trim();

  if (!buyer_name || !buyer_email || !delivery_street || !delivery_city || !delivery_zone) {
    failValidation('Please fill all required fields.');
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer_email)) {
    failValidation('Email looks invalid.');
  }

  const allowedPaymentMethods = ['MTN_MOMO', 'ORANGE_MONEY', 'CARD'] as const;
  type PaymentMethod = (typeof allowedPaymentMethods)[number];
  if (!allowedPaymentMethods.includes(payment_method_raw as PaymentMethod)) {
    failValidation('Pick a payment method.');
  }
  const payment_method = payment_method_raw as PaymentMethod;

  // Validate delivery zone exists + get the shipping fee.
  const zone = await prisma.deliveryZone.findUnique({ where: { name: delivery_zone } });
  if (!zone || !zone.is_active) {
    failValidation('That delivery zone is not available.');
  }

  // Load each cart item's product (with seller for commission rate). Reject
  // any that are no longer PUBLISHED + APPROVED (defensive — Build_Prompt §11.7).
  const productIds = cart.items.map((i) => i.product_id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    include: {
      seller: { select: { id: true, business_slug: true, business_name: true, saas_commission_rate: true } },
      images: { where: { is_primary: true }, take: 1 },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  for (const ci of cart.items) {
    const p = productById.get(ci.product_id);
    if (!p || p.status !== 'PUBLISHED' || p.moderation_status !== 'APPROVED' || p.deleted_at) {
      failValidation('An item in your cart is no longer available. Remove it and try again.');
    }
  }

  // Compute totals up-front so we can show the right number in the audit log too.
  let subtotal = 0;
  for (const ci of cart.items) {
    const p = productById.get(ci.product_id);
    if (!p) continue; // already checked above
    subtotal += Number(p.base_price) * ci.quantity;
  }
  const shipping_fee = Number(zone.base_delivery_fee);
  const total_amount = subtotal + shipping_fee;

  // Generate delivery code OUTSIDE the transaction (bcrypt is slow; don't
  // hold a row lock waiting for it).
  const { plaintext: deliveryCodePlaintext, hash: deliveryCodeHash } =
    await generateDeliveryCode();

  // Short, human-readable order number.
  const order_number = `VDR-${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  // Resolve buyer User row: lazily create a placeholder for guest checkout.
  // When Clerk auth lands, we'll switch to using the authenticated user id.
  // Phone is intentionally NOT set on the user when it's null OR when it
  // collides with an existing row — the User.phone column is unique.
  const buyerUser =
    (await prisma.user.findUnique({ where: { email: buyer_email } })) ??
    (await prisma.user.create({
      data: {
        clerk_id: `guest_${randomUUID()}`,
        email: buyer_email,
        full_name: buyer_name,
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    }));

  const createdOrder = await prisma.$transaction(async (tx) => {
    // ---- Order ----
    const order = await tx.order.create({
      data: {
        order_number,
        buyer_user_id: buyerUser.id,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name,
        buyer_email,
        buyer_phone,
        delivery_address: { street: delivery_street, city: delivery_city, country: delivery_country },
        delivery_city,
        delivery_county,
        delivery_country,
        delivery_zone,
        delivery_notes,
        subtotal,
        shipping_fee,
        total_amount,
        currency: 'USD',
        fx_rate_locked: 1.0,
        fx_rate_at_order: new Date(),
        payment_method,
        payment_provider: 'wallet',
        payment_status: 'CAPTURED',
        paid_at: new Date(),
        status: 'PAID',
        status_updated_at: new Date(),
        delivery_code_hash: deliveryCodeHash,
        delivery_code_sent_at: new Date(),
        delivery_code_expires_at: new Date(Date.now() + 72 * 3600 * 1000),
      },
    });

    // ---- OrderItems (with snapshot + commission split) ----
    for (const ci of cart.items) {
      const p = productById.get(ci.product_id);
      if (!p) continue;
      const unit_price = Number(p.base_price);
      const item_subtotal = unit_price * ci.quantity;
      const commission_rate = p.seller.saas_commission_rate;
      const commission_amount = Number((item_subtotal * commission_rate).toFixed(2));
      const seller_net = Number((item_subtotal - commission_amount).toFixed(2));

      await tx.orderItem.create({
        data: {
          order_id: order.id,
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
        },
      });
    }

    // ---- EscrowHolds: one per seller ----
    // Aggregate seller_net across items per seller.
    const sellerTotals = new Map<string, number>();
    for (const ci of cart.items) {
      const p = productById.get(ci.product_id);
      if (!p) continue;
      const item_subtotal = Number(p.base_price) * ci.quantity;
      const seller_net = Number(
        (item_subtotal - item_subtotal * p.seller.saas_commission_rate).toFixed(2),
      );
      sellerTotals.set(p.seller.id, (sellerTotals.get(p.seller.id) ?? 0) + seller_net);
    }

    for (const [seller_id, amount] of sellerTotals) {
      const hold = await tx.escrowHold.create({
        data: {
          order_id: order.id,
          beneficiary_type: 'SELLER',
          beneficiary_seller_id: seller_id,
          amount,
          currency: 'USD',
          state: 'HELD',
          state_changed_at: new Date(),
          scheduled_release_at: new Date(Date.now() + 24 * 3600 * 1000), // P3 worker uses this
        },
      });

      await tx.escrowStateTransition.create({
        data: {
          escrow_hold_id: hold.id,
          from_state: 'PENDING_PAYMENT',
          to_state: 'HELD',
          actor_system: true,
          reason: 'payment_captured',
          transitioned_at: new Date(),
        },
      });
    }

    // ---- Payment row ----
    await tx.payment.create({
      data: {
        order_id: order.id,
        amount: total_amount,
        currency: 'USD',
        provider: 'WALLET', // placeholder; real providers (Stripe/MTN/Orange) wire up in P3
        status: 'CAPTURED',
        captured_at: new Date(),
      },
    });

    // ---- Order status history ----
    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        from_status: 'PENDING_PAYMENT',
        to_status: 'PAID',
        changed_by_system: true,
        reason: 'payment_captured',
      },
    });

    // ---- Audit log (Build_Prompt §10.4 — financial state change requires audit) ----
    await tx.auditLog.create({
      data: {
        actor_user_id: buyerUser.id,
        actor_system: false,
        action: 'order.placed',
        resource_type: 'order',
        resource_id: order.id,
        after_state: {
          order_number: order.order_number,
          total_amount: total_amount.toFixed(2),
          item_count: cart.items.length,
          payment_method,
        } satisfies Prisma.InputJsonValue,
      },
    });

    // ---- Clear the cart ----
    await tx.cartItem.deleteMany({ where: { cart_id: cart.id } });
    await tx.cart.delete({ where: { id: cart.id } });

    return { id: order.id, order_number: order.order_number };
  });

  // Clear the cart cookie — next visit starts fresh.
  jar.delete(CART_COOKIE);

  // Stash the plaintext delivery code in a short-lived (5 min) cookie so the
  // confirmation page can display it once. In production this comes by SMS.
  jar.set(`vdr_dc_${createdOrder.order_number}`, deliveryCodePlaintext, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });

  redirect(`/order-confirmation/${createdOrder.order_number}`);
}
