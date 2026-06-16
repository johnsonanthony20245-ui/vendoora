/**
 * Top-sellers-by-GMV aggregation (apps/web/lib/admin-analytics.ts: getTopSellers).
 * Ranks sellers by seller_net over paid order-items in the window. Global ranking,
 * so the tests assert on their OWN sellers' rows (found by id) with a large limit,
 * never on absolute rank.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getTopSellers } = await import('../lib/admin-analytics');

const TAG = `ts-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;
let buyerId = '';
let categoryId = '';
let sellerBig = '';
let sellerSmall = '';
const userIds: string[] = [];
const sellerIds: string[] = [];
const orderIds: string[] = [];

async function createSeller(name: string): Promise<{ sellerId: string; productId: string }> {
  const t = randomUUID().slice(0, 8);
  const u = await prisma.user.create({
    data: {
      clerk_id: `ts_s_${t}`,
      email: `${TAG}-s-${t}@vendoora.test`,
      full_name: 'TS Seller',
      is_email_verified: true,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(u.id);
  const seller = await prisma.seller.create({
    data: {
      user_id: u.id,
      business_name: name,
      business_slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${t}`,
      business_email: `${TAG}-s-${t}@shop.test`,
      business_phone: '+231770000000',
      business_address: { street: '1' },
      business_type: 'INDIVIDUAL',
    },
    select: { id: true },
  });
  sellerIds.push(seller.id);
  const product = await prisma.product.create({
    data: {
      seller_id: seller.id,
      category_id: categoryId,
      name: `Item ${t}`,
      slug: `ts-item-${t}`,
      description: 'fixture',
      base_price: 100,
      attributes: {},
    },
    select: { id: true },
  });
  return { sellerId: seller.id, productId: product.id };
}

async function addOrder(opts: {
  sellerId: string;
  productId: string;
  net: number;
  paymentStatus?: 'CAPTURED' | 'PENDING';
  daysAgo?: number;
}): Promise<void> {
  const at = new Date(NOW.getTime() - (opts.daysAgo ?? 1) * DAY);
  const captured = (opts.paymentStatus ?? 'CAPTURED') === 'CAPTURED';
  const o = await prisma.order.create({
    data: {
      order_number: `VDR-TS-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'B',
      buyer_email: `${TAG}-b@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: opts.net + 10,
      total_amount: opts.net + 10,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: (captured ? 'CAPTURED' : 'PENDING') as never,
      status: (captured ? 'COMPLETED' : 'PENDING_PAYMENT') as never,
      created_at: at,
      ...(captured ? { paid_at: at } : {}),
      items: {
        create: {
          product_id: opts.productId,
          seller_id: opts.sellerId,
          product_snapshot: {},
          quantity: 1,
          unit_price: opts.net + 10,
          subtotal: opts.net + 10,
          commission_rate: 0.1,
          commission_amount: 10,
          seller_net: opts.net,
        },
      },
    },
    select: { id: true },
  });
  orderIds.push(o.id);
}

beforeAll(async () => {
  const buyer = await prisma.user.create({
    data: {
      clerk_id: `ts_b_${randomUUID().slice(0, 10)}`,
      email: `${TAG}-b@vendoora.test`,
      full_name: 'TS Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  buyerId = buyer.id;
  userIds.push(buyer.id);
  categoryId = (
    await prisma.category.create({
      data: { name: `TS ${TAG}`, slug: `ts-${TAG}`, attributes_schema: {} },
      select: { id: true },
    })
  ).id;

  const big = await createSeller(`Top Shop ${TAG}`);
  sellerBig = big.sellerId;
  await addOrder({ sellerId: big.sellerId, productId: big.productId, net: 90 });
  await addOrder({ sellerId: big.sellerId, productId: big.productId, net: 180 });
  // Paid but OUT of window (40 days) — excluded.
  await addOrder({ sellerId: big.sellerId, productId: big.productId, net: 900, daysAgo: 40 });
  // Unpaid (PENDING) in window — items must NOT count.
  await addOrder({ sellerId: big.sellerId, productId: big.productId, net: 999, paymentStatus: 'PENDING' });

  const small = await createSeller(`Small Shop ${TAG}`);
  sellerSmall = small.sellerId;
  await addOrder({ sellerId: small.sellerId, productId: small.productId, net: 50 });
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { seller_id: { in: sellerIds } } });
  await prisma.seller.deleteMany({ where: { id: { in: sellerIds } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('getTopSellers', () => {
  it('sums in-window net revenue, excluding out-of-window and unpaid items', async () => {
    const top = await getTopSellers(prisma, { now: NOW, windowDays: 30, limit: 1000 });
    const mine = top.find((s) => s.sellerId === sellerBig);
    expect(mine).toBeDefined();
    expect(mine?.businessName).toBe(`Top Shop ${TAG}`);
    expect(mine?.gmv).toBe(270); // 90 + 180; not the 40-day-old 900 nor the unpaid 999
    expect(mine?.lineItems).toBe(2);
  });

  it('ranks a higher-revenue seller above a lower one', async () => {
    const top = await getTopSellers(prisma, { now: NOW, windowDays: 30, limit: 1000 });
    const bigIdx = top.findIndex((s) => s.sellerId === sellerBig);
    const smallIdx = top.findIndex((s) => s.sellerId === sellerSmall);
    expect(bigIdx).toBeGreaterThanOrEqual(0);
    expect(smallIdx).toBeGreaterThanOrEqual(0);
    expect(bigIdx).toBeLessThan(smallIdx); // 270 > 50 → ranked higher
    expect(top.find((s) => s.sellerId === sellerSmall)?.gmv).toBe(50);
  });

  it('orders the result by GMV descending and respects the limit', async () => {
    const top = await getTopSellers(prisma, { now: NOW, windowDays: 30, limit: 5 });
    expect(top.length).toBeLessThanOrEqual(5);
    const gmvs = top.map((s) => s.gmv);
    expect(gmvs).toEqual([...gmvs].sort((a, b) => b - a));
  });
});
