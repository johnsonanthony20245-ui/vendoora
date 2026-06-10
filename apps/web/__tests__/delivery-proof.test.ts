/**
 * Photo proof of delivery (apps/web/lib/delivery-proof.ts). §5.1.5: a driver at
 * the dropoff records a geotagged, timestamped photo; we validate + store it and
 * complete the delivery. R2 upload is injected, so the record path is unit-tested
 * with a stub uploader; image validation runs against real bytes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

type DeliveryStatusFixture = 'ARRIVED' | 'EN_ROUTE_TO_DROPOFF';

config({ path: resolve(__dirname, '../../../.env') });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const { prisma } = await import('@vendoora/db');
const { recordDeliveryProof, validateProofMetadata } = await import('../lib/delivery-proof');

// Smallest valid 1x1 PNG — file-type sniffs this as image/png.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const NOT_AN_IMAGE = Buffer.from('this is plainly not an image, just ascii text bytes');

const TAG = `proof-${randomUUID()}`;
const NOW = new Date('2026-06-10T12:00:00.000Z');
let orderId = '';
const deliveryIds: string[] = [];

function makeUploader(imgId = 'testimg') {
  const uploads: Array<{ key: string; contentType: string }> = [];
  const deletes: string[] = [];
  return {
    uploads,
    deletes,
    deps: {
      uploadObject: async (o: { key: string; body: Buffer | Uint8Array; contentType: string }) => {
        uploads.push({ key: o.key, contentType: o.contentType });
        return { key: o.key };
      },
      deleteObject: async (key: string) => {
        deletes.push(key);
      },
      randomId: () => imgId,
    },
  };
}

async function makeDelivery(
  opts: { status?: DeliveryStatusFixture; proofUrl?: string; arrivedAt?: Date } = {},
): Promise<string> {
  const d = await prisma.delivery.create({
    data: {
      order_id: orderId,
      pickup_address: { street: 'Pickup 1' },
      pickup_seller_id: `${TAG}-seller`,
      dropoff_address: { street: 'Dropoff 1' },
      driver_fee: 5,
      driver_total: 5,
      status: opts.status ?? 'ARRIVED',
      ...(opts.arrivedAt ? { arrived_at: opts.arrivedAt } : {}),
      ...(opts.proofUrl ? { delivery_proof_photo_url: opts.proofUrl } : {}),
    },
    select: { id: true },
  });
  deliveryIds.push(d.id);
  return d.id;
}

const baseArgs = (deliveryId: string) => ({
  deliveryId,
  bytes: PNG_1x1,
  contentType: 'image/png',
  lat: 6.3004,
  lng: -10.7969, // Monrovia
  takenAt: new Date(NOW.getTime() - 60_000),
  now: NOW,
});

beforeAll(async () => {
  const buyer = await prisma.user.create({
    data: {
      clerk_id: `guest_${TAG}`,
      email: `${TAG}@vendoora.test`,
      full_name: 'Proof Buyer',
      is_email_verified: false,
      account_status: 'ACTIVE',
    },
    select: { id: true },
  });
  const order = await prisma.order.create({
    data: {
      order_number: `VDR-PROOF-${randomUUID().slice(0, 8).toUpperCase()}`,
      buyer_user_id: buyer.id,
      buyer_type: 'LIBERIA_DOMESTIC',
      buyer_name: 'Proof',
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
    select: { id: true, buyer_user_id: true },
  });
  orderId = order.id;
});

beforeEach(async () => {
  await prisma.delivery.deleteMany({ where: { order_id: orderId } });
});

afterAll(async () => {
  await prisma.delivery.deleteMany({ where: { order_id: orderId } });
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { buyer_user_id: true } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  if (o) await prisma.user.deleteMany({ where: { id: o.buyer_user_id } });
  await prisma.$disconnect();
});

describe('validateProofMetadata', () => {
  it('accepts a real coordinate and a past timestamp', () => {
    expect(validateProofMetadata({ lat: 6.3, lng: -10.8, takenAt: new Date(NOW.getTime() - 1000) }, NOW).ok).toBe(true);
  });
  it('rejects out-of-range latitude', () => {
    const r = validateProofMetadata({ lat: 91, lng: 0, takenAt: NOW }, NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid_gps' });
  });
  it('rejects null-island (0,0)', () => {
    const r = validateProofMetadata({ lat: 0, lng: 0, takenAt: NOW }, NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid_gps' });
  });
  it('rejects a future timestamp', () => {
    const r = validateProofMetadata({ lat: 6.3, lng: -10.8, takenAt: new Date(NOW.getTime() + 30 * 60_000) }, NOW);
    expect(r).toEqual({ ok: false, reason: 'invalid_timestamp' });
  });
});

describe('recordDeliveryProof', () => {
  it('records proof on an ARRIVED delivery and completes it', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const { uploads, deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, baseArgs(id), deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.key).toBe(`delivery-proof/${id}/testimg.png`);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toEqual({ key: r.key, contentType: 'image/png' });

    const d = await prisma.delivery.findUnique({ where: { id } });
    expect(d?.delivery_proof_photo_url).toBe(r.key);
    expect(d?.delivery_proof_photo_lat).toBeCloseTo(6.3004);
    expect(d?.delivery_proof_photo_lng).toBeCloseTo(-10.7969);
    expect(d?.delivery_proof_photo_taken_at).not.toBeNull();
    expect(d?.status).toBe('COMPLETED');
    expect(d?.delivered_at).not.toBeNull();

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'delivery.proof.recorded', resource_id: id },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects a missing delivery', async () => {
    const { deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, baseArgs('does-not-exist'), deps);
    expect(r).toEqual({ ok: false, reason: 'not_found' });
  });

  it('rejects a delivery not yet ARRIVED', async () => {
    const id = await makeDelivery({ status: 'EN_ROUTE_TO_DROPOFF' });
    const { uploads, deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, baseArgs(id), deps);
    expect(r).toEqual({ ok: false, reason: 'invalid_state' });
    expect(uploads).toHaveLength(0); // nothing uploaded on a rejected proof
  });

  it('rejects a delivery that already has proof', async () => {
    const id = await makeDelivery({ status: 'ARRIVED', proofUrl: 'delivery-proof/x/old.png' });
    const { deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, baseArgs(id), deps);
    expect(r).toEqual({ ok: false, reason: 'already_recorded' });
  });

  it('rejects a non-image content type', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const { deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, { ...baseArgs(id), contentType: 'application/pdf' }, deps);
    expect(r).toEqual({ ok: false, reason: 'invalid_type' });
  });

  it('rejects bytes whose magic number is not the claimed image', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const { uploads, deps } = makeUploader();
    const r = await recordDeliveryProof(prisma, { ...baseArgs(id), bytes: NOT_AN_IMAGE }, deps);
    expect(r).toEqual({ ok: false, reason: 'mime_mismatch' });
    expect(uploads).toHaveLength(0);
  });

  it('rejects a future capture timestamp via the record path, uploading nothing', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const { uploads, deps } = makeUploader();
    const r = await recordDeliveryProof(
      prisma,
      { ...baseArgs(id), takenAt: new Date(NOW.getTime() + 30 * 60_000) },
      deps,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid_timestamp' });
    expect(uploads).toHaveLength(0);
  });

  it('rejects proof captured before the driver arrived', async () => {
    const arrivedAt = new Date(NOW.getTime() - 30 * 60_000);
    const id = await makeDelivery({ status: 'ARRIVED', arrivedAt });
    const { uploads, deps } = makeUploader();
    const r = await recordDeliveryProof(
      prisma,
      { ...baseArgs(id), takenAt: new Date(arrivedAt.getTime() - 60 * 60_000) },
      deps,
    );
    expect(r).toEqual({ ok: false, reason: 'invalid_timestamp' });
    expect(uploads).toHaveLength(0);
  });

  it('leaves the delivery unchanged when the proof is rejected', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const { deps } = makeUploader();
    await recordDeliveryProof(prisma, { ...baseArgs(id), contentType: 'application/pdf' }, deps);
    const d = await prisma.delivery.findUnique({
      where: { id },
      select: { status: true, delivery_proof_photo_url: true },
    });
    expect(d?.status).toBe('ARRIVED');
    expect(d?.delivery_proof_photo_url).toBeNull();
  });

  it('is race-safe: concurrent submits record exactly once and clean up the orphan', async () => {
    const id = await makeDelivery({ status: 'ARRIVED' });
    const a = makeUploader('img-a');
    const b = makeUploader('img-b');
    const [ra, rb] = await Promise.all([
      recordDeliveryProof(prisma, baseArgs(id), a.deps),
      recordDeliveryProof(prisma, baseArgs(id), b.deps),
    ]);
    const winner = ra.ok ? ra : rb.ok ? rb : null;
    const loser = !ra.ok ? ra : !rb.ok ? rb : null;
    expect(winner).not.toBeNull();
    expect(loser).toMatchObject({ ok: false, reason: 'already_recorded' });

    const auditCount = await prisma.auditLog.count({
      where: { action: 'delivery.proof.recorded', resource_id: id },
    });
    expect(auditCount).toBe(1);

    const d = await prisma.delivery.findUnique({
      where: { id },
      select: { status: true, delivery_proof_photo_url: true },
    });
    expect(d?.status).toBe('COMPLETED');
    if (winner && winner.ok) expect(d?.delivery_proof_photo_url).toBe(winner.key);

    // The loser deleted its orphaned upload; the winner deleted nothing.
    expect(a.deletes.length + b.deletes.length).toBe(1);
  });
});
