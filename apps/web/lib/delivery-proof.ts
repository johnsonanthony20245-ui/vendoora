import { randomUUID } from 'node:crypto';
import { type Prisma, type PrismaClient } from '@vendoora/db';
import { assertFileBytesMatchType } from './file-magic';

/**
 * Photo proof of delivery (Engineering_Spec §5.1.5). When a driver is AT the
 * dropoff they capture a geotagged, timestamped photo; this records it against
 * the Delivery so a diaspora sender has tamper-resistant proof their gift
 * arrived. Phase 7 builds the driver UI — this is the backend that the driver
 * endpoint calls.
 *
 * Enforced before anything is stored:
 *   - delivery exists, is ARRIVED, and has no proof yet,
 *   - GPS is a real coordinate (in range, not null-island),
 *   - the timestamp is present and not in the future,
 *   - the bytes are actually a JPEG/PNG/WebP (magic-byte sniff, not the
 *     client-claimed MIME — same defense as the KYC upload).
 *
 * The photo bytes go to R2 (injected, so this is unit-testable); the R2 object
 * key is stored in delivery_proof_photo_url and resolved to a URL on read, the
 * same key-not-URL convention as product images.
 */

type Db = PrismaClient;

const ALLOWED_PROOF_MIME: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
/** Tolerate small client/server clock skew on the capture timestamp. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export type DeliveryProofReason =
  | 'not_found'
  | 'invalid_state'
  | 'already_recorded'
  | 'invalid_gps'
  | 'invalid_timestamp'
  | 'invalid_type'
  | 'mime_mismatch';

export type DeliveryProofResult =
  | { ok: true; deliveryId: string; key: string }
  | { ok: false; reason: DeliveryProofReason };

export interface RecordDeliveryProofArgs {
  deliveryId: string;
  bytes: Buffer | Uint8Array;
  contentType: string;
  lat: number;
  lng: number;
  takenAt: Date;
  actorUserId?: string | null;
  now?: Date;
}

export interface DeliveryProofDeps {
  uploadObject: (opts: {
    key: string;
    body: Buffer | Uint8Array;
    contentType: string;
  }) => Promise<{ key: string }>;
  randomId?: () => string;
}

/**
 * Pure validation of the GPS + capture timestamp. Exported so the metadata
 * rules can be unit-tested without a DB, an upload, or image bytes.
 */
export function validateProofMetadata(
  args: { lat: number; lng: number; takenAt: Date },
  now: Date,
): { ok: true } | { ok: false; reason: 'invalid_gps' | 'invalid_timestamp' } {
  const { lat, lng, takenAt } = args;
  const gpsOk =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0); // reject null-island — almost always a missing fix
  if (!gpsOk) return { ok: false, reason: 'invalid_gps' };

  const t = takenAt instanceof Date ? takenAt.getTime() : NaN;
  if (Number.isNaN(t) || t > now.getTime() + FUTURE_SKEW_MS) {
    return { ok: false, reason: 'invalid_timestamp' };
  }
  return { ok: true };
}

export async function recordDeliveryProof(
  db: Db,
  args: RecordDeliveryProofArgs,
  deps: DeliveryProofDeps,
): Promise<DeliveryProofResult> {
  const now = args.now ?? new Date();

  const delivery = await db.delivery.findUnique({
    where: { id: args.deliveryId },
    select: { id: true, status: true, delivery_proof_photo_url: true },
  });
  if (delivery == null) return { ok: false, reason: 'not_found' };
  if (delivery.delivery_proof_photo_url != null) return { ok: false, reason: 'already_recorded' };
  if (delivery.status !== 'ARRIVED') return { ok: false, reason: 'invalid_state' };

  const meta = validateProofMetadata(args, now);
  if (!meta.ok) return { ok: false, reason: meta.reason };

  if (!ALLOWED_PROOF_MIME.has(args.contentType)) return { ok: false, reason: 'invalid_type' };
  const magic = await assertFileBytesMatchType(args.bytes, args.contentType);
  if (!magic.ok) return { ok: false, reason: 'mime_mismatch' };

  const id = (deps.randomId ?? randomUUID)();
  const ext = EXT_BY_MIME[args.contentType] ?? 'bin';
  const key = `delivery-proof/${args.deliveryId}/${id}.${ext}`;

  // Upload first; on a rare double-submit race the loser's object is a harmless
  // orphan, whereas a DB row pointing at a not-yet-uploaded key would not be.
  await deps.uploadObject({ key, body: args.bytes, contentType: args.contentType });

  const recorded = await db.$transaction(async (tx) => {
    // State-guarded so a concurrent double-submit can't double-record / double-audit.
    const { count } = await tx.delivery.updateMany({
      where: { id: args.deliveryId, delivery_proof_photo_url: null, status: 'ARRIVED' },
      data: {
        delivery_proof_photo_url: key,
        delivery_proof_photo_lat: args.lat,
        delivery_proof_photo_lng: args.lng,
        delivery_proof_photo_taken_at: args.takenAt,
        delivered_at: now,
        status: 'COMPLETED',
      },
    });
    if (count === 0) return false;
    await tx.auditLog.create({
      data: {
        ...(args.actorUserId
          ? { actor_user_id: args.actorUserId, actor_system: false }
          : { actor_system: true }),
        action: 'delivery.proof.recorded',
        resource_type: 'delivery',
        resource_id: args.deliveryId,
        after_state: {
          delivery_proof_photo_url: key,
          lat: args.lat,
          lng: args.lng,
          taken_at: args.takenAt.toISOString(),
          status: 'COMPLETED',
        } satisfies Prisma.InputJsonValue,
      },
    });
    return true;
  });

  if (!recorded) return { ok: false, reason: 'already_recorded' };
  return { ok: true, deliveryId: args.deliveryId, key };
}
