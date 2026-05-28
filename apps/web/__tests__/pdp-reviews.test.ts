/**
 * Tests for the PDP's real-reviews path — confirms the seed produced the
 * expected review shape and that the rating histogram / total counts
 * resolve from prisma.review.groupBy correctly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');

beforeAll(async () => {
  const total = await prisma.review.count({ where: { subject_type: 'PRODUCT' } });
  if (total < 18) {
    throw new Error(
      'Need product reviews in vendoora_test. Run the updated seed (`pnpm db:seed` against the test DB) first.',
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('PDP reviews', () => {
  it('every seeded product has at least 1 published review', async () => {
    const products = await prisma.product.findMany({
      where: {
        status: 'PUBLISHED',
        moderation_status: 'APPROVED',
        deleted_at: null,
      },
      select: { id: true, name: true },
    });
    for (const p of products) {
      const count = await prisma.review.count({
        where: {
          subject_type: 'PRODUCT',
          subject_id: p.id,
          status: 'PUBLISHED',
        },
      });
      expect(count).toBeGreaterThan(0);
    }
  });

  it('groupBy by rating returns the histogram shape the PDP renders', async () => {
    const product = await prisma.product.findFirst({
      where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    });
    if (!product) throw new Error('No published product seeded');

    const rows = await prisma.review.groupBy({
      by: ['rating'],
      where: {
        subject_type: 'PRODUCT',
        subject_id: product.id,
        status: 'PUBLISHED',
      },
      _count: { _all: true },
    });

    expect(rows.length).toBeGreaterThan(0);
    const total = rows.reduce((s, r) => s + r._count._all, 0);
    expect(total).toBe(6); // 6 reviews per product from the seed
  });

  it('product.rating_average reflects the actual review average', async () => {
    const product = await prisma.product.findFirst({
      where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    });
    if (!product) throw new Error('No published product seeded');

    const reviews = await prisma.review.findMany({
      where: {
        subject_type: 'PRODUCT',
        subject_id: product.id,
        status: 'PUBLISHED',
      },
      select: { rating: true },
    });
    const actualAvg =
      reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;

    expect(product.rating_average).not.toBeNull();
    expect(Math.abs((product.rating_average ?? 0) - actualAvg)).toBeLessThan(0.01);
  });

  it('verified_purchase is true on the majority of reviews', async () => {
    // Seed sets 4 of every 6 reviews as verified.
    const verifiedCount = await prisma.review.count({
      where: { subject_type: 'PRODUCT', verified_purchase: true },
    });
    const totalCount = await prisma.review.count({
      where: { subject_type: 'PRODUCT' },
    });
    expect(verifiedCount / totalCount).toBeGreaterThan(0.5);
  });
});
