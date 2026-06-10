/**
 * Nightly batch trust-score recompute (packages/domain/src/trust-score.ts:
 * recomputeActiveBuyerTrustScores). Finds every buyer with order or dispute
 * activity since a cutoff and recomputes each one's score, so the §5.1.12 score
 * stays fresh without touching hot paths.
 *
 * Hermetic: each test uses its own freshly-created buyer(s) and asserts on the
 * returned userIds + that buyer's stored score — never on the global count.
 * `updated_at` is an @updatedAt column, so "old" activity is forced via raw SQL.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { recomputeActiveBuyerTrustScores } = await import('@vendoora/domain');

const TAG = `tsb-${randomUUID()}`;
const NOW = new Date();
const HOUR = 3600 * 1000;
const SINCE = new Date(NOW.getTime() - 1 * HOUR);
const buyerIds: string[] = [];

async function makeBuyer(): Promise<string> {
  const id = `${TAG}-${randomUUID().slice(0, 8)}`;
  const u = await prisma.user.create({
    data: {
      clerk_id: `guest_${id}`,
      email: `${id}@vendoora.test`,
      full_name: 'Batch Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  buyerIds.push(u.id);
  return u.id;
}

async function makeOrder(buyerId: string): Promise<string> {
  const o = await prisma.order.create({
    data: {
      order_number: `VDR-TSB-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Batch',
      buyer_email: `${TAG}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: 100,
      total_amount: 100,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: 'DELIVERED',
    },
    select: { id: true },
  });
  return o.id;
}

async function ageOrder(orderId: string, ageMs: number): Promise<void> {
  const aged = new Date(NOW.getTime() - ageMs);
  await prisma.$executeRaw`UPDATE orders SET updated_at = ${aged} WHERE id = ${orderId}`;
}

async function makeDispute(buyerId: string, orderId: string): Promise<void> {
  await prisma.dispute.create({
    data: {
      dispute_number: `DSP-TSB-${randomUUID().slice(0, 8).toUpperCase()}`,
      order_id: orderId,
      initiated_by_user_id: buyerId,
      category: 'NOT_RECEIVED',
      reason: 'BUYER_INITIATED',
      description: `${TAG} fixture`,
      sla_due_at: new Date(NOW.getTime() + 48 * HOUR),
    },
  });
}

async function storedScore(id: string): Promise<number> {
  const u = await prisma.user.findUnique({ where: { id }, select: { trust_score: true } });
  return Number(u?.trust_score);
}

beforeAll(() => {});

afterAll(async () => {
  await prisma.dispute.deleteMany({ where: { order: { buyer_user_id: { in: buyerIds } } } });
  await prisma.order.deleteMany({ where: { buyer_user_id: { in: buyerIds } } });
  await prisma.user.deleteMany({ where: { id: { in: buyerIds } } });
  await prisma.$disconnect();
});

describe('recomputeActiveBuyerTrustScores', () => {
  it('recomputes a buyer with a recent order', async () => {
    const buyer = await makeBuyer();
    await makeOrder(buyer); // updated_at ~ now
    const result = await recomputeActiveBuyerTrustScores(prisma, { since: SINCE });
    expect(result.userIds).toContain(buyer);
    expect(await storedScore(buyer)).toBe(80); // 1 settled order, no disputes/returns
  });

  it('skips a buyer whose only activity predates the cutoff', async () => {
    const buyer = await makeBuyer();
    const orderId = await makeOrder(buyer);
    await ageOrder(orderId, 10 * HOUR); // moved before SINCE
    const result = await recomputeActiveBuyerTrustScores(prisma, { since: SINCE });
    expect(result.userIds).not.toContain(buyer);
    expect(await storedScore(buyer)).toBe(50); // untouched default
  });

  it('includes a buyer reached via recent dispute activity (order itself is old)', async () => {
    const buyer = await makeBuyer();
    const orderId = await makeOrder(buyer);
    await ageOrder(orderId, 10 * HOUR); // order is old...
    await makeDispute(buyer, orderId); // ...but the dispute is recent
    const result = await recomputeActiveBuyerTrustScores(prisma, { since: SINCE });
    expect(result.userIds).toContain(buyer);
    expect(await storedScore(buyer)).toBe(40); // 1 settled - 1 dispute => 50 + 30 - 40
  });
});
