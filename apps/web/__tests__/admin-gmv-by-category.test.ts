/**
 * GMV-by-category aggregation (apps/web/lib/admin-analytics.ts: getGmvByCategory).
 * Sums order-item subtotal by the item's product category over paid order-items
 * in the window. Global, so the test asserts on its OWN categories' rows (by id).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getGmvByCategory } = await import('../lib/admin-analytics');

const TAG = `gc-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;
let buyerId = '';
let sellerId = '';
let catA = '';
let catB = '';
let prodA = '';
let prodB = '';
const userIds: string[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
const orderIds: string[] = [];

async function makeCategory(name: string): Promise<string> {
  const c = await prisma.category.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`, attributes_schema: {} },
    select: { id: true },
  });
  categoryIds.push(c.id);
  return c.id;
}

async function makeProduct(categoryId: string): Promise<string> {
  const p = await prisma.product.create({
    data: {
      seller_id: sellerId,
      category_id: categoryId,
      name: `P ${randomUUID().slice(0, 6)}`,
      slug: `p-${TAG}-${randomUUID().slice(0, 6)}`,
      description: 'fixture',
      base_price: 100,
      attributes: {},
    },
    select: { id: true },
  });
  productIds.push(p.id);
  return p.id;
}

async function makeOrderItem(productId: string, subtotal: number, daysAgo = 1): Promise<void> {
  const at = new Date(NOW.getTime() - daysAgo * DAY);
  const o = await prisma.order.create({
    data: {
      order_number: `VDR-GC-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'B',
      buyer_email: `${TAG}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal,
      total_amount: subtotal,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: 'COMPLETED',
      created_at: at,
      paid_at: at,
      items: {
        create: {
          product_id: productId,
          seller_id: sellerId,
          product_snapshot: {},
          quantity: 1,
          unit_price: subtotal,
          subtotal,
          commission_rate: 0.1,
          commission_amount: subtotal * 0.1,
          seller_net: subtotal * 0.9,
        },
      },
    },
    select: { id: true },
  });
  orderIds.push(o.id);
}

beforeAll(async () => {
  const buyer = await prisma.user.create({
    data: { clerk_id: `gc_b_${randomUUID().slice(0, 10)}`, email: `${TAG}-b@vendoora.test`, full_name: 'GC Buyer', is_email_verified: false, account_status: 'ACTIVE' },
    select: { id: true },
  });
  buyerId = buyer.id;
  userIds.push(buyer.id);
  const sellerUser = await prisma.user.create({
    data: { clerk_id: `gc_s_${randomUUID().slice(0, 10)}`, email: `${TAG}-s@vendoora.test`, full_name: 'GC Seller', is_email_verified: true, account_status: 'ACTIVE' },
    select: { id: true },
  });
  userIds.push(sellerUser.id);
  sellerId = (
    await prisma.seller.create({
      data: { user_id: sellerUser.id, business_name: `GC Shop ${TAG}`, business_slug: `gc-shop-${TAG}`, business_email: `${TAG}-s@shop.test`, business_phone: '+231770000000', business_address: { street: '1' }, business_type: 'INDIVIDUAL' },
      select: { id: true },
    })
  ).id;

  catA = await makeCategory(`Cat A ${TAG}`);
  catB = await makeCategory(`Cat B ${TAG}`);
  prodA = await makeProduct(catA);
  prodB = await makeProduct(catB);

  await makeOrderItem(prodA, 100);
  await makeOrderItem(prodA, 100); // catA: 200
  await makeOrderItem(prodB, 50); // catB: 50
  await makeOrderItem(prodA, 999, 40); // out of window — excluded
});

afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order_id: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.seller.deleteMany({ where: { id: sellerId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('getGmvByCategory', () => {
  it('sums in-window subtotal per category and excludes out-of-window', async () => {
    const rows = await getGmvByCategory(prisma, { now: NOW, windowDays: 30 });
    const a = rows.find((r) => r.categoryId === catA);
    const b = rows.find((r) => r.categoryId === catB);
    expect(a?.gmv).toBe(200); // 100 + 100; not the 40-day-old 999
    expect(a?.categoryName).toBe(`Cat A ${TAG}`);
    expect(b?.gmv).toBe(50);
  });

  it('returns categories ordered by GMV descending', async () => {
    const rows = await getGmvByCategory(prisma, { now: NOW, windowDays: 30 });
    const aIdx = rows.findIndex((r) => r.categoryId === catA);
    const bIdx = rows.findIndex((r) => r.categoryId === catB);
    expect(aIdx).toBeGreaterThanOrEqual(0);
    expect(bIdx).toBeGreaterThanOrEqual(0);
    expect(aIdx).toBeLessThan(bIdx); // 200 > 50
    const gmvs = rows.map((r) => r.gmv);
    expect(gmvs).toEqual([...gmvs].sort((x, y) => y - x));
  });
});
