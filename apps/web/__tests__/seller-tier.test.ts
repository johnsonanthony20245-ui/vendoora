/**
 * Tests for the seller listing tier cap (lib/seller-tier). This is the gate
 * that the createProduct action enforces server-side, so it has to remain
 * faithful: a stubbed "always allow" would let a STARTER seller blow past 25.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getListingUsage, LISTING_LIMIT_BY_PLAN } = await import('../lib/seller-tier');

const TAG = 'tier_test_';
let sellerId = '';
let categoryId = '';

beforeAll(async () => {
  const cat = await prisma.category.findFirst({ select: { id: true } });
  if (!cat) throw new Error('Need seeded categories. Run pnpm db:seed.');
  categoryId = cat.id;
});

beforeEach(async () => {
  // Clean any prior test artifacts.
  await prisma.product.deleteMany({ where: { seller: { business_slug: { startsWith: TAG } } } });
  await prisma.seller.deleteMany({ where: { business_slug: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });

  const uid = randomUUID().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      clerk_id: `${TAG}${uid}`,
      email: `${TAG}${uid}@vendoora.test`,
      full_name: 'Tier Test',
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  const seller = await prisma.seller.create({
    data: {
      user_id: user.id,
      business_name: 'Tier Test',
      business_slug: `${TAG}${uid}`,
      business_email: `${TAG}${uid}@vendoora.test`,
      business_phone: '+231880000000',
      business_address: { city: 'Monrovia' },
      business_type: 'SOLE_PROPRIETOR',
      kyc_tier: 1,
      kyc_status: 'APPROVED',
      saas_plan: 'STARTER',
    },
    select: { id: true },
  });
  sellerId = seller.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { seller: { business_slug: { startsWith: TAG } } } });
  await prisma.seller.deleteMany({ where: { business_slug: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  await prisma.$disconnect();
});

async function makeProducts(n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await prisma.product.create({
      data: {
        seller_id: sellerId,
        category_id: categoryId,
        name: `Tier Test Item ${i}`,
        slug: `tier-test-item-${randomUUID().slice(0, 8)}`,
        description: 'A tier-test fixture product, at least twenty characters long.',
        base_price: 10,
        currency: 'USD',
        attributes: {},
        tags: [],
        condition: 'NEW',
        status: 'DRAFT',
        moderation_status: 'PENDING',
      },
    });
  }
}

describe('getListingUsage', () => {
  it('reports 0 used / 25 limit / not-at-cap for a new STARTER seller', async () => {
    const usage = await getListingUsage(sellerId, 'STARTER');
    expect(usage.used).toBe(0);
    expect(usage.limit).toBe(LISTING_LIMIT_BY_PLAN.STARTER);
    expect(usage.remaining).toBe(25);
    expect(usage.atCap).toBe(false);
  });

  it('counts non-deleted products toward the cap', async () => {
    await makeProducts(3);
    const usage = await getListingUsage(sellerId, 'STARTER');
    expect(usage.used).toBe(3);
    expect(usage.remaining).toBe(22);
    expect(usage.atCap).toBe(false);
  });

  it('flips atCap=true at exactly the STARTER plan ceiling', async () => {
    await makeProducts(LISTING_LIMIT_BY_PLAN.STARTER);
    const usage = await getListingUsage(sellerId, 'STARTER');
    expect(usage.used).toBe(LISTING_LIMIT_BY_PLAN.STARTER);
    expect(usage.atCap).toBe(true);
    expect(usage.remaining).toBe(0);
  });

  it('a soft-deleted product no longer counts toward the cap', async () => {
    await makeProducts(2);
    const all = await prisma.product.findMany({ where: { seller_id: sellerId } });
    if (!all[0]) throw new Error('expected at least one product');
    await prisma.product.update({ where: { id: all[0].id }, data: { deleted_at: new Date() } });
    const usage = await getListingUsage(sellerId, 'STARTER');
    expect(usage.used).toBe(1);
  });

  it('ENTERPRISE has an infinite cap (never at-cap)', async () => {
    await makeProducts(5);
    const usage = await getListingUsage(sellerId, 'ENTERPRISE');
    expect(Number.isFinite(usage.limit)).toBe(false);
    expect(usage.atCap).toBe(false);
    // remaining is +Infinity for an unlimited plan
    expect(Number.isFinite(usage.remaining)).toBe(false);
  });
});
