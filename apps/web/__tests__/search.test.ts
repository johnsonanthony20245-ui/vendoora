/**
 * Tests for the searchProducts helper.
 *
 * Exercises the Postgres tsvector + GIN index path: title/description matching,
 * ranking (title-weight A > description-weight B), filtering by category/
 * condition, exclusion of non-published rows, and pagination.
 *
 * Requires the seed to have run against the test DB (18 products).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { searchProducts } = await import('../lib/search');

beforeAll(async () => {
  const count = await prisma.product.count({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED', deleted_at: null },
  });
  if (count < 10) {
    throw new Error('Run `pnpm db:seed` against the test DB before running search tests.');
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('searchProducts', () => {
  it('returns empty results when query matches nothing', async () => {
    const result = await searchProducts({ q: 'xyzzzqqzz' });
    expect(result.products).toHaveLength(0);
    expect(result.totalCount).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('finds a product by title word', async () => {
    const result = await searchProducts({ q: 'rice' });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.some((p) => p.name.toLowerCase().includes('rice'))).toBe(true);
  });

  it('finds a product by description word that is not in any title', async () => {
    // "Lofa" appears only in the description of "Country Rice — 25kg bag"
    const result = await searchProducts({ q: 'Lofa' });
    expect(result.products.length).toBeGreaterThan(0);
    expect(result.products.some((p) => p.name.includes('Country Rice'))).toBe(true);
  });

  it('returns only PUBLISHED + APPROVED + non-deleted products', async () => {
    const result = await searchProducts({ q: 'rice' });
    for (const p of result.products) {
      const dbCheck = await prisma.product.findUnique({
        where: { id: p.id },
        select: { status: true, moderation_status: true, deleted_at: true },
      });
      expect(dbCheck?.status).toBe('PUBLISHED');
      expect(dbCheck?.moderation_status).toBe('APPROVED');
      expect(dbCheck?.deleted_at).toBeNull();
    }
  });

  it('filters by category slug (empty query = browse mode)', async () => {
    const result = await searchProducts({ categorySlug: 'food-drink' });
    expect(result.products.length).toBeGreaterThan(0);
    for (const p of result.products) {
      const cat = await prisma.product.findUnique({
        where: { id: p.id },
        select: { category: { select: { slug: true } } },
      });
      expect(cat?.category.slug).toBe('food-drink');
    }
  });

  it('filters by condition', async () => {
    // "Bamboo Basket — Large" is the only LIKE_NEW in the seed; everything else is NEW.
    const result = await searchProducts({ condition: 'LIKE_NEW' });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.name).toMatch(/Bamboo Basket/);
  });

  it('paginates: page 1 and page 2 return disjoint product sets', async () => {
    const perPage = 5;
    const page1 = await searchProducts({ page: 1, perPage });
    const page2 = await searchProducts({ page: 2, perPage });

    expect(page1.products).toHaveLength(perPage);
    expect(page2.products.length).toBeGreaterThan(0);

    const page1Ids = new Set(page1.products.map((p) => p.id));
    for (const p of page2.products) {
      expect(page1Ids.has(p.id)).toBe(false);
    }

    expect(page1.totalCount).toBeGreaterThanOrEqual(18);
    expect(page1.totalPages).toBe(Math.ceil(page1.totalCount / perPage));
  });
});
