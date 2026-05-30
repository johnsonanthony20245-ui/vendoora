/**
 * Tests for the homepage's real-reads path — confirms the stats bar and the
 * "Verified sellers in Sinkor" cards resolve from real Prisma queries against
 * the seeded marketplace, replacing the prototype's hand-curated stub numbers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getHomeStats, getNearbySellers } = await import('../lib/home');

beforeAll(async () => {
  const sellers = await prisma.seller.count({ where: { kyc_status: 'APPROVED' } });
  if (sellers < 1) {
    throw new Error(
      'Need approved sellers in vendoora_test. Run the seed (`pnpm db:seed` against the test DB) first.',
    );
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('getHomeStats', () => {
  it('verifiedSellers is the live count of approved, active sellers', async () => {
    const stats = await getHomeStats();
    const expected = await prisma.seller.count({
      where: { kyc_status: 'APPROVED', is_suspended: false, deleted_at: null },
    });
    // Floor: the 3 seeded sellers (Konah, Sundayma, Mariama) are always APPROVED.
    expect(stats.verifiedSellers).toBeGreaterThanOrEqual(3);
    // Drift tolerance: admin-kyc tests run in parallel and approve transient
    // sellers, so the two global counts can differ by 1-2. Anything wider would
    // be a real bug; anything that allowed a constant like 1200 to pass would
    // miss the directive violation we're guarding against.
    expect(Math.abs(stats.verifiedSellers - expected)).toBeLessThanOrEqual(2);
  });

  it('countiesServed equals the distinct counties of active delivery zones', async () => {
    const zones = await prisma.deliveryZone.findMany({
      where: { is_active: true },
      select: { county: true },
    });
    const expected = new Set(zones.map((z) => z.county)).size;
    const stats = await getHomeStats();
    expect(stats.countiesServed).toBe(expected);
    expect(stats.countiesServed).toBeGreaterThan(0);
  });

  it('avgDeliveryHours is the mean estimate across active Monrovia zones', async () => {
    const zones = await prisma.deliveryZone.findMany({
      where: { is_active: true, city: 'Monrovia' },
      select: { estimated_delivery_hours: true },
    });
    const expected =
      zones.length > 0
        ? Math.round(
            zones.reduce((s, z) => s + z.estimated_delivery_hours, 0) / zones.length,
          )
        : 24;
    const stats = await getHomeStats();
    expect(stats.avgDeliveryHours).toBe(expected);
    expect(stats.avgDeliveryHours).toBeGreaterThan(0);
  });

  it('escrowPct is the 100% platform invariant', async () => {
    const stats = await getHomeStats();
    expect(stats.escrowPct).toBe(100);
  });
});

describe('getNearbySellers', () => {
  it('returns at most `limit` verified sellers, ranked by KYC tier descending', async () => {
    const sellers = await getNearbySellers(4);
    expect(sellers.length).toBeGreaterThan(0);
    expect(sellers.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < sellers.length; i++) {
      const prev = sellers[i - 1];
      const cur = sellers[i];
      if (!prev || !cur) continue;
      expect(prev.tier).toBeGreaterThanOrEqual(cur.tier);
    }
  });

  it('the top seller is the highest-tier approved seller', async () => {
    const topTier = await prisma.seller.aggregate({
      where: { kyc_status: 'APPROVED', is_suspended: false, deleted_at: null },
      _max: { kyc_tier: true },
    });
    const sellers = await getNearbySellers(4);
    expect(sellers[0]?.tier).toBe(topTier._max.kyc_tier);
  });

  it('each seller productCount matches a direct published-product count', async () => {
    const sellers = await getNearbySellers(4);
    for (const s of sellers) {
      const seller = await prisma.seller.findUnique({
        where: { business_slug: s.slug },
        select: { id: true },
      });
      if (!seller) throw new Error(`seller ${s.slug} not found`);
      const expected = await prisma.product.count({
        where: {
          seller_id: seller.id,
          status: 'PUBLISHED',
          moderation_status: 'APPROVED',
          deleted_at: null,
        },
      });
      expect(s.productCount).toBe(expected);
    }
  });

  it('exposes real rating + display fields for each card', async () => {
    const sellers = await getNearbySellers(4);
    for (const s of sellers) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.slug.length).toBeGreaterThan(0);
      expect(s.initials.length).toBeGreaterThan(0);
      expect(s.ratingCount).toBeGreaterThanOrEqual(0);
      expect(s.totalOrders).toBeGreaterThanOrEqual(0);
      expect(s.city.length).toBeGreaterThan(0);
    }
  });
});
