/**
 * Tests for the resolveDispute admin action.
 *
 * The fixture creates a fresh order + HELD escrow hold + opens a dispute on
 * it (the createDispute path transitions HELD -> HELD_DISPUTED), then resolves
 * with each of the four resolution paths and verifies:
 *  - Dispute.status, Dispute.resolution, Dispute.resolved_at/by all set
 *  - EscrowHold.state lands at the expected terminal state
 *  - Order.status lands at the expected terminal state
 *  - AuditLog row written with action='dispute.resolved'
 *
 * The admin gate is bypassed by setting the dev cookie via the mock — the
 * real Clerk-gated path is unit-tested where the gate itself lives.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import type * as AdminModule from '../lib/admin';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const redirectCalls: string[] = [];
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    redirectCalls.push(url);
    throw new Error(`__redirect__:${url}`);
  },
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Force the admin gate to allow as a "dev" session for these tests. The gate
// itself reads cookies()/clerk; we mock the higher-level helper.
vi.mock('../lib/admin', async () => {
  const real = await vi.importActual<typeof AdminModule>('../lib/admin');
  return {
    ...real,
    getAdminSession: async () => ({ kind: 'dev', clerk_user_id: null }),
  };
});

const { prisma } = await import('@vendoora/db');
const { createDispute } = await import('../app/actions/dispute');
const { resolveDispute } = await import('../app/actions/admin-dispute');

let testBuyerId = '';

beforeAll(async () => {
  const product = await prisma.product.findFirst({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    include: { seller: true },
  });
  if (!product) throw new Error('No published products in test DB. Run `pnpm db:seed`.');

  testBuyerId = (
    await prisma.user.upsert({
      where: { email: 'admin_dispute_test_buyer@vendoora.test' },
      update: {},
      create: {
        clerk_id: `admin_dispute_test_${Date.now()}`,
        email: 'admin_dispute_test_buyer@vendoora.test',
        full_name: 'Admin Dispute Test Buyer',
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    })
  ).id;
});

async function createOpenDispute(): Promise<{ disputeNumber: string; orderId: string }> {
  const product = await prisma.product.findFirst({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    include: { seller: true },
  });
  if (!product) throw new Error('No product');

  const orderNumber = `VDR-ADMIN-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const order = await prisma.order.create({
    data: {
      order_number: orderNumber,
      buyer_user_id: testBuyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Admin Dispute Test',
      buyer_email: 'admin_dispute_test_buyer@vendoora.test',
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: Number(product.base_price),
      total_amount: Number(product.base_price),
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: 'DELIVERED',
      paid_at: new Date(),
      delivery_code_hash: '$2a$10$placeholderhashforTestonly00000000000',
    },
  });
  await prisma.escrowHold.create({
    data: {
      order_id: order.id,
      beneficiary_type: 'SELLER',
      beneficiary_seller_id: product.seller_id,
      amount: Number(product.base_price) * 0.88,
      currency: 'USD',
      state: 'HELD',
    },
  });

  // Open the dispute via the real action so HELD -> HELD_DISPUTED is real.
  const fd = new FormData();
  fd.set('orderNumber', orderNumber);
  fd.set('category', 'WRONG_ITEM');
  fd.set('description', 'Received completely the wrong product, not the one ordered at all.');
  await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);

  const dispute = await prisma.dispute.findFirst({ where: { order_id: order.id } });
  if (!dispute) throw new Error('createDispute did not create dispute');
  return { disputeNumber: dispute.dispute_number, orderId: order.id };
}

const FUND_KEY = 'insurance_fund.balance';
async function setFundBalance(v: number): Promise<void> {
  await prisma.platformConfig.upsert({
    where: { key: FUND_KEY },
    update: { value: v.toFixed(2) },
    create: { key: FUND_KEY, value: v.toFixed(2), category: 'insurance' },
  });
}
async function getFundBalance(): Promise<number> {
  const row = await prisma.platformConfig.findUnique({ where: { key: FUND_KEY } });
  return Number(row?.value ?? 0);
}

async function cleanup(orderId: string) {
  await prisma.insurancePayout.deleteMany({ where: { order_id: orderId } });
  await prisma.disputeMessage.deleteMany({
    where: { dispute: { order_id: orderId } },
  });
  await prisma.escrowStateTransition.deleteMany({
    where: { escrow_hold: { order_id: orderId } },
  });
  await prisma.dispute.deleteMany({ where: { order_id: orderId } });
  await prisma.escrowHold.deleteMany({ where: { order_id: orderId } });
  await prisma.orderStatusHistory.deleteMany({ where: { order_id: orderId } });
  await prisma.order.delete({ where: { id: orderId } });
}

beforeEach(() => {
  redirectCalls.length = 0;
});
afterEach(() => {
  vi.clearAllMocks();
});

describe('resolveDispute', () => {
  it('FULL_REFUND_TO_BUYER: escrow -> REFUNDED, dispute -> RESOLVED_FAVOR_BUYER, order -> REFUNDED', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'FULL_REFUND_TO_BUYER');
      fd.set('resolutionNotes', 'Buyer photos clearly show wrong product. Refund.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__:.*resolved=1/);

      const d = await prisma.dispute.findUnique({ where: { dispute_number: disputeNumber } });
      expect(d?.status).toBe('RESOLVED_FAVOR_BUYER');
      expect(d?.resolution).toBe('FULL_REFUND_TO_BUYER');
      expect(d?.resolved_at).not.toBeNull();
      expect(d?.resolution_notes).toMatch(/wrong product/);

      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const h of holds) expect(h.state).toBe('REFUNDED');

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe('REFUNDED');
    } finally {
      await cleanup(orderId);
    }
  });

  it('RELEASE_TO_SELLER: escrow -> RELEASED, dispute -> RESOLVED_FAVOR_SELLER, order -> COMPLETED', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'RELEASE_TO_SELLER');
      fd.set('resolutionNotes', 'Evidence shows package delivered correctly and matches listing.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__/);

      const d = await prisma.dispute.findUnique({ where: { dispute_number: disputeNumber } });
      expect(d?.status).toBe('RESOLVED_FAVOR_SELLER');
      expect(d?.resolution).toBe('RELEASE_TO_SELLER');

      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const h of holds) expect(h.state).toBe('RELEASED');

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe('COMPLETED');
    } finally {
      await cleanup(orderId);
    }
  });

  it('PARTIAL_REFUND_TO_BUYER: escrow -> PARTIALLY_REFUNDED with amount, dispute -> RESOLVED_PARTIAL', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'PARTIAL_REFUND_TO_BUYER');
      fd.set('partialAmount', '12.50');
      fd.set('resolutionNotes', 'Item received but damaged; partial refund agreed with seller.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__/);

      const d = await prisma.dispute.findUnique({ where: { dispute_number: disputeNumber } });
      expect(d?.status).toBe('RESOLVED_PARTIAL');
      expect(d?.resolution).toBe('PARTIAL_REFUND_TO_BUYER');
      expect(Number(d?.resolution_amount)).toBeCloseTo(12.5);

      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const h of holds) {
        expect(h.state).toBe('PARTIALLY_REFUNDED');
        expect(Number(h.refunded_amount)).toBeCloseTo(12.5);
      }

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe('REFUNDED');
    } finally {
      await cleanup(orderId);
    }
  });

  it('INSURANCE_PAYOUT: escrow -> INSURANCE_PAYOUT, dispute -> RESOLVED_INSURANCE, fund debited', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      await setFundBalance(1000);
      const order0 = await prisma.order.findUnique({
        where: { id: orderId },
        select: { total_amount: true },
      });
      const claimAmount = Number(order0?.total_amount);

      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'INSURANCE_PAYOUT');
      fd.set('resolutionNotes', 'Lost in transit, no fault; insurance fund covers the buyer refund.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__:.*resolved=1/);

      const d = await prisma.dispute.findUnique({ where: { dispute_number: disputeNumber } });
      expect(d?.status).toBe('RESOLVED_INSURANCE');

      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const h of holds) expect(h.state).toBe('INSURANCE_PAYOUT');

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe('REFUNDED');

      // The fund refunded the buyer: a ledger row + the balance debited by the order total.
      const payout = await prisma.insurancePayout.findFirst({ where: { order_id: orderId } });
      expect(payout).not.toBeNull();
      expect(Number(payout?.amount)).toBe(claimAmount);
      expect(payout?.buyer_user_id).toBe(testBuyerId);
      expect(await getFundBalance()).toBe(1000 - claimAmount);
    } finally {
      await cleanup(orderId);
    }
  });

  it('INSURANCE_PAYOUT aborts and rolls back when the fund cannot cover the claim', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      await setFundBalance(1); // far below the order total

      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'INSURANCE_PAYOUT');
      fd.set('resolutionNotes', 'Attempted insurance payout the fund cannot currently honour.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__/);

      // Error redirect, not success.
      const last = redirectCalls[redirectCalls.length - 1] ?? '';
      expect(last).toMatch(/error=/);
      expect(last).not.toMatch(/resolved=1/);

      // The whole resolution rolled back: holds still disputed, no payout, balance intact.
      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const h of holds) expect(h.state).toBe('HELD_DISPUTED');
      const payout = await prisma.insurancePayout.findFirst({ where: { order_id: orderId } });
      expect(payout).toBeNull();
      expect(await getFundBalance()).toBe(1);
    } finally {
      await cleanup(orderId);
    }
  });

  it('refuses already-resolved disputes', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      // First resolve
      const fd1 = new FormData();
      fd1.set('disputeNumber', disputeNumber);
      fd1.set('resolution', 'FULL_REFUND_TO_BUYER');
      fd1.set('resolutionNotes', 'First resolution applied to test idempotency rejection.');
      await expect(resolveDispute(fd1)).rejects.toThrow(/__redirect__/);

      // Second attempt — should refuse
      const fd2 = new FormData();
      fd2.set('disputeNumber', disputeNumber);
      fd2.set('resolution', 'RELEASE_TO_SELLER');
      fd2.set('resolutionNotes', 'Trying to reopen a resolved dispute, should fail.');
      await expect(resolveDispute(fd2)).rejects.toThrow(/__redirect__/);

      // The last redirect should be an error redirect, not /resolved=1
      const last = redirectCalls[redirectCalls.length - 1] ?? '';
      expect(last).toMatch(/error=/);
      expect(last).not.toMatch(/resolved=1/);
    } finally {
      await cleanup(orderId);
    }
  });

  it('writes a dispute.resolved AuditLog row', async () => {
    const { disputeNumber, orderId } = await createOpenDispute();
    try {
      const fd = new FormData();
      fd.set('disputeNumber', disputeNumber);
      fd.set('resolution', 'RELEASE_TO_SELLER');
      fd.set('resolutionNotes', 'Seller evidence consistent with delivery photos; release.');
      await expect(resolveDispute(fd)).rejects.toThrow(/__redirect__/);

      const dispute = await prisma.dispute.findUnique({ where: { dispute_number: disputeNumber } });
      if (!dispute) throw new Error('dispute missing');
      const audit = await prisma.auditLog.findFirst({
        where: { resource_id: dispute.id, action: 'dispute.resolved' },
      });
      expect(audit).not.toBeNull();
      expect(audit?.actor_system).toBe(true); // dev session has no clerk id, mapped to system
    } finally {
      await cleanup(orderId);
    }
  });
});
