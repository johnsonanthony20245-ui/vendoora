/**
 * Buyer trust score engine (packages/domain/src/trust-score.ts:
 * recomputeBuyerTrustScore). Engineering_Spec §5.1.12: an internal 0-100 score,
 * initialized at 50, adjusted from the buyer's payment-success rate, dispute
 * rate, and return rate. Hidden from the user; feeds fraud thresholds later.
 *
 * Formula (documented, tunable): base 50 + 30·payment_success_rate
 *   − 40·dispute_rate − 20·return_rate, clamped to [0,100]. Rates are over the
 * buyer's *settled* orders (anything past payment); a buyer with no history is
 * the neutral 50.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { recomputeBuyerTrustScore } = await import('@vendoora/domain');

const TAG = `trust-${randomUUID()}`;
let buyerId = '';

beforeAll(async () => {
  buyerId = (
    await prisma.user.create({
      data: {
        clerk_id: `guest_${TAG}`,
        email: `${TAG}@vendoora.test`,
        full_name: 'Trust Score Buyer',
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    })
  ).id;
});

type OrderStatus = 'PENDING_PAYMENT' | 'DELIVERED' | 'COMPLETED' | 'DISPUTED' | 'REFUNDED' | 'EXPIRED' | 'CANCELLED';

async function makeOrder(status: OrderStatus): Promise<string> {
  const order = await prisma.order.create({
    data: {
      order_number: `VDR-TRUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Trust',
      buyer_email: `${TAG}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: 100,
      total_amount: 100,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: status === 'REFUNDED' ? 'REFUNDED' : 'CAPTURED',
      status,
    },
  });
  return order.id;
}

async function makeDispute(orderId: string): Promise<void> {
  await prisma.dispute.create({
    data: {
      dispute_number: `DSP-TRUST-${randomUUID().slice(0, 8).toUpperCase()}`,
      order_id: orderId,
      initiated_by_user_id: buyerId,
      category: 'WRONG_ITEM',
      reason: 'BUYER_INITIATED',
      description: 'Trust-score test dispute fixture.',
      sla_due_at: new Date(Date.now() + 48 * 3600 * 1000),
    },
  });
}

beforeEach(async () => {
  await prisma.dispute.deleteMany({ where: { order: { buyer_user_id: buyerId } } });
  await prisma.order.deleteMany({ where: { buyer_user_id: buyerId } });
  await prisma.user.update({ where: { id: buyerId }, data: { trust_score: 50 } });
});

afterAll(async () => {
  await prisma.dispute.deleteMany({ where: { order: { buyer_user_id: buyerId } } });
  await prisma.order.deleteMany({ where: { buyer_user_id: buyerId } });
  await prisma.$disconnect();
});

async function storedScore(): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id: buyerId }, select: { trust_score: true } });
  return Number(u?.trust_score);
}

describe('recomputeBuyerTrustScore', () => {
  it('is the neutral 50 for a buyer with no order history', async () => {
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    expect(r.score).toBe(50);
    expect(await storedScore()).toBe(50);
  });

  it('rewards a clean buyer: all settled, no disputes, no returns -> 80', async () => {
    await makeOrder('DELIVERED');
    await makeOrder('COMPLETED');
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // 50 + 30*1 - 0 - 0
    expect(r.score).toBe(80);
    expect(await storedScore()).toBe(80);
    expect(r.disputedOrders).toBe(0);

    // The contract persists the score AND an audit row, atomically.
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'user.trust_score.recomputed', resource_id: buyerId },
    });
    expect(audit).not.toBeNull();
  });

  it('penalizes disputes: one settled order with a dispute -> 40', async () => {
    const orderId = await makeOrder('DISPUTED');
    await makeDispute(orderId);
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // 50 + 30*1 - 40*1 - 0
    expect(r.score).toBe(40);
    expect(r.disputedOrders).toBe(1);
  });

  it('penalizes returns: one settled order refunded -> 60', async () => {
    await makeOrder('REFUNDED');
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // 50 + 30*1 - 0 - 20*1
    expect(r.score).toBe(60);
    expect(r.refundedOrders).toBe(1);
  });

  it('penalizes payment failures: 1 settled of 2 attempted -> 65', async () => {
    await makeOrder('DELIVERED');
    await makeOrder('EXPIRED'); // never paid
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // 50 + 30*0.5 - 0 - 0
    expect(r.score).toBe(65);
    expect(r.totalOrders).toBe(2);
    expect(r.settledOrders).toBe(1);
  });

  it('does not over-penalize a dispute on an unsettled order (no settled history -> 50)', async () => {
    const orderId = await makeOrder('PENDING_PAYMENT'); // never settled
    await makeDispute(orderId);
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // settledOrders=0 -> payment_success_rate 0, dispute/return rates 0 -> base 50
    expect(r.settledOrders).toBe(0);
    expect(r.disputedOrders).toBe(1);
    expect(r.score).toBe(50);
  });

  it('floors at 0: a refunded+disputed order amid many unpaid attempts', async () => {
    const orderId = await makeOrder('REFUNDED');
    await makeDispute(orderId);
    for (let i = 0; i < 4; i++) await makeOrder('EXPIRED');
    const r = await recomputeBuyerTrustScore(prisma, buyerId);
    // 50 + 30*(1/5) - 40*1 - 20*1 = -4 -> clamped to 0
    expect(r.score).toBe(0);
    expect(await storedScore()).toBe(0);
  });
});
