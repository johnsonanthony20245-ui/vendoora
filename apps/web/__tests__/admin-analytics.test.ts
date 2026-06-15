/**
 * Platform analytics aggregation (apps/web/lib/admin-analytics.ts:
 * getPlatformAnalytics). The aggregation is GLOBAL (sums all orders in the
 * window), so these tests assert on DELTAS around a known set of fixtures rather
 * than absolute totals — hermetic regardless of seeded/other data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getPlatformAnalytics } = await import('../lib/admin-analytics');

const TAG = `an-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
const buyerIds: string[] = [];
const orderIds: string[] = [];

async function makeBuyer(): Promise<string> {
  const u = await prisma.user.create({
    data: {
      clerk_id: `an_${randomUUID().slice(0, 12)}`,
      email: `${TAG}-${randomUUID().slice(0, 6)}@vendoora.test`,
      full_name: 'Analytics Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
      created_at: new Date(NOW.getTime() - 24 * 3600 * 1000), // yesterday, in window
    },
    select: { id: true },
  });
  buyerIds.push(u.id);
  return u.id;
}

async function makeOrder(opts: {
  buyerId: string;
  buyerType: 'LIBERIA_DOMESTIC' | 'DIASPORA';
  total: number;
  paymentStatus: 'CAPTURED' | 'PENDING';
  status: string;
}): Promise<void> {
  const o = await prisma.order.create({
    data: {
      order_number: `VDR-AN-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: opts.buyerId,
      buyer_type: opts.buyerType,
      buyer_name: 'A',
      buyer_email: `${TAG}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: opts.total,
      total_amount: opts.total,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: opts.paymentStatus as never,
      status: opts.status as never,
      created_at: new Date(NOW.getTime() - 24 * 3600 * 1000),
    },
    select: { id: true },
  });
  orderIds.push(o.id);
}

beforeAll(() => {});

afterAll(async () => {
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.user.deleteMany({ where: { id: { in: buyerIds } } });
  await prisma.$disconnect();
});

describe('getPlatformAnalytics', () => {
  it('reports GMV / paid-order / audience / funnel deltas around a known set', async () => {
    const before = await getPlatformAnalytics(prisma, { now: NOW, windowDays: 30 });

    const dom = await makeBuyer();
    const dia = await makeBuyer();
    // 3 paid: two domestic ($100, $50 delivered/completed), one diaspora ($200 disputed)
    await makeOrder({ buyerId: dom, buyerType: 'LIBERIA_DOMESTIC', total: 100, paymentStatus: 'CAPTURED', status: 'DELIVERED' });
    await makeOrder({ buyerId: dom, buyerType: 'LIBERIA_DOMESTIC', total: 50, paymentStatus: 'CAPTURED', status: 'COMPLETED' });
    await makeOrder({ buyerId: dia, buyerType: 'DIASPORA', total: 200, paymentStatus: 'CAPTURED', status: 'DISPUTED' });
    // 1 unpaid (pending) — counts in funnel but NOT in GMV/paidOrders
    await makeOrder({ buyerId: dom, buyerType: 'LIBERIA_DOMESTIC', total: 999, paymentStatus: 'PENDING', status: 'PENDING_PAYMENT' });

    const after = await getPlatformAnalytics(prisma, { now: NOW, windowDays: 30 });

    expect(after.gmv - before.gmv).toBe(350); // 100 + 50 + 200, not the 999 pending
    expect(after.paidOrders - before.paidOrders).toBe(3);
    expect(after.newBuyers - before.newBuyers).toBe(2);
    expect(after.audience.domestic - before.audience.domestic).toBe(3); // 2 paid + 1 pending
    expect(after.audience.diaspora - before.audience.diaspora).toBe(1);
    expect(after.funnel.delivered - before.funnel.delivered).toBe(1);
    expect(after.funnel.completed - before.funnel.completed).toBe(1);
    expect(after.funnel.disputed - before.funnel.disputed).toBe(1);
    expect(after.funnel.pendingPayment - before.funnel.pendingPayment).toBe(1);
  });

  it('computes AOV as GMV / paid orders and is non-negative', async () => {
    const a = await getPlatformAnalytics(prisma, { now: NOW, windowDays: 30 });
    expect(a.aov).toBeGreaterThanOrEqual(0);
    if (a.paidOrders > 0) expect(a.aov).toBeCloseTo(a.gmv / a.paidOrders);
    expect(a.openDisputes).toBeGreaterThanOrEqual(0);
    expect(a.openTrustCases).toBeGreaterThanOrEqual(0);
  });
});
