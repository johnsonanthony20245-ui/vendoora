/**
 * Insurance fund nightly top-up (packages/domain/src/insurance.ts:
 * accrueInsuranceTopUp). Engineering_Spec §7.5: "Top-up source: 0.5% of every
 * order's commission allocated to insurance fund, automated nightly."
 *
 * The accrual is windowed: each run adds `topup_rate` × the commission of orders
 * paid since the previous run (insurance_fund.last_topup_at), then advances the
 * marker. Doing it as a windowed batch (vs per-order) avoids serializing every
 * order finalization on the single fund-balance row.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { accrueInsuranceTopUp } = await import('@vendoora/domain');

const BALANCE_KEY = 'insurance_fund.balance';
const RATE_KEY = 'insurance_fund.topup_rate';
const LAST_KEY = 'insurance_fund.last_topup_at';

const TAG = `topup-${randomUUID()}`;
let productId = '';
let sellerId = '';
let buyerId = '';

beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { seller: { business_slug: 'konah-boutique' } },
    select: { id: true, seller_id: true },
  });
  if (!product) throw new Error('Need konah-boutique products in test DB. Run pnpm db:seed.');
  productId = product.id;
  sellerId = product.seller_id;
  buyerId = (
    await prisma.user.create({
      data: {
        clerk_id: `guest_${TAG}`,
        email: `${TAG}@vendoora.test`,
        full_name: 'Top-up Buyer',
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    })
  ).id;
});

async function setConfig(key: string, value: number | string): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value, category: 'insurance' },
  });
}
async function getBalance(): Promise<number> {
  const row = await prisma.platformConfig.findUnique({ where: { key: BALANCE_KEY } });
  return Number(row?.value ?? 0);
}

/** A PAID order with one item of the given commission, paid at `paidAt`. */
async function makePaidOrder(commission: number, paidAt: Date): Promise<void> {
  const order = await prisma.order.create({
    data: {
      order_number: `VDR-TOPUP-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Top-up',
      buyer_email: `${TAG}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: 100,
      total_amount: 103,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: 'PAID',
      paid_at: paidAt,
    },
  });
  await prisma.orderItem.create({
    data: {
      order_id: order.id,
      product_id: productId,
      variant_id: null,
      seller_id: sellerId,
      product_snapshot: { name: 'Top-up Item' },
      quantity: 1,
      unit_price: 100,
      subtotal: 100,
      commission_rate: 0.12,
      commission_amount: commission,
      seller_net: 100 - commission,
    },
  });
}

// Delete ALL top-up test orders (any prior run), not just this run's buyer: the
// accrual sums commission globally over the window, so a prior run's orders at the
// same fixed dates would otherwise double-count. The synthetic 2026-01/02/03/04
// windows are dates no other suite backdates a paid order to, so they're clean.
async function purgeTopUpOrders(): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { order_number: { startsWith: 'VDR-TOPUP-' } },
    select: { id: true },
  });
  for (const o of orders) {
    await prisma.orderItem.deleteMany({ where: { order_id: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
}

beforeEach(async () => {
  await purgeTopUpOrders();
  await setConfig(RATE_KEY, 0.005);
  await setConfig(BALANCE_KEY, '1000.00');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('accrueInsuranceTopUp', () => {
  it('adds 0.5% of in-window commission to the fund and advances last_topup_at', async () => {
    // A clean historical window so only this test's fixtures fall inside it.
    const t0 = new Date('2026-01-01T00:00:00.000Z');
    const now = new Date('2026-02-01T00:00:00.000Z');
    await setConfig(LAST_KEY, t0.toISOString());

    await makePaidOrder(200, new Date('2026-01-10T00:00:00.000Z')); // in window
    await makePaidOrder(300, new Date('2026-01-20T00:00:00.000Z')); // in window
    await makePaidOrder(1000, new Date('2025-12-01T00:00:00.000Z')); // before window — excluded

    const result = await accrueInsuranceTopUp(prisma, { now });

    expect(result.commissionTotal).toBe(500); // 200 + 300
    expect(result.contribution).toBe(2.5); // 0.5% of 500
    expect(result.balanceAfter).toBe(1002.5);
    expect(await getBalance()).toBe(1002.5);

    const last = await prisma.platformConfig.findUnique({ where: { key: LAST_KEY } });
    expect(new Date(String(last?.value)).toISOString()).toBe(now.toISOString());

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'insurance.fund.topup' },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).not.toBeNull();
  });

  it('is a no-op when no commission was earned in the window', async () => {
    const t0 = new Date('2026-03-01T00:00:00.000Z');
    const now = new Date('2026-04-01T00:00:00.000Z');
    await setConfig(LAST_KEY, t0.toISOString());
    // The only order is before the window.
    await makePaidOrder(500, new Date('2026-02-01T00:00:00.000Z'));

    const result = await accrueInsuranceTopUp(prisma, { now });

    expect(result.commissionTotal).toBe(0);
    expect(result.contribution).toBe(0);
    expect(await getBalance()).toBe(1000);
  });
});
