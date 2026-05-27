/**
 * Tests for the createDispute server action.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

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

const { prisma } = await import('@vendoora/db');
const { createDispute } = await import('../app/actions/dispute');

let testBuyerId = '';

beforeAll(async () => {
  // Pick a seeded product to attach to a fake test order
  const product = await prisma.product.findFirst({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    include: { seller: true },
  });
  if (!product) throw new Error('No published products in test DB. Run `pnpm db:seed`.');

  testBuyerId = (
    await prisma.user.upsert({
      where: { email: 'dispute_test_buyer@vendoora.test' },
      update: {},
      create: {
        clerk_id: `dispute_test_${Date.now()}`,
        email: 'dispute_test_buyer@vendoora.test',
        full_name: 'Dispute Test Buyer',
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    })
  ).id;
});

async function createFreshTestOrder(initialStatus: 'PAID' | 'DELIVERED' | 'CANCELLED' = 'DELIVERED'): Promise<{ orderNumber: string; orderId: string }> {
  const product = await prisma.product.findFirst({
    where: { status: 'PUBLISHED', moderation_status: 'APPROVED' },
    include: { seller: true },
  });
  if (!product) throw new Error('No product');

  const orderNumber = `VDR-DISPUTE-TEST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const order = await prisma.order.create({
    data: {
      order_number: orderNumber,
      buyer_user_id: testBuyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Dispute Test Buyer',
      buyer_email: 'dispute_test_buyer@vendoora.test',
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: Number(product.base_price),
      total_amount: Number(product.base_price),
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: initialStatus,
      paid_at: new Date(),
      delivery_code_hash: '$2a$10$placeholderhashforTestonly00000000000',
    },
  });

  // One escrow hold in HELD state so we can verify the HELD → HELD_DISPUTED transition
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

  return { orderNumber, orderId: order.id };
}

async function cleanupTestOrder(orderId: string) {
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

describe('createDispute', () => {
  it('creates a Dispute with status OPEN and 48h SLA on a DELIVERED order', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'COUNTERFEIT');
      fd.set('description', 'The Vlisco label looks photocopied and the texture is wrong.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__:\/disputes\/VDR-DIS-/);

      const dispute = await prisma.dispute.findFirst({ where: { order_id: orderId } });
      expect(dispute).not.toBeNull();
      if (!dispute) throw new Error();

      expect(dispute.status).toBe('OPEN');
      expect(dispute.category).toBe('COUNTERFEIT');
      expect(dispute.reason).toBe('BUYER_INITIATED');
      expect(dispute.sla_breached).toBe(false);

      const slaMs = dispute.sla_due_at.getTime() - Date.now();
      const slaHours = slaMs / (60 * 60 * 1000);
      expect(slaHours).toBeGreaterThan(47);
      expect(slaHours).toBeLessThanOrEqual(48.1);
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('transitions all HELD escrow holds to HELD_DISPUTED and writes EscrowStateTransition rows', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'NOT_RECEIVED');
      fd.set('description', 'The package never arrived. The driver said they delivered it but my gate is closed all day.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);

      const holds = await prisma.escrowHold.findMany({ where: { order_id: orderId } });
      for (const hold of holds) {
        expect(hold.state).toBe('HELD_DISPUTED');
        expect(hold.dispute_id).not.toBeNull();
      }

      const transitions = await prisma.escrowStateTransition.findMany({
        where: { escrow_hold: { order_id: orderId } },
      });
      const dispute_transitions = transitions.filter((t) => t.reason === 'dispute_opened');
      expect(dispute_transitions.length).toBeGreaterThanOrEqual(1);
      for (const t of dispute_transitions) {
        expect(t.from_state).toBe('HELD');
        expect(t.to_state).toBe('HELD_DISPUTED');
      }
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('transitions Order.status to DISPUTED and writes OrderStatusHistory', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'DAMAGED');
      fd.set('description', 'The box was crushed and the contents are broken.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe('DISPUTED');

      const history = await prisma.orderStatusHistory.findMany({
        where: { order_id: orderId, reason: 'dispute_opened' },
      });
      expect(history.length).toBe(1);
      expect(history[0]?.from_status).toBe('DELIVERED');
      expect(history[0]?.to_status).toBe('DISPUTED');
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('writes an audit_log entry with the correct action + resource', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'OTHER');
      fd.set('description', 'A long-enough description for the dispute to pass validation.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);

      const dispute = await prisma.dispute.findFirst({ where: { order_id: orderId } });
      if (!dispute) throw new Error();

      const audits = await prisma.auditLog.findMany({
        where: { resource_id: dispute.id, action: 'dispute.opened' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]?.resource_type).toBe('dispute');
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('creates an initial DisputeMessage from the buyer', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'WRONG_ITEM');
      fd.set('description', 'I ordered the 6-yard fabric but received only 3 yards.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);

      const dispute = await prisma.dispute.findFirst({ where: { order_id: orderId } });
      if (!dispute) throw new Error();

      const messages = await prisma.disputeMessage.findMany({ where: { dispute_id: dispute.id } });
      expect(messages).toHaveLength(1);
      expect(messages[0]?.author_type).toBe('BUYER');
      expect(messages[0]?.is_internal).toBe(false);
      expect(messages[0]?.body).toContain('6-yard fabric');
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('refuses to open dispute on a CANCELLED order (redirect with ?error=)', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('CANCELLED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'OTHER');
      fd.set('description', 'Trying to dispute a cancelled order — should fail.');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);
      expect(redirectCalls[0]).toMatch(/\/orders\/.*\/dispute\?error=/);

      const dispute = await prisma.dispute.findFirst({ where: { order_id: orderId } });
      expect(dispute).toBeNull();
    } finally {
      await cleanupTestOrder(orderId);
    }
  });

  it('refuses short description with a validation error', async () => {
    const { orderNumber, orderId } = await createFreshTestOrder('DELIVERED');
    try {
      const fd = new FormData();
      fd.set('orderNumber', orderNumber);
      fd.set('category', 'OTHER');
      fd.set('description', 'too short');

      await expect(createDispute(fd)).rejects.toThrow(/__redirect__/);
      // encodeURIComponent encodes spaces as %20, so the validation
      // message "...20 characters..." renders as "...20%20characters..."
      expect(redirectCalls[0]).toMatch(/error=.*20%20characters/);

      const dispute = await prisma.dispute.findFirst({ where: { order_id: orderId } });
      expect(dispute).toBeNull();
    } finally {
      await cleanupTestOrder(orderId);
    }
  });
});
