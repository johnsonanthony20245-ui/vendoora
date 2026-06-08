/**
 * Dispute SLA-breach sweep (packages/domain/src/dispute-sla.ts:
 * sweepDisputeSlaBreaches). Engineering_Spec §6 / disputes: an open dispute that
 * blows past its sla_due_at must be auto-flagged (sla_breached) and escalated to
 * senior T&S (status ESCALATED, escalated_at stamped) so it surfaces in the
 * escalation queue instead of silently aging.
 *
 * The sweep is GLOBAL (it escalates every breached active dispute), so these
 * tests assert on the STATE of their own tagged disputes + the returned id list,
 * never on a global count.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { sweepDisputeSlaBreaches } = await import('@vendoora/domain');

const TAG = `sla-${randomUUID()}`;
const NOW = new Date('2026-06-06T12:00:00.000Z');
const HOUR = 3600 * 1000;
let buyerId = '';
let orderId = '';

type DisputeStatus = 'OPEN' | 'IN_REVIEW' | 'PENDING_BUYER' | 'PENDING_SELLER' | 'RESOLVED_FAVOR_BUYER';

async function makeDispute(opts: { slaOffsetMs: number; status?: DisputeStatus }): Promise<string> {
  const d = await prisma.dispute.create({
    data: {
      dispute_number: `DSP-SLA-${randomUUID().slice(0, 8).toUpperCase()}`,
      order_id: orderId,
      initiated_by_user_id: buyerId,
      category: 'NOT_RECEIVED',
      reason: 'BUYER_INITIATED',
      description: `${TAG} sweep fixture`,
      status: opts.status ?? 'OPEN',
      sla_due_at: new Date(NOW.getTime() + opts.slaOffsetMs),
    },
    select: { id: true },
  });
  return d.id;
}

async function getDispute(id: string) {
  return prisma.dispute.findUnique({
    where: { id },
    select: { status: true, sla_breached: true, escalated_at: true },
  });
}

beforeAll(async () => {
  buyerId = (
    await prisma.user.create({
      data: {
        clerk_id: `guest_${TAG}`,
        email: `${TAG}@vendoora.test`,
        full_name: 'SLA Sweep Buyer',
        is_email_verified: false,
        account_status: 'ACTIVE',
      },
    })
  ).id;
  orderId = (
    await prisma.order.create({
      data: {
        order_number: `VDR-SLA-${randomUUID().slice(0, 8).toUpperCase()}`,
        buyer_user_id: buyerId,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'SLA',
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
        status: 'DISPUTED',
      },
      select: { id: true },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.dispute.deleteMany({ where: { order_id: orderId } });
});

afterAll(async () => {
  await prisma.dispute.deleteMany({ where: { order_id: orderId } });
  await prisma.order.deleteMany({ where: { buyer_user_id: buyerId } });
  await prisma.$disconnect();
});

describe('sweepDisputeSlaBreaches', () => {
  it('flags + escalates an open dispute past its SLA', async () => {
    const id = await makeDispute({ slaOffsetMs: -1 * HOUR }); // due an hour ago
    const result = await sweepDisputeSlaBreaches(prisma, { now: NOW });
    expect(result.disputeIds).toContain(id);
    const d = await getDispute(id);
    expect(d?.sla_breached).toBe(true);
    expect(d?.status).toBe('ESCALATED');
    expect(d?.escalated_at).not.toBeNull();
  });

  it('leaves a dispute still within its SLA untouched', async () => {
    const id = await makeDispute({ slaOffsetMs: 2 * HOUR }); // due in the future
    const result = await sweepDisputeSlaBreaches(prisma, { now: NOW });
    expect(result.disputeIds).not.toContain(id);
    const d = await getDispute(id);
    expect(d?.sla_breached).toBe(false);
    expect(d?.status).toBe('OPEN');
  });

  it('ignores already-resolved disputes even if past SLA', async () => {
    const id = await makeDispute({ slaOffsetMs: -5 * HOUR, status: 'RESOLVED_FAVOR_BUYER' });
    const result = await sweepDisputeSlaBreaches(prisma, { now: NOW });
    expect(result.disputeIds).not.toContain(id);
    const d = await getDispute(id);
    expect(d?.sla_breached).toBe(false);
    expect(d?.status).toBe('RESOLVED_FAVOR_BUYER');
  });

  it('is idempotent — a second sweep does not re-escalate', async () => {
    const id = await makeDispute({ slaOffsetMs: -1 * HOUR });
    const first = await sweepDisputeSlaBreaches(prisma, { now: NOW });
    expect(first.disputeIds).toContain(id);
    const second = await sweepDisputeSlaBreaches(prisma, { now: NOW });
    expect(second.disputeIds).not.toContain(id);
  });

  it('writes a dispute.sla.escalated audit row', async () => {
    const id = await makeDispute({ slaOffsetMs: -1 * HOUR });
    await sweepDisputeSlaBreaches(prisma, { now: NOW });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'dispute.sla.escalated', resource_id: id },
    });
    expect(audit).not.toBeNull();
  });
});
