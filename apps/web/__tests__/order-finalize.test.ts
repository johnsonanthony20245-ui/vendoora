/**
 * Tests for the shared order rail (lib/order.ts): buildPendingOrder creates a
 * PENDING_PAYMENT order, and finalizePaidOrder performs the success transition
 * (PAID + per-seller escrow HELD + captured Payment + delivery-code hash),
 * idempotently. This is the path the Stripe webhook drives for real cards and
 * the mock rail drives synchronously — so it must be safe to call twice.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { buildPendingOrder, finalizePaidOrder } = await import('../lib/order');
import type { OrderDraft } from '../lib/order';

const BUYER_EMAIL = 'order_finalize_test@vendoora.test';
let productId = '';
let sellerId = '';
let basePrice = 0;
let commissionRate = 0;

beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { seller: { business_slug: 'konah-boutique' } },
    include: { seller: { select: { id: true, saas_commission_rate: true } } },
  });
  if (!product) throw new Error('Need konah-boutique products in test DB. Run pnpm db:seed.');
  productId = product.id;
  sellerId = product.seller.id;
  basePrice = Number(product.base_price);
  commissionRate = product.seller.saas_commission_rate;
});

beforeEach(async () => {
  const buyer = await prisma.user.findUnique({ where: { email: BUYER_EMAIL } });
  if (buyer) {
    const orders = await prisma.order.findMany({ where: { buyer_user_id: buyer.id } });
    for (const o of orders) {
      await prisma.escrowStateTransition.deleteMany({ where: { escrow_hold: { order_id: o.id } } });
      await prisma.escrowHold.deleteMany({ where: { order_id: o.id } });
      await prisma.payment.deleteMany({ where: { order_id: o.id } });
      await prisma.orderStatusHistory.deleteMany({ where: { order_id: o.id } });
      await prisma.orderItem.deleteMany({ where: { order_id: o.id } });
      await prisma.order.delete({ where: { id: o.id } });
    }
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

function makeDraft(): OrderDraft {
  const quantity = 2;
  const subtotal = basePrice * quantity;
  const commission_amount = Number((subtotal * commissionRate).toFixed(2));
  const seller_net = Number((subtotal - commission_amount).toFixed(2));
  return {
    cartId: 'unused-in-finalize',
    buyer: { name: 'Finalize Tester', email: BUYER_EMAIL, phone: null },
    delivery: { street: '1 Test St', city: 'Monrovia', county: 'Montserrado', country: 'LR', zone: 'sinkor', notes: null },
    paymentMethod: 'CARD',
    items: [
      {
        product_id: productId,
        variant_id: null,
        seller_id: sellerId,
        product_snapshot: { name: 'Test', slug: 'test' },
        quantity,
        unit_price: basePrice,
        subtotal,
        commission_rate: commissionRate,
        commission_amount,
        seller_net,
      },
    ],
    subtotal,
    shippingFee: 3,
    totalAmount: subtotal + 3,
    currency: 'USD',
  };
}

describe('buildPendingOrder', () => {
  it('creates a PENDING_PAYMENT order + PENDING payment + order.placed audit', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());

    const order = await prisma.order.findUnique({
      where: { id: pending.orderId },
      include: { items: true },
    });
    expect(order?.status).toBe('PENDING_PAYMENT');
    expect(order?.payment_status).toBe('PENDING');
    expect(order?.delivery_code_hash).toBeNull();
    expect(order?.items).toHaveLength(1);

    const payment = await prisma.payment.findUnique({ where: { order_id: pending.orderId } });
    expect(payment?.status).toBe('PENDING');
    expect(payment?.provider).toBe('STRIPE');

    const placed = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.placed' },
    });
    expect(placed).toBe(1);

    // No escrow until paid.
    const holds = await prisma.escrowHold.count({ where: { order_id: pending.orderId } });
    expect(holds).toBe(0);
  });
});

describe('finalizePaidOrder', () => {
  it('transitions PENDING_PAYMENT → PAID with escrow HELD + captured payment + code', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());
    const result = await finalizePaidOrder(prisma, {
      orderId: pending.orderId,
      provider: 'stripe',
      providerPaymentId: 'pi_test_123',
    });

    expect(result.finalized).toBe(true);
    expect(result.deliveryCode).toMatch(/^\d{6}$/);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PAID');
    expect(order?.payment_status).toBe('CAPTURED');
    expect(order?.delivery_code_hash).toMatch(/^\$2[aby]\$/);

    const holds = await prisma.escrowHold.findMany({ where: { order_id: pending.orderId } });
    expect(holds).toHaveLength(1);
    expect(holds[0]?.state).toBe('HELD');
    expect(holds[0]?.beneficiary_seller_id).toBe(sellerId);

    const payment = await prisma.payment.findUnique({ where: { order_id: pending.orderId } });
    expect(payment?.status).toBe('CAPTURED');
    expect(payment?.provider_payment_id).toBe('pi_test_123');

    const history = await prisma.orderStatusHistory.findFirst({
      where: { order_id: pending.orderId, to_status: 'PAID' },
    });
    expect(history?.from_status).toBe('PENDING_PAYMENT');
  });

  it('refuses to finalize when the captured amount does not match the order', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());
    const result = await finalizePaidOrder(prisma, {
      orderId: pending.orderId,
      provider: 'stripe',
      providerPaymentId: 'pi_wrong_amount',
      expectedAmountCents: 1, // not the order total
      expectedCurrency: 'usd',
    });
    expect(result.finalized).toBe(false);
    if (!result.finalized) expect(result.reason).toBe('amount_mismatch');

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PENDING_PAYMENT'); // untouched
    const holds = await prisma.escrowHold.count({ where: { order_id: pending.orderId } });
    expect(holds).toBe(0);
  });

  it('finalizes when the captured amount matches', async () => {
    const draft = makeDraft();
    const pending = await buildPendingOrder(prisma, draft);
    const result = await finalizePaidOrder(prisma, {
      orderId: pending.orderId,
      provider: 'stripe',
      expectedAmountCents: Math.round(draft.totalAmount * 100),
      expectedCurrency: 'usd',
    });
    expect(result.finalized).toBe(true);
    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PAID');
  });

  it('returns not_found for a missing order (webhook will retry on this)', async () => {
    const result = await finalizePaidOrder(prisma, { orderId: 'does-not-exist' });
    expect(result.finalized).toBe(false);
    if (!result.finalized) expect(result.reason).toBe('not_found');
  });

  it('is idempotent — a second finalize is a no-op (no duplicate escrow)', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());
    const first = await finalizePaidOrder(prisma, { orderId: pending.orderId, provider: 'stripe' });
    const second = await finalizePaidOrder(prisma, { orderId: pending.orderId, provider: 'stripe' });

    expect(first.finalized).toBe(true);
    expect(second.finalized).toBe(false);

    const holds = await prisma.escrowHold.count({ where: { order_id: pending.orderId } });
    expect(holds).toBe(1); // not doubled
    const paidAudits = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.paid' },
    });
    expect(paidAudits).toBe(1);
  });
});
