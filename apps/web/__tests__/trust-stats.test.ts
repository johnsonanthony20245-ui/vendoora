/**
 * Tests for the /trust-center live stats — confirms getTrustStats() computes
 * each figure from real DB aggregates (replacing the prototype's fabricated
 * "$2.4M / 99.7% / 0.4%" illustrative constants).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getTrustStats } = await import('../lib/trust');

beforeAll(async () => {
  const sellers = await prisma.seller.count();
  if (sellers < 1) throw new Error('Need sellers in vendoora_test. Run pnpm db:seed.');
});

afterAll(async () => {
  await prisma.$disconnect();
});

// NOTE: escrow sum + order/dispute counts are GLOBAL aggregates that other
// test files (which run in parallel) mutate, so they can't be asserted against
// a separately-queried "expected" without flaking. Those two are checked for
// real shape/range; the stable seller metrics carry the exact-match proof that
// getTrustStats reads real aggregates (not the prototype's fabricated strings).
describe('getTrustStats', () => {
  it('escrowHeldUsd is a real non-negative number (sum of active holds)', async () => {
    const stats = await getTrustStats();
    expect(typeof stats.escrowHeldUsd).toBe('number');
    expect(Number.isFinite(stats.escrowHeldUsd)).toBe(true);
    expect(stats.escrowHeldUsd).toBeGreaterThanOrEqual(0);
  });

  it('disputeRatePct is a real percentage in [0, 100]', async () => {
    const stats = await getTrustStats();
    expect(Number.isFinite(stats.disputeRatePct)).toBe(true);
    expect(stats.disputeRatePct).toBeGreaterThanOrEqual(0);
    expect(stats.disputeRatePct).toBeLessThanOrEqual(100);
  });

  it('sellersVerifiedPct equals approved / total sellers', async () => {
    const [total, approved] = await Promise.all([
      prisma.seller.count({ where: { deleted_at: null } }),
      prisma.seller.count({ where: { deleted_at: null, kyc_status: 'APPROVED' } }),
    ]);
    const expected = total > 0 ? Math.round((approved / total) * 100) : 100;
    const stats = await getTrustStats();
    expect(stats.sellersVerifiedPct).toBe(expected);
  });

  it('codeVerifiedPct is the 100% platform invariant (code is the only path to DELIVERED)', async () => {
    const stats = await getTrustStats();
    expect(stats.codeVerifiedPct).toBe(100);
  });
});
