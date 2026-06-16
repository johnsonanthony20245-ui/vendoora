/**
 * Top-sellers-by-GMV aggregation (apps/web/lib/admin-analytics.ts: getTopSellers).
 * Ranks sellers by seller_net over paid order-items in the window. Global ranking,
 * so the test asserts on its OWN seller's row (found by id) with a large limit,
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
let buyerId = '';
let categoryId = '';
let sellerId = '';
const userIds: string[] = [];
const orderIds: string[] = [];

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

  const sellerUser = await prisma.user.create({
    data: {
      clerk_id: `ts_s_${randomUUID().slice(0, 10)}`,
      email: `${TAG}-s@vendoora.test`,
      full_name: 'TS Seller',
      is_email_verified: true,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(sellerUser.id);
  const seller = await prisma.seller.create({
    data: {
      user_id: sellerUser.id,
      business_name: `Top Shop ${TAG}`,
      business_slug: `top-shop-${TAG}`,
      business_email: `${TAG}-s@shop.test`,
      business_phone: '+231770000000',
      business_address: { street: '1' },
      business_type: 'INDIVIDUAL',
    },
    select: { id: true },
  });
  sellerId = seller.id;
  const product = await prisma.product.create({
    data: {
      seller_id: seller.id,
      category_id: categoryId,
      name: `TS Item ${TAG}`,
      slug: `ts-item-${TAG}`,
      description: 'fixture',
      base_price: 100,
      attributes: {},
    },
    select: { id: true },
  });

  // Two PAID orders in the window: seller_net 90 + 180 = 270.
  for (const net of [90, 180]) {
    const at = new Date(NOW.getTime() - 24 * 3600 * 1000);
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
        subtotal: net + 10,
        total_amount: net + 10,
        currency: 'USD',
        payment_method: 'MTN_MOMO',
        payment_status: 'CAPTURED',
        status: 'COMPLETED',
        created_at: at,
        paid_at: at,
        items: {
          create: {
            product_id: product.id,
            seller_id: seller.id,
            product_snapshot: {},
            quantity: 1,
            unit_price: net + 10,
            subtotal: net + 10,
            commission_rate: 0.1,
            commission_amount: 10,
            seller_net: net,
          },
        },
      },
      select: { id: true },
    });
    orderIds.push(o.id);
  }
  // One PAID order OUTSIDE the window (40 days ago) — must not count.
  {
    const at = new Date(NOW.getTime() - 40 * 24 * 3600 * 1000);
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
        subtotal: 1000,
        total_amount: 1000,
        currency: 'USD',
        payment_method: 'MTN_MOMO',
        payment_status: 'CAPTURED',
        status: 'COMPLETED',
        created_at: at,
        paid_at: at,
        items: {
          create: {
            product_id: product.id,
            seller_id: seller.id,
            product_snapshot: {},
            quantity: 1,
            unit_price: 1000,
            subtotal: 1000,
            commission_rate: 0.1,
            commission_amount: 100,
            seller_net: 900,
          },
        },
      },
      select: { id: true },
    });
    orderIds.push(o.id);
  }
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { seller_id: sellerId } });
  await prisma.seller.deleteMany({ where: { id: sellerId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('getTopSellers', () => {
  it('ranks the seller with its in-window net revenue (excludes out-of-window)', async () => {
    const top = await getTopSellers(prisma, { now: NOW, windowDays: 30, limit: 1000 });
    const mine = top.find((s) => s.sellerId === sellerId);
    expect(mine).toBeDefined();
    expect(mine?.businessName).toBe(`Top Shop ${TAG}`);
    expect(mine?.gmv).toBe(270); // 90 + 180; the 40-day-old 900 is out of window
    expect(mine?.lineItems).toBe(2);
  });

  it('orders results by GMV descending and respects the limit', async () => {
    const top = await getTopSellers(prisma, { now: NOW, windowDays: 30, limit: 5 });
    expect(top.length).toBeLessThanOrEqual(5);
    const gmvs = top.map((s) => s.gmv);
    const sortedDesc = [...gmvs].sort((a, b) => b - a);
    expect(gmvs).toEqual(sortedDesc);
  });
});
