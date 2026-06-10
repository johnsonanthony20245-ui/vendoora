/**
 * Trust-case auto-creation engine (packages/domain/src/trust/auto-creation.ts:
 * runFraudScan). §5.1.11: risk rules scan recent activity and open a TrustCase
 * per tripping subject, idempotently. First rule: a driver with >= threshold
 * FAILED deliveries in the window.
 *
 * The scan is GLOBAL, so each test asserts on its own driver's resulting case
 * (via subject_id), never on a global created-count.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { runFraudScan } = await import('@vendoora/domain');

const TAG = `fraud-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
const DAY = 24 * 3600 * 1000;
let orderId = '';
const driverIds: string[] = [];
const userIds: string[] = [];
const kycAppIds: string[] = [];
const velocityBuyerIds: string[] = [];

async function makeDriver(): Promise<string> {
  const u = await prisma.user.create({
    data: {
      clerk_id: `drv_${randomUUID().slice(0, 12)}`,
      email: `${TAG}-${randomUUID().slice(0, 6)}@vendoora.test`,
      full_name: 'Fraud Driver',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(u.id);
  const d = await prisma.driver.create({
    data: { user_id: u.id, driver_number: `DRV-${randomUUID().slice(0, 8).toUpperCase()}` },
    select: { id: true },
  });
  driverIds.push(d.id);
  return d.id;
}

async function makeFailedDelivery(driverId: string, opts: { status?: string; agedDays?: number } = {}) {
  const d = await prisma.delivery.create({
    data: {
      order_id: orderId,
      driver_id: driverId,
      pickup_address: { street: '1' },
      pickup_seller_id: `${TAG}-seller`,
      dropoff_address: { street: '2' },
      driver_fee: 5,
      driver_total: 5,
      status: (opts.status ?? 'FAILED') as never,
    },
    select: { id: true },
  });
  if (opts.agedDays) {
    const aged = new Date(NOW.getTime() - opts.agedDays * DAY);
    await prisma.$executeRaw`UPDATE deliveries SET updated_at = ${aged} WHERE id = ${d.id}`;
  }
  return d.id;
}

async function caseFor(driverId: string) {
  return prisma.trustCase.findFirst({
    where: { subject_type: 'DRIVER', subject_id: driverId, auto_creation_signal: 'delivery_failure_driver' },
  });
}

async function makePriorCase(driverId: string, status: 'MONITORING' | 'RESOLVED'): Promise<void> {
  await prisma.trustCase.create({
    data: {
      case_number: `TC-PRIOR-${randomUUID().slice(0, 8).toUpperCase()}`,
      subject_type: 'DRIVER',
      subject_id: driverId,
      title: 'prior case',
      summary: 'prior case',
      status,
      severity: 'MEDIUM',
      due_date: new Date(NOW.getTime() + 3 * DAY),
      auto_created: true,
      auto_creation_signal: 'delivery_failure_driver',
    },
  });
}

async function caseCount(driverId: string): Promise<number> {
  return prisma.trustCase.count({ where: { subject_type: 'DRIVER', subject_id: driverId } });
}

async function makeKycApp(opts: {
  submittedDaysAgo: number;
  status?: 'SUBMITTED' | 'IN_REVIEW' | 'NEEDS_MORE_INFO' | 'APPROVED';
}): Promise<string> {
  const u = await prisma.user.create({
    data: {
      clerk_id: `kyc_${randomUUID().slice(0, 12)}`,
      email: `${TAG}-kyc-${randomUUID().slice(0, 6)}@vendoora.test`,
      full_name: 'KYC Applicant',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(u.id);
  const app = await prisma.kycApplication.create({
    data: {
      applicant_user_id: u.id,
      applicant_type: 'SELLER',
      target_tier: 1,
      status: opts.status ?? 'SUBMITTED',
      submitted_at: new Date(NOW.getTime() - opts.submittedDaysAgo * DAY),
    },
    select: { id: true },
  });
  kycAppIds.push(app.id);
  return app.id;
}

async function kycCaseFor(appId: string) {
  return prisma.trustCase.findFirst({
    where: { subject_type: 'KYC', subject_id: appId, auto_creation_signal: 'kyc_stale' },
  });
}

async function makeBuyerWithOrders(opts: { count: number; hoursAgo: number }): Promise<string> {
  const u = await prisma.user.create({
    data: {
      clerk_id: `vel_${randomUUID().slice(0, 12)}`,
      email: `${TAG}-vel-${randomUUID().slice(0, 6)}@vendoora.test`,
      full_name: 'Velocity Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(u.id);
  velocityBuyerIds.push(u.id);
  const createdAt = new Date(NOW.getTime() - opts.hoursAgo * 3600 * 1000);
  for (let i = 0; i < opts.count; i++) {
    await prisma.order.create({
      data: {
        order_number: `VDR-VEL-${randomUUID().slice(0, 8).toUpperCase()}`,
        buyer_user_id: u.id,
        buyer_type: 'LIBERIA_DOMESTIC',
        buyer_name: 'Vel',
        buyer_email: `${TAG}-vel@vendoora.test`,
        delivery_address: { street: '1' },
        delivery_city: 'Monrovia',
        delivery_country: 'LR',
        delivery_zone: 'sinkor',
        subtotal: 10,
        total_amount: 10,
        currency: 'USD',
        payment_method: 'MTN_MOMO',
        payment_status: 'PENDING',
        status: 'PENDING_PAYMENT',
        created_at: createdAt,
      },
    });
  }
  return u.id;
}

async function velCaseFor(buyerId: string) {
  return prisma.trustCase.findFirst({
    where: { subject_type: 'USER', subject_id: buyerId, auto_creation_signal: 'order_velocity_buyer' },
  });
}

beforeAll(async () => {
  const buyer = await prisma.user.create({
    data: {
      clerk_id: `guest_${TAG}`,
      email: `${TAG}-buyer@vendoora.test`,
      full_name: 'Fraud Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  userIds.push(buyer.id);
  const order = await prisma.order.create({
    data: {
      order_number: `VDR-FRAUD-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyer.id,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Fraud',
      buyer_email: `${TAG}-buyer@vendoora.test`,
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
  });
  orderId = order.id;
});

beforeEach(async () => {
  await prisma.delivery.deleteMany({ where: { order_id: orderId } });
  if (driverIds.length) {
    await prisma.trustCase.deleteMany({ where: { subject_type: 'DRIVER', subject_id: { in: driverIds } } });
  }
  if (kycAppIds.length) {
    await prisma.trustCase.deleteMany({ where: { subject_type: 'KYC', subject_id: { in: kycAppIds } } });
    await prisma.kycApplication.deleteMany({ where: { id: { in: kycAppIds } } });
  }
  if (velocityBuyerIds.length) {
    await prisma.trustCase.deleteMany({ where: { subject_type: 'USER', subject_id: { in: velocityBuyerIds } } });
    await prisma.order.deleteMany({ where: { buyer_user_id: { in: velocityBuyerIds } } });
  }
});

afterAll(async () => {
  await prisma.delivery.deleteMany({ where: { order_id: orderId } });
  await prisma.trustCase.deleteMany({ where: { subject_type: 'DRIVER', subject_id: { in: driverIds } } });
  await prisma.trustCase.deleteMany({ where: { subject_type: 'KYC', subject_id: { in: kycAppIds } } });
  await prisma.kycApplication.deleteMany({ where: { id: { in: kycAppIds } } });
  await prisma.trustCase.deleteMany({ where: { subject_type: 'USER', subject_id: { in: velocityBuyerIds } } });
  await prisma.order.deleteMany({ where: { buyer_user_id: { in: velocityBuyerIds } } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.driver.deleteMany({ where: { id: { in: driverIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('runFraudScan — driver delivery failures', () => {
  it('opens a trust case for a driver at/over the failure threshold', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId);
    const r = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });

    expect(r.created.some((c) => c.subjectId === driverId)).toBe(true);
    const tc = await caseFor(driverId);
    expect(tc).not.toBeNull();
    expect(tc?.auto_created).toBe(true);
    expect(tc?.status).toBe('NEW');
    expect(tc?.severity).toBe('MEDIUM'); // 3 == threshold, < 2x

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'trust_case.auto_created', resource_id: tc?.id ?? '' },
    });
    expect(audit).not.toBeNull();
  });

  it('does not open a case for a driver below the threshold', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 2; i++) await makeFailedDelivery(driverId);
    const r = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    expect(r.created.some((c) => c.subjectId === driverId)).toBe(false);
    expect(await caseFor(driverId)).toBeNull();
  });

  it('escalates severity to HIGH at 2x the threshold', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 6; i++) await makeFailedDelivery(driverId);
    await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    const tc = await caseFor(driverId);
    expect(tc?.severity).toBe('HIGH');
  });

  it('ignores failures outside the window', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId, { agedDays: 40 }); // before the 30d window
    const r = await runFraudScan(prisma, { now: NOW, windowDays: 30, driverFailureThreshold: 3 });
    expect(r.created.some((c) => c.subjectId === driverId)).toBe(false);
    expect(await caseFor(driverId)).toBeNull();
  });

  it('is idempotent — a second scan does not open a duplicate case', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId);
    await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    const r2 = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    expect(r2.created.some((c) => c.subjectId === driverId)).toBe(false);
    const count = await prisma.trustCase.count({
      where: { subject_type: 'DRIVER', subject_id: driverId, auto_creation_signal: 'delivery_failure_driver' },
    });
    expect(count).toBe(1);
  });

  it('does not count non-FAILED deliveries toward the threshold', async () => {
    const driverId = await makeDriver();
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId, { status: 'COMPLETED' });
    const r = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    expect(r.created.some((c) => c.subjectId === driverId)).toBe(false);
    expect(await caseFor(driverId)).toBeNull();
  });

  it('suppresses a new case while an open case (MONITORING) exists', async () => {
    const driverId = await makeDriver();
    await makePriorCase(driverId, 'MONITORING');
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId);
    const r = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    expect(r.created.some((c) => c.subjectId === driverId)).toBe(false);
    expect(await caseCount(driverId)).toBe(1); // still just the prior one
  });

  it('reopens a case after a RESOLVED one when failures recur', async () => {
    const driverId = await makeDriver();
    await makePriorCase(driverId, 'RESOLVED');
    for (let i = 0; i < 3; i++) await makeFailedDelivery(driverId);
    const r = await runFraudScan(prisma, { now: NOW, driverFailureThreshold: 3 });
    expect(r.created.some((c) => c.subjectId === driverId)).toBe(true);
    expect(await caseCount(driverId)).toBe(2); // prior RESOLVED + the new one
  });
});

describe('runFraudScan — stale KYC applications', () => {
  it('opens a case for an application awaiting review past its SLA', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 10, status: 'SUBMITTED' });
    const r = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r.created.some((c) => c.subjectType === 'KYC' && c.subjectId === appId)).toBe(true);
    const tc = await kycCaseFor(appId);
    expect(tc?.auto_created).toBe(true);
    expect(tc?.severity).toBe('MEDIUM'); // 10d, < 2x SLA
  });

  it('also sweeps a stale IN_REVIEW application', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 10, status: 'IN_REVIEW' });
    const r = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r.created.some((c) => c.subjectType === 'KYC' && c.subjectId === appId)).toBe(true);
    expect(await kycCaseFor(appId)).not.toBeNull();
  });

  it('does NOT sweep NEEDS_MORE_INFO — the ball is in the applicant\'s court', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 20, status: 'NEEDS_MORE_INFO' });
    const r = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r.created.some((c) => c.subjectType === 'KYC' && c.subjectId === appId)).toBe(false);
    expect(await kycCaseFor(appId)).toBeNull();
  });

  it('does not open a case for an application within its SLA', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 2, status: 'SUBMITTED' });
    const r = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r.created.some((c) => c.subjectType === 'KYC' && c.subjectId === appId)).toBe(false);
    expect(await kycCaseFor(appId)).toBeNull();
  });

  it('is idempotent — a second scan opens no duplicate KYC case', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 10, status: 'SUBMITTED' });
    await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    const r2 = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r2.created.some((c) => c.subjectId === appId)).toBe(false);
    const count = await prisma.trustCase.count({
      where: { subject_type: 'KYC', subject_id: appId, auto_creation_signal: 'kyc_stale' },
    });
    expect(count).toBe(1);
  });

  it('escalates to HIGH at 2x the SLA', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 15, status: 'SUBMITTED' });
    await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect((await kycCaseFor(appId))?.severity).toBe('HIGH');
  });

  it('ignores already-decided applications even if old', async () => {
    const appId = await makeKycApp({ submittedDaysAgo: 30, status: 'APPROVED' });
    const r = await runFraudScan(prisma, { now: NOW, kycStaleDays: 7 });
    expect(r.created.some((c) => c.subjectType === 'KYC' && c.subjectId === appId)).toBe(false);
    expect(await kycCaseFor(appId)).toBeNull();
  });
});

describe('runFraudScan — buyer order velocity', () => {
  it('opens a case for a buyer over the order-velocity threshold', async () => {
    const buyerId = await makeBuyerWithOrders({ count: 5, hoursAgo: 1 });
    const r = await runFraudScan(prisma, { now: NOW, velocityOrderThreshold: 5, velocityWindowHours: 24 });
    expect(r.created.some((c) => c.subjectType === 'USER' && c.subjectId === buyerId)).toBe(true);
    const tc = await velCaseFor(buyerId);
    expect(tc?.auto_created).toBe(true);
    expect(tc?.severity).toBe('MEDIUM'); // 5 == threshold, < 2x
  });

  it('ignores orders placed outside the velocity window', async () => {
    const buyerId = await makeBuyerWithOrders({ count: 5, hoursAgo: 48 }); // before the 24h window
    const r = await runFraudScan(prisma, { now: NOW, velocityOrderThreshold: 5, velocityWindowHours: 24 });
    expect(r.created.some((c) => c.subjectId === buyerId)).toBe(false);
    expect(await velCaseFor(buyerId)).toBeNull();
  });

  it('escalates to HIGH at 2x the threshold', async () => {
    const buyerId = await makeBuyerWithOrders({ count: 10, hoursAgo: 1 });
    await runFraudScan(prisma, { now: NOW, velocityOrderThreshold: 5, velocityWindowHours: 24 });
    expect((await velCaseFor(buyerId))?.severity).toBe('HIGH');
  });
});
