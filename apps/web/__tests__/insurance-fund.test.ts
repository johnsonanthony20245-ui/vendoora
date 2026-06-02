/**
 * Platform insurance fund (packages/domain/src/insurance.ts: payInsuranceClaim).
 *
 * Engineering_Spec §7.5: a configurable fund refunds the buyer when T&S resolves a
 * dispute as INSURANCE_PAYOUT (in-transit damage / lost package, no party at fault).
 * The debit is transactional and guarded by the §7.5 caps: per-incident ($500),
 * per-buyer-per-year ($2,000), per-seller-per-year (10 incidents), and the fund
 * balance itself (no overdraw). Every paid claim writes an InsurancePayout ledger row
 * + an audit row.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { payInsuranceClaim } = await import('@vendoora/domain');

const BALANCE_KEY = 'insurance_fund.balance';
const CAP_KEYS = {
  perIncident: 'insurance_fund.max_per_incident',
  buyerYear: 'insurance_fund.max_per_buyer_year',
  sellerYearIncidents: 'insurance_fund.max_per_seller_year_incidents',
} as const;

// Unique per run so the per-buyer / per-seller annual aggregates are hermetic.
const BUYER = `ins-buyer-${randomUUID()}`;
const SELLER = `ins-seller-${randomUUID()}`;

async function setConfig(key: string, value: number | string): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: 'insurance' },
  });
}

// The balance is the money-of-record — stored as a fixed-2dp string in production.
async function setBalance(v: number): Promise<void> {
  await setConfig(BALANCE_KEY, v.toFixed(2));
}

async function getBalance(): Promise<number> {
  const row = await prisma.platformConfig.findUnique({ where: { key: BALANCE_KEY } });
  return Number(row?.value ?? 0);
}

function claimArgs(over: Partial<Parameters<typeof payInsuranceClaim>[1]> = {}) {
  return {
    orderId: `ins-ord-${randomUUID()}`,
    buyerUserId: BUYER,
    sellerUserId: SELLER,
    amount: 100,
    ...over,
  };
}

beforeEach(async () => {
  await setConfig(CAP_KEYS.perIncident, 500);
  await setConfig(CAP_KEYS.buyerYear, 2000);
  await setConfig(CAP_KEYS.sellerYearIncidents, 10);
  await prisma.insurancePayout.deleteMany({
    where: { OR: [{ buyer_user_id: BUYER }, { seller_user_id: SELLER }] },
  });
  await setBalance(5000);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('payInsuranceClaim — happy path', () => {
  it('debits the fund, writes a ledger row and an audit row', async () => {
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 100, disputeId: 'd1' }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balanceAfter).toBe(4900);
    expect(await getBalance()).toBe(4900);

    const payout = await prisma.insurancePayout.findUnique({ where: { id: result.payoutId } });
    expect(payout).not.toBeNull();
    expect(Number(payout?.amount)).toBe(100);
    expect(Number(payout?.balance_after)).toBe(4900);
    expect(payout?.buyer_user_id).toBe(BUYER);

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'insurance.payout', resource_id: result.payoutId },
    });
    expect(audit).not.toBeNull();
  });
});

describe('payInsuranceClaim — guards (no debit on rejection)', () => {
  it('rejects a non-positive amount', async () => {
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 0 }));
    expect(result).toEqual({ ok: false, reason: 'invalid_amount' });
    expect(await getBalance()).toBe(5000);
  });

  it('rejects an amount over the per-incident cap', async () => {
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 600 }));
    expect(result).toEqual({ ok: false, reason: 'over_per_incident_cap' });
    expect(await getBalance()).toBe(5000);
  });

  it('rejects when the fund cannot cover the claim', async () => {
    await setBalance(50);
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 100 }));
    expect(result).toEqual({ ok: false, reason: 'insufficient_fund' });
    expect(await getBalance()).toBe(50);
  });

  it('rejects when the buyer would exceed their annual cap', async () => {
    // Prior payouts this year summing to 1950 for this buyer.
    await prisma.insurancePayout.create({
      data: {
        order_id: `ins-ord-${randomUUID()}`,
        buyer_user_id: BUYER,
        amount: 1950,
        currency: 'USD',
        balance_after: 3050,
      },
    });
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 100, sellerUserId: null }));
    expect(result).toEqual({ ok: false, reason: 'over_buyer_year_cap' });
    expect(await getBalance()).toBe(5000);
  });

  it('rejects an 11th incident for the same seller in a year', async () => {
    for (let i = 0; i < 10; i++) {
      await prisma.insurancePayout.create({
        data: {
          order_id: `ins-ord-${randomUUID()}`,
          buyer_user_id: `ins-other-buyer-${i}-${randomUUID()}`,
          seller_user_id: SELLER,
          amount: 10,
          currency: 'USD',
          balance_after: 5000,
        },
      });
    }
    const result = await payInsuranceClaim(prisma, claimArgs({ amount: 50 }));
    expect(result).toEqual({ ok: false, reason: 'over_seller_year_limit' });
    expect(await getBalance()).toBe(5000);
  });
});

describe('payInsuranceClaim — concurrency', () => {
  it('serializes parallel claims so the fund is never overdrawn', async () => {
    // Five $100 claims race against a $250 fund: the FOR UPDATE lock must let
    // exactly two through (the rest see insufficient_fund) and the balance must
    // land at $50 — never negative. Without serialization, several would read the
    // same starting balance and overdraw.
    await setBalance(250);
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        payInsuranceClaim(prisma, claimArgs({ amount: 100, sellerUserId: null })),
      ),
    );
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(2);
    expect(await getBalance()).toBe(50);
  });
});
