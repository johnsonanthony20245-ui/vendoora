import { prisma as defaultPrisma, type Prisma, type PrismaClient } from '@vendoora/db';
import { DISPUTE_WINDOW_MS } from '@vendoora/domain';
import { verifyDeliveryCode } from './delivery-code';

/**
 * Trust-mechanic request-path logic — the delivery-code verification gate that
 * runs in the web request (driver-at-door / driver app, P7).
 *
 * The escrow *release* logic (releaseEligibleEscrowForOrder /
 * releaseAllEligibleEscrow) lives in @vendoora/domain so the auto-release
 * worker (apps/worker) can share it; it is re-exported below so existing
 * callers and tests keep importing it from here.
 *
 * Spec-faithful transitions (Engineering_Spec §6.3):
 *   code verified at door → Order DELIVERED + scheduled_release_at = +24h
 *                           (escrow stays HELD — the dispute window)
 *   window passes, no dispute → EscrowHold HELD → RELEASING (in @vendoora/domain)
 *   RELEASING → RELEASED      → real payout-provider webhook, §5 credential-blocked
 */

export {
  releaseEligibleEscrowForOrder,
  releaseAllEligibleEscrow,
  DISPUTE_WINDOW_MS,
  type ReleaseResult,
  type ReleaseSweepResult,
} from '@vendoora/domain';

/** Max wrong code entries before the order locks (Polish_Phase_Addendum §1.13). */
export const MAX_DELIVERY_ATTEMPTS = 3;

export type ConfirmFailureReason =
  | 'not_found'
  | 'bad_state'
  | 'expired'
  | 'locked'
  | 'wrong_code';

export type ConfirmDeliveryResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: ConfirmFailureReason; attemptsRemaining: number };

type Db = PrismaClient;

function actorFields(actorUserId: string | null) {
  return actorUserId
    ? { actor_user_id: actorUserId, actor_system: false }
    : { actor_system: true };
}

/**
 * Verify the buyer's 6-digit delivery code at the door. On success the order
 * transitions to DELIVERED and the 24h escrow release clock starts; the escrow
 * stays HELD so the dispute window is open. Wrong codes increment the attempt
 * counter and lock the order at MAX_DELIVERY_ATTEMPTS.
 *
 * The order row is SELECT … FOR UPDATE locked for the transaction so the
 * attempt increment and the DELIVERED transition are atomic under concurrency.
 */
export async function confirmDeliveryByCode(
  db: Db,
  args: { orderId: string; code: string; actorUserId?: string | null; now?: Date },
): Promise<ConfirmDeliveryResult> {
  const { orderId, code } = args;
  const actorUserId = args.actorUserId ?? null;
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    // Lock the order row so concurrent code submissions serialize.
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        delivery_code_hash: true,
        delivery_code_expires_at: true,
        delivery_attempts: true,
      },
    });

    if (!order) return { ok: false, reason: 'not_found', attemptsRemaining: 0 };

    const remaining = Math.max(0, MAX_DELIVERY_ATTEMPTS - order.delivery_attempts);

    if (!order.delivery_code_hash) {
      return { ok: false, reason: 'bad_state', attemptsRemaining: remaining };
    }
    if (order.status !== 'OUT_FOR_DELIVERY' && order.status !== 'ARRIVED') {
      return { ok: false, reason: 'bad_state', attemptsRemaining: remaining };
    }
    if (order.delivery_attempts >= MAX_DELIVERY_ATTEMPTS) {
      return { ok: false, reason: 'locked', attemptsRemaining: 0 };
    }
    if (
      order.delivery_code_expires_at &&
      order.delivery_code_expires_at.getTime() < now.getTime()
    ) {
      return { ok: false, reason: 'expired', attemptsRemaining: remaining };
    }

    const matches = await verifyDeliveryCode(code, order.delivery_code_hash);

    if (!matches) {
      const attempts = order.delivery_attempts + 1;
      const locked = attempts >= MAX_DELIVERY_ATTEMPTS;
      await tx.order.update({
        where: { id: order.id },
        data: { delivery_attempts: attempts },
      });
      await tx.auditLog.create({
        data: {
          ...actorFields(actorUserId),
          action: 'delivery.code.rejected',
          resource_type: 'order',
          resource_id: order.id,
          metadata: { attempts, locked } satisfies Prisma.InputJsonValue,
        },
      });
      return {
        ok: false,
        reason: locked ? 'locked' : 'wrong_code',
        attemptsRemaining: Math.max(0, MAX_DELIVERY_ATTEMPTS - attempts),
      };
    }

    // Correct code → DELIVERED + start the 24h release clock on HELD holds.
    const scheduledRelease = new Date(now.getTime() + DISPUTE_WINDOW_MS);
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'DELIVERED', delivered_at: now, status_updated_at: now },
    });
    await tx.escrowHold.updateMany({
      where: { order_id: order.id, state: 'HELD' },
      data: { scheduled_release_at: scheduledRelease },
    });
    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        from_status: order.status,
        to_status: 'DELIVERED',
        ...(actorUserId ? { changed_by_user_id: actorUserId } : { changed_by_system: true }),
        reason: 'delivery_code_verified',
      },
    });
    await tx.auditLog.create({
      data: {
        ...actorFields(actorUserId),
        action: 'delivery.code.verified',
        resource_type: 'order',
        resource_id: order.id,
        before_state: { status: order.status } satisfies Prisma.InputJsonValue,
        after_state: {
          status: 'DELIVERED',
          scheduled_release_at: scheduledRelease.toISOString(),
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { ok: true, orderId: order.id };
  });
}

/** The default app-wide client, for callers that don't inject one. */
export const escrowDb = defaultPrisma;
