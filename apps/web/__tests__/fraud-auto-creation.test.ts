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
});

afterAll(async () => {
  await prisma.delivery.deleteMany({ where: { order_id: orderId } });
  await prisma.trustCase.deleteMany({ where: { subject_type: 'DRIVER', subject_id: { in: driverIds } } });
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
});
