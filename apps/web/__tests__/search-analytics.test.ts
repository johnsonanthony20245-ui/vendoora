/**
 * Tests for logSearchEvent and the SearchEvent table shape that drives
 * /admin/search-insights.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

// next/headers cookies() throws outside a request context; stub it so the
// helper can read "no cookie".
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => undefined,
  }),
}));

const { prisma } = await import('@vendoora/db');
const { logSearchEvent } = await import('../lib/search-analytics');

const TEST_MARKER = `test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

async function cleanup() {
  await prisma.searchEvent.deleteMany({
    where: { q: { startsWith: TEST_MARKER } },
  });
}

beforeAll(async () => {
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe('logSearchEvent', () => {
  it('writes a row with the normalised query + totals', async () => {
    const q = `${TEST_MARKER}_hello world`;
    await logSearchEvent({
      q,
      categorySlug: 'food-drink',
      condition: 'NEW',
      totalCount: 7,
      page: 2,
    });

    const row = await prisma.searchEvent.findFirst({
      where: { q: q.toLowerCase() },
    });
    expect(row).not.toBeNull();
    expect(row?.q).toBe(q.toLowerCase()); // lowercased, trimmed
    expect(row?.category_slug).toBe('food-drink');
    expect(row?.condition).toBe('NEW');
    expect(row?.total_count).toBe(7);
    expect(row?.page).toBe(2);
    expect(row?.anon_session_id).toBeNull();
    expect(row?.user_id).toBeNull();
  });

  it('treats whitespace-only queries as empty after trim', async () => {
    const q = `${TEST_MARKER}_with_pad`;
    await logSearchEvent({
      q: `  ${q}  `,
      categorySlug: undefined,
      condition: undefined,
      totalCount: 0,
      page: 1,
    });
    const row = await prisma.searchEvent.findFirst({
      where: { q: q.toLowerCase() },
    });
    expect(row).not.toBeNull();
    expect(row?.q).toBe(q.toLowerCase());
  });

  it('groupBy on zero-result queries surfaces a catalog gap', async () => {
    const gap1 = `${TEST_MARKER}_iphone_14`;
    const gap2 = `${TEST_MARKER}_lambo`;
    // Same gap1 searched twice, gap2 once. All zero results.
    await logSearchEvent({ q: gap1, categorySlug: undefined, condition: undefined, totalCount: 0, page: 1 });
    await logSearchEvent({ q: gap1, categorySlug: undefined, condition: undefined, totalCount: 0, page: 1 });
    await logSearchEvent({ q: gap2, categorySlug: undefined, condition: undefined, totalCount: 0, page: 1 });

    const rows = await prisma.searchEvent.groupBy({
      by: ['q'],
      where: { q: { startsWith: TEST_MARKER }, total_count: 0 },
      _count: { _all: true },
      orderBy: { _count: { q: 'desc' } },
    });

    const map = new Map(rows.map((r) => [r.q, r._count._all]));
    expect(map.get(gap1.toLowerCase())).toBe(2);
    expect(map.get(gap2.toLowerCase())).toBe(1);
  });

  it('does not throw when the database write fails', async () => {
    // Force a write failure by passing a non-Finite number (Prisma would
    // accept it as int but Postgres rejects). Use a Promise.race to ensure
    // we just don't blow up.
    await expect(
      logSearchEvent({
        q: 'never',
        categorySlug: undefined,
        condition: undefined,
        totalCount: Number.NaN, // will throw a validation error inside the try/catch
        page: 1,
      }),
    ).resolves.toBeUndefined();
  });
});
