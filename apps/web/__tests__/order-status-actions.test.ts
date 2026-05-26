/**
 * Tests for the dev-only advanceOrderStatus server action.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { prisma } = await import('@vendoora/db');
const { advanceOrderStatus } = await import('../app/actions/order-status');
const { nextHappyStatus } = await import('../lib/order-stage');

let testOrderId = '';
let testOrderNumber = '';

beforeAll(async () => {
  // NODE_ENV is read-only in TS's narrowed type but assignable at runtime.
  // We need the action's guard to NOT trigger (it throws in production).
  // Vitest already sets NODE_ENV='test'; just defensively ensure it's not 'production'.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run order-status tests under NODE_ENV=production');
  }
});

beforeEach(async () => {
  // Create a fresh test Order in PAID state for each test.
  const buyer = await prisma.user.findFirst({ orderBy: { created_at: 'asc' } });
  if (!buyer) throw new Error('No users in test DB');

  testOrderNumber = `VDR-TST-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const order = await prisma.order.create({
    data: {
      order_number: testOrderNumber,
      buyer_user_id: buyer.id,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Test Buyer',
      buyer_email: `test-${Date.now()}@vendoora.test`,
      delivery_address: { street: '1' },
      delivery_city: 'Monrovia',
      delivery_country: 'LR',
      delivery_zone: 'sinkor',
      subtotal: 10,
      total_amount: 10,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      status: 'PAID',
      paid_at: new Date(),
    },
  });
  testOrderId = order.id;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('advanceOrderStatus', () => {
  it('moves PAID → ACCEPTED and writes a history row', async () => {
    const fd = new FormData();
    fd.set('orderNumber', testOrderNumber);
    await advanceOrderStatus(fd);

    const order = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(order?.status).toBe('ACCEPTED');

    const history = await prisma.orderStatusHistory.findMany({
      where: { order_id: testOrderId },
      orderBy: { changed_at: 'desc' },
    });
    expect(history[0]?.from_status).toBe('PAID');
    expect(history[0]?.to_status).toBe('ACCEPTED');
  });

  it('writes an audit_log entry on each advance', async () => {
    const fd = new FormData();
    fd.set('orderNumber', testOrderNumber);
    await advanceOrderStatus(fd);

    const audits = await prisma.auditLog.findMany({
      where: { resource_id: testOrderId, action: 'order.status.advanced' },
    });
    expect(audits.length).toBeGreaterThanOrEqual(1);
  });

  it('walks the full happy path PAID → COMPLETED in 8 advances', async () => {
    const expected = [
      'ACCEPTED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'PICKED_UP',
      'OUT_FOR_DELIVERY',
      'ARRIVED',
      'DELIVERED',
      'COMPLETED',
    ];

    for (const want of expected) {
      const fd = new FormData();
      fd.set('orderNumber', testOrderNumber);
      await advanceOrderStatus(fd);

      const order = await prisma.order.findUnique({ where: { id: testOrderId } });
      expect(order?.status).toBe(want);
    }
  });

  it('is a no-op when already at COMPLETED', async () => {
    // First walk all the way to COMPLETED.
    while (true) {
      const o = await prisma.order.findUnique({ where: { id: testOrderId } });
      if (!o || o.status === 'COMPLETED') break;
      const fd = new FormData();
      fd.set('orderNumber', testOrderNumber);
      await advanceOrderStatus(fd);
    }

    const historyBefore = await prisma.orderStatusHistory.count({
      where: { order_id: testOrderId },
    });

    // Try to advance again — should no-op
    const fd = new FormData();
    fd.set('orderNumber', testOrderNumber);
    await advanceOrderStatus(fd);

    const historyAfter = await prisma.orderStatusHistory.count({
      where: { order_id: testOrderId },
    });
    expect(historyAfter).toBe(historyBefore);

    const order = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(order?.status).toBe('COMPLETED');
  });

  it('nextHappyStatus mapping is correct', () => {
    expect(nextHappyStatus('PAID')).toBe('ACCEPTED');
    expect(nextHappyStatus('ARRIVED')).toBe('DELIVERED');
    expect(nextHappyStatus('COMPLETED')).toBeNull();
    expect(nextHappyStatus('CANCELLED')).toBeNull();
    expect(nextHappyStatus('DISPUTED')).toBeNull();
  });

  it('sets delivered_at on the DELIVERED transition', async () => {
    // Walk to DELIVERED
    while (true) {
      const o = await prisma.order.findUnique({ where: { id: testOrderId } });
      if (!o || o.status === 'DELIVERED') break;
      const fd = new FormData();
      fd.set('orderNumber', testOrderNumber);
      await advanceOrderStatus(fd);
    }
    const order = await prisma.order.findUnique({ where: { id: testOrderId } });
    expect(order?.status).toBe('DELIVERED');
    expect(order?.delivered_at).not.toBeNull();
  });
});
