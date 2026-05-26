/**
 * Smoke tests for the data shape that the /store/[slug] page consumes.
 * (Component render tests need a jsdom + RTL setup we haven't wired yet;
 * these verify the prisma queries the route depends on return the right
 * shape for the seeded sellers.)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');

beforeAll(async () => {
  // Sanity: seed must have run
  const count = await prisma.seller.count({ where: { business_slug: 'konah-boutique' } });
  if (count === 0) {
    throw new Error('Run `pnpm db:seed` against the test DB before running storefront tests.');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('storefront data', () => {
  it('finds an active seller by business_slug', async () => {
    const seller = await prisma.seller.findUnique({ where: { business_slug: 'konah-boutique' } });
    expect(seller).not.toBeNull();
    expect(seller?.is_suspended).toBe(false);
    expect(seller?.deleted_at).toBeNull();
    expect(seller?.business_name).toBe('Konah Boutique');
  });

  it('returns null for unknown slug (drives a 404)', async () => {
    const seller = await prisma.seller.findUnique({ where: { business_slug: 'no-such-seller' } });
    expect(seller).toBeNull();
  });

  it("lists only the seller's PUBLISHED + APPROVED products", async () => {
    const seller = await prisma.seller.findUnique({ where: { business_slug: 'konah-boutique' } });
    if (!seller) throw new Error('Seller not in test DB');

    const products = await prisma.product.findMany({
      where: {
        seller_id: seller.id,
        status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        deleted_at: null,
      },
    });
    expect(products.length).toBeGreaterThanOrEqual(1);
    for (const p of products) {
      expect(p.status).toBe('PUBLISHED');
      expect(p.moderation_status).toBe('APPROVED');
      expect(p.deleted_at).toBeNull();
    }
  });

  it("does NOT list a different seller's products under konah-boutique", async () => {
    const konah = await prisma.seller.findUnique({ where: { business_slug: 'konah-boutique' } });
    const sundayma = await prisma.seller.findUnique({ where: { business_slug: 'sundayma-foods' } });
    if (!konah || !sundayma) throw new Error('Seeded sellers missing');

    const konahProducts = await prisma.product.findMany({
      where: { seller_id: konah.id, status: 'PUBLISHED' },
    });
    const sundaymaIds = new Set(
      (await prisma.product.findMany({ where: { seller_id: sundayma.id } })).map((p) => p.id),
    );

    for (const p of konahProducts) {
      expect(sundaymaIds.has(p.id)).toBe(false);
    }
  });

  // Note: a "flip product to DRAFT then back" defensive test was considered
  // here but removed because parallel test files (db-integration.test.ts'
  // 18-product seed assertion) race on the in-flight mutation. The filter
  // shape is already covered by 'lists only the seller's PUBLISHED + APPROVED'.
});
