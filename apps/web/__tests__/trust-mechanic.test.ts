/**
 * Flagship trust-mechanic test (Build_Fidelity_Directive §2.4 + §3.2).
 *
 * Proves the real delivery-code → escrow path against a real database:
 *   payment HELD in escrow
 *   → wrong code rejected (escrow untouched, attempts increment, lockout at 3)
 *   → correct code accepted (order DELIVERED, release clock started, escrow still HELD)
 *   → 24h dispute window passes → escrow HELD → RELEASING (auto-release eligibility)
 *   → a disputed hold is NOT released.
 *
 * This test CANNOT pass against a stub: a stubbed verifier that returned true
 * would fail the wrong-code + lockout assertions, and a release that ignored the
 * dispute window would fail the "no-op before window" assertion.
 *
 * RELEASING → RELEASED is intentionally NOT exercised: per Engineering_Spec
 * §6.3 that transition is driven by a real payout-provider webhook, which is a
 * §5 credential-blocked boundary (Stripe / MTN MoMo / Orange Money).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { generateDeliveryCode } = await import('../lib/delivery-code');
const { confirmDeliveryByCode, releaseEligibleEscrowForOrder } = await import('../lib/escrow');

const BUYER_EMAIL = 'trust_test_buyer@vendoora.test';
const HOUR = 3600 * 1000;

let sellerId = '';
let buyerId = '';

beforeAll(async () => {
  const seller = await prisma.seller.findUnique({
    where: { business_slug: 'konah-boutique' },
    select: { id: true },
  });
  if (!seller) throw new Error('Need konah-boutique seller in test DB. Run pnpm db:seed.');
  sellerId = seller.id;

  buyerId = (
    await prisma.user.upsert({
      where: { email: BUYER_EMAIL },
      update: {},
      create: {
        clerk_id: `trust_test_${Date.now()}`,
        email: BUYER_EMAIL,
        full_name: 'Trust Test Buyer',
        account_status: 'ACTIVE',
      },
      select: { id: true },
    })
  ).id;
});

beforeEach(async () => {
  const orders = await prisma.order.findMany({ where: { buyer_user_id: buyerId } });
  for (const o of orders) {
    await prisma.escrowStateTransition.deleteMany({ where: { escrow_hold: { order_id: o.id } } });
    await prisma.escrowHold.deleteMany({ where: { order_id: o.id } });
    await prisma.orderStatusHistory.deleteMany({ where: { order_id: o.id } });
    await prisma.order.delete({ where: { id: o.id } });
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

type OrderStatus = 'PAID' | 'OUT_FOR_DELIVERY' | 'ARRIVED' | 'DELIVERED';

/** Create a minimal real order + one escrow hold for the trust-mechanic path. */
async function makeOrder(opts: {
  codeHash: string;
  status?: OrderStatus;
  expiresAt?: Date;
  attempts?: number;
  holdState?: 'HELD' | 'HELD_DISPUTED';
  scheduledReleaseAt?: Date | null;
}) {
  const now = new Date();
  const order = await prisma.order.create({
    data: {
      order_number: `VDR-TM${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      buyer_user_id: buyerId,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Trust Test Buyer',
      buyer_email: BUYER_EMAIL,
      delivery_address: { street: '1 Test St', city: 'Monrovia', country: 'LR' },
      delivery_city: 'Monrovia',
      delivery_zone: 'sinkor',
      delivery_country: 'LR',
      subtotal: 50,
      shipping_fee: 3,
      total_amount: 53,
      currency: 'USD',
      payment_method: 'MTN_MOMO',
      payment_status: 'CAPTURED',
      paid_at: now,
      status: opts.status ?? 'OUT_FOR_DELIVERY',
      delivery_code_hash: opts.codeHash,
      delivery_code_sent_at: now,
      delivery_code_expires_at: opts.expiresAt ?? new Date(now.getTime() + 72 * HOUR),
      delivery_attempts: opts.attempts ?? 0,
    },
    select: { id: true, order_number: true },
  });

  const hold = await prisma.escrowHold.create({
    data: {
      order_id: order.id,
      beneficiary_type: 'SELLER',
      beneficiary_seller_id: sellerId,
      amount: 44,
      currency: 'USD',
      state: opts.holdState ?? 'HELD',
      scheduled_release_at: opts.scheduledReleaseAt ?? null,
    },
    select: { id: true },
  });

  return { orderId: order.id, orderNumber: order.order_number, holdId: hold.id };
}

describe('confirmDeliveryByCode', () => {
  it('rejects a wrong code, increments attempts, and leaves order + escrow untouched', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const wrong = plaintext === '000000' ? '111111' : '000000';
    const { orderId, holdId } = await makeOrder({ codeHash: hash });

    const res = await confirmDeliveryByCode(prisma, { orderId, code: wrong });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('wrong_code');
      expect(res.attemptsRemaining).toBe(2);
    }
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('OUT_FOR_DELIVERY');
    expect(order?.delivery_attempts).toBe(1);
    expect(order?.delivered_at).toBeNull();
    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('HELD');
  });

  it('locks out after 3 wrong attempts; a correct code afterwards is refused', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const wrong = plaintext === '000000' ? '111111' : '000000';
    const { orderId } = await makeOrder({ codeHash: hash });

    await confirmDeliveryByCode(prisma, { orderId, code: wrong });
    await confirmDeliveryByCode(prisma, { orderId, code: wrong });
    const third = await confirmDeliveryByCode(prisma, { orderId, code: wrong });
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.reason).toBe('locked');

    // Even the correct code is now refused — the order is locked.
    const afterLock = await confirmDeliveryByCode(prisma, { orderId, code: plaintext });
    expect(afterLock.ok).toBe(false);
    if (!afterLock.ok) expect(afterLock.reason).toBe('locked');

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('OUT_FOR_DELIVERY');
    expect(order?.delivery_attempts).toBe(3);
  });

  it('accepts the correct code: order → DELIVERED, release clock set, escrow stays HELD', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const now = new Date();
    const { orderId, holdId } = await makeOrder({ codeHash: hash });

    const res = await confirmDeliveryByCode(prisma, { orderId, code: plaintext, now });
    expect(res.ok).toBe(true);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('DELIVERED');
    expect(order?.delivered_at?.getTime()).toBe(now.getTime());

    // Escrow stays HELD; release is windowed (Engineering_Spec §6.3).
    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('HELD');
    expect(hold?.scheduled_release_at?.getTime()).toBe(now.getTime() + 24 * HOUR);

    // History + audit recorded.
    const history = await prisma.orderStatusHistory.findFirst({
      where: { order_id: orderId, to_status: 'DELIVERED' },
    });
    expect(history?.reason).toBe('delivery_code_verified');
    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: orderId, action: 'delivery.code.verified' },
    });
    expect(audit).not.toBeNull();
  });

  it('refuses a correct code when the order is not in a deliverable state', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const { orderId } = await makeOrder({ codeHash: hash, status: 'PAID' });

    const res = await confirmDeliveryByCode(prisma, { orderId, code: plaintext });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('bad_state');
  });

  it('refuses an expired code', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const { orderId } = await makeOrder({
      codeHash: hash,
      expiresAt: new Date(Date.now() - HOUR),
    });

    const res = await confirmDeliveryByCode(prisma, { orderId, code: plaintext });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe('expired');
  });
});

describe('releaseEligibleEscrowForOrder', () => {
  it('is a no-op before the dispute window passes', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const now = new Date();
    const { orderId, holdId } = await makeOrder({ codeHash: hash });
    await confirmDeliveryByCode(prisma, { orderId, code: plaintext, now });

    // 1 hour later — well before the 24h window.
    const res = await releaseEligibleEscrowForOrder(prisma, {
      orderId,
      now: new Date(now.getTime() + HOUR),
    });
    expect(res.releasedHoldIds).toHaveLength(0);
    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('HELD');
  });

  it('after the window passes, transitions HELD → RELEASING with a transition row + audit', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const now = new Date();
    const { orderId, holdId } = await makeOrder({ codeHash: hash });
    await confirmDeliveryByCode(prisma, { orderId, code: plaintext, now });

    const res = await releaseEligibleEscrowForOrder(prisma, {
      orderId,
      now: new Date(now.getTime() + 25 * HOUR),
    });
    expect(res.releasedHoldIds).toEqual([holdId]);

    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('RELEASING');

    const transition = await prisma.escrowStateTransition.findFirst({
      where: { escrow_hold_id: holdId, to_state: 'RELEASING' },
    });
    expect(transition?.from_state).toBe('HELD');
    expect(transition?.reason).toBe('auto_release_window_passed');

    const audit = await prisma.auditLog.findFirst({
      where: { resource_id: holdId, action: 'escrow.releasing' },
    });
    expect(audit).not.toBeNull();
  });

  it('skips a disputed hold even after the window', async () => {
    const { hash } = await generateDeliveryCode();
    const now = new Date();
    // Order delivered, but the hold is HELD_DISPUTED (buyer opened a dispute).
    const { orderId, holdId } = await makeOrder({ codeHash: hash, holdState: 'HELD_DISPUTED' });
    await prisma.order.update({ where: { id: orderId }, data: { status: 'DELIVERED', delivered_at: now } });
    await prisma.escrowHold.update({
      where: { id: holdId },
      data: { scheduled_release_at: new Date(now.getTime() + 24 * HOUR) },
    });

    const res = await releaseEligibleEscrowForOrder(prisma, {
      orderId,
      now: new Date(now.getTime() + 25 * HOUR),
    });
    expect(res.releasedHoldIds).toHaveLength(0);
    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('HELD_DISPUTED');
  });
});

describe('concurrency safety', () => {
  it('two parallel correct-code submissions deliver the order exactly once', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const { orderId } = await makeOrder({ codeHash: hash });

    const results = await Promise.all([
      confirmDeliveryByCode(prisma, { orderId, code: plaintext }),
      confirmDeliveryByCode(prisma, { orderId, code: plaintext }),
    ]);

    // Exactly one wins; the other sees the order already DELIVERED (bad_state).
    expect(results.filter((r) => r.ok)).toHaveLength(1);

    const delivered = await prisma.orderStatusHistory.count({
      where: { order_id: orderId, to_status: 'DELIVERED' },
    });
    expect(delivered).toBe(1);
    const verifiedAudit = await prisma.auditLog.count({
      where: { resource_id: orderId, action: 'delivery.code.verified' },
    });
    expect(verifiedAudit).toBe(1);
  });

  it('two parallel releases transition a hold to RELEASING exactly once', async () => {
    const { plaintext, hash } = await generateDeliveryCode();
    const now = new Date();
    const { orderId, holdId } = await makeOrder({ codeHash: hash });
    await confirmDeliveryByCode(prisma, { orderId, code: plaintext, now });

    const after = new Date(now.getTime() + 25 * HOUR);
    await Promise.all([
      releaseEligibleEscrowForOrder(prisma, { orderId, now: after }),
      releaseEligibleEscrowForOrder(prisma, { orderId, now: after }),
    ]);

    const hold = await prisma.escrowHold.findUnique({ where: { id: holdId } });
    expect(hold?.state).toBe('RELEASING');

    const transitions = await prisma.escrowStateTransition.count({
      where: { escrow_hold_id: holdId, to_state: 'RELEASING' },
    });
    expect(transitions).toBe(1);
  });
});
