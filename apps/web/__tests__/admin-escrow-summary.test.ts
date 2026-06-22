/**
 * Escrow ledger summary (apps/web/lib/admin-finance.ts: getEscrowSummary).
 * Currently-held funds split by state + by age. Global, so the test asserts on
 * DELTAS around a known set of holds (totals/state/age), hermetic vs. seed data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { getEscrowSummary } = await import('../lib/admin-finance');

const TAG = `es-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;
let orderId = '';
let buyerId = '';
const holdIds: string[] = [];

async function makeHold(opts: { amount: number; state: string; ageDays: number }): Promise<void> {
  const h = await prisma.escrowHold.create({
    data: {
      order_id: orderId,
      beneficiary_type: 'SELLER',
      amount: opts.amount,
      currency: 'USD',
      state: opts.state as never,
      state_changed_at: new Date(NOW.getTime() - opts.ageDays * DAY),
    },
    select: { id: true },
  });
  holdIds.push(h.id);
}

beforeAll(async () => {
  const buyer = await prisma.user.create({
    data: { clerk_id: `es_${randomUUID().slice(0, 10)}`, email: `${TAG}@vendoora.test`, full_name: 'Escrow Buyer', is_email_verified: false, account_status: 'ACTIVE' },
    select: { id: true },
  });
  buyerId = buyer.id;
  orderId = (
    await prisma.order.create({
      data: {
        order_number: `VDR-ES-${randomUUID().slice(0, 8).toUpperCase()}`,
        buyer_user_id: buyer.id,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'E',
        buyer_email: `${TAG}@vendoora.test`,
        delivery_address: { street: '1' },
        delivery_city: 'Monrovia',
        delivery_country: 'LR',
        delivery_zone: 'sinkor',
        subtotal: 100,
        total_amount: 100,
        currency: 'USD',
        payment_method: 'MTN_MOMO',
        payment_status: 'CAPTURED',
        status: 'OUT_FOR_DELIVERY',
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.escrowHold.deleteMany({ where: { id: { in: holdIds } } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.user.deleteMany({ where: { id: buyerId } });
  await prisma.$disconnect();
});

describe('getEscrowSummary', () => {
  it('reports held total / state / age-bucket deltas around a known set', async () => {
    const before = await getEscrowSummary(prisma, { now: NOW });

    // Held: 100 (HELD, 0.5d) + 200 (HELD_DISPUTED, 2d) + 50 (RELEASING, 10d) = 350 / 3 holds
    await makeHold({ amount: 100, state: 'HELD', ageDays: 0.5 });
    await makeHold({ amount: 200, state: 'HELD_DISPUTED', ageDays: 2 });
    await makeHold({ amount: 50, state: 'RELEASING', ageDays: 10 });
    // Not held (RELEASED / REFUNDED) — excluded from the ledger entirely
    await makeHold({ amount: 999, state: 'RELEASED', ageDays: 1 });
    await makeHold({ amount: 999, state: 'REFUNDED', ageDays: 1 });

    const after = await getEscrowSummary(prisma, { now: NOW });

    // toBeCloseTo for money deltas — Number(Decimal) sums carry float dust.
    expect(after.totalHeld - before.totalHeld).toBeCloseTo(350); // 100+200+50, not released/refunded
    expect(after.heldCount - before.heldCount).toBe(3);

    const stateDelta = (state: string) => {
      const a = after.byState.find((r) => r.state === state)?.amount ?? 0;
      const b = before.byState.find((r) => r.state === state)?.amount ?? 0;
      return a - b;
    };
    expect(stateDelta('HELD')).toBeCloseTo(100);
    expect(stateDelta('HELD_DISPUTED')).toBeCloseTo(200);
    expect(stateDelta('RELEASING')).toBeCloseTo(50);

    const ageDelta = (bucket: string) => {
      const a = after.byAge.find((r) => r.bucket === bucket)?.amount ?? 0;
      const b = before.byAge.find((r) => r.bucket === bucket)?.amount ?? 0;
      return a - b;
    };
    expect(ageDelta('< 1 day')).toBeCloseTo(100); // the 0.5d hold
    expect(ageDelta('1–3 days')).toBeCloseTo(200); // the 2d hold
    expect(ageDelta('> 7 days')).toBeCloseTo(50); // the 10d hold
    expect(ageDelta('3–7 days')).toBeCloseTo(0);
  });

  it('age buckets sum to the held total', async () => {
    const s = await getEscrowSummary(prisma, { now: NOW });
    const ageSum = s.byAge.reduce((a, r) => a + r.amount, 0);
    expect(ageSum).toBeCloseTo(s.totalHeld);
  });
});
