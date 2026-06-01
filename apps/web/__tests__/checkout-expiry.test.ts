/**
 * Tests for the stale-checkout expiry rail (packages/domain/src/checkout.ts):
 * expireStalePendingOrders sweeps abandoned PENDING_PAYMENT orders to EXPIRED
 * with audit + history + a FAILED Payment, and best-effort cancels the Stripe
 * PaymentIntent. expirePendingOrder is the per-order, state-guarded transition.
 *
 * The race test (#6) is the stub-killer: a stub without the state-guarded
 * updateMany would clobber a just-PAID order to EXPIRED.
 *
 * Real DB, same fixture pattern as order-finalize.test.ts. audit_log is
 * INSERT-only (DB trigger), so every audit assertion is scoped to the freshly
 * created order id — never a global count.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { buildPendingOrder, finalizePaidOrder } = await import('../lib/order');
const { expireStalePendingOrders, expirePendingOrder } = await import('@vendoora/domain');
import type { OrderDraft } from '../lib/order';

const BUYER_EMAIL = 'checkout_expiry_test@vendoora.test';
const THIRTY_ONE_MIN = 31 * 60 * 1000;

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
    cartId: 'unused-in-expiry',
    buyer: { name: 'Expiry Tester', email: BUYER_EMAIL, phone: null },
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

/** Build a PENDING_PAYMENT order and backdate created_at so the sweep sees it as stale. */
async function buildStaleOrder(ageMs = THIRTY_ONE_MIN): Promise<string> {
  const pending = await buildPendingOrder(prisma, makeDraft());
  await prisma.order.update({
    where: { id: pending.orderId },
    data: { created_at: new Date(Date.now() - ageMs) },
  });
  return pending.orderId;
}

describe('expireStalePendingOrders', () => {
  it('expires a stale PENDING_PAYMENT order with history + audit + FAILED payment', async () => {
    const orderId = await buildStaleOrder();

    const result = await expireStalePendingOrders(prisma, {});
    expect(result.ordersExpired).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('EXPIRED');

    const history = await prisma.orderStatusHistory.findFirst({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(history?.from_status).toBe('PENDING_PAYMENT');
    expect(history?.reason).toBe('abandoned_checkout');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(1);

    const payment = await prisma.payment.findUnique({ where: { order_id: orderId } });
    expect(payment?.status).toBe('FAILED');
  });

  it('does not expire a fresh PENDING_PAYMENT order', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft()); // created_at = now

    const result = await expireStalePendingOrders(prisma, { olderThanMs: 30 * 60 * 1000 });
    expect(result.ordersExpired).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PENDING_PAYMENT');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);
  });

  it('is idempotent — a second sweep over the same order is a no-op', async () => {
    const orderId = await buildStaleOrder();

    await expireStalePendingOrders(prisma, {});
    await expireStalePendingOrders(prisma, {});

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(1);

    const historyRows = await prisma.orderStatusHistory.count({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(historyRows).toBe(1);
  });

  it('leaves a PAID order untouched', async () => {
    const pending = await buildPendingOrder(prisma, makeDraft());
    await finalizePaidOrder(prisma, { orderId: pending.orderId, provider: 'stripe' });
    await prisma.order.update({
      where: { id: pending.orderId },
      data: { created_at: new Date(Date.now() - THIRTY_ONE_MIN) },
    });

    const result = await expireStalePendingOrders(prisma, {});
    expect(result.ordersExpired).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: pending.orderId } });
    expect(order?.status).toBe('PAID');

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: pending.orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);

    const holds = await prisma.escrowHold.count({ where: { order_id: pending.orderId } });
    expect(holds).toBe(1); // escrow from finalize is intact
  });

  it('cancels the Stripe PaymentIntent when set; logs (not rolls back) on cancel failure', async () => {
    // Happy path — spy receives the PI id exactly once.
    const okOrderId = await buildStaleOrder();
    await prisma.order.update({
      where: { id: okOrderId },
      data: { payment_intent_id: 'pi_expiry_ok' },
    });
    const cancelOk = vi.fn(async () => {});
    await expireStalePendingOrders(prisma, { cancelStripeIntent: cancelOk });
    expect(cancelOk).toHaveBeenCalledTimes(1);
    expect(cancelOk).toHaveBeenCalledWith('pi_expiry_ok');

    // Failure path — cancel throws; order is still EXPIRED, failure is audited.
    const failOrderId = await buildStaleOrder();
    await prisma.order.update({
      where: { id: failOrderId },
      data: { payment_intent_id: 'pi_expiry_fail' },
    });
    const cancelThrows = vi.fn(async () => {
      throw new Error('intent already canceled');
    });
    const result = await expireStalePendingOrders(prisma, { cancelStripeIntent: cancelThrows });
    expect(result.stripeCancelFailures).toBe(1);

    const order = await prisma.order.findUnique({ where: { id: failOrderId } });
    expect(order?.status).toBe('EXPIRED'); // not rolled back

    const cancelFailAudits = await prisma.auditLog.count({
      where: { resource_id: failOrderId, action: 'payment.stripe_cancel_failed' },
    });
    expect(cancelFailAudits).toBe(1);
  });
});

describe('expirePendingOrder — webhook race (stub-killer)', () => {
  it('does not clobber an order that was PAID between candidate-discovery and the sweep', async () => {
    const orderId = await buildStaleOrder();

    // The webhook wins the race first.
    const finalize = await finalizePaidOrder(prisma, { orderId, provider: 'stripe' });
    expect(finalize.finalized).toBe(true);

    // The sweep arrives moments later with the now-stale candidate id.
    const cancelSpy = vi.fn(async () => {});
    const res = await expirePendingOrder(prisma, { orderId, cancelStripeIntent: cancelSpy });
    expect(res.expiredOrderIds).toEqual([]);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('PAID');

    const paidAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.paid' },
    });
    expect(paidAudits).toBe(1);

    const expiredAudits = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'order.expired' },
    });
    expect(expiredAudits).toBe(0);

    const expiredHistory = await prisma.orderStatusHistory.count({
      where: { order_id: orderId, to_status: 'EXPIRED' },
    });
    expect(expiredHistory).toBe(0);

    expect(cancelSpy).not.toHaveBeenCalled();
  });
});
