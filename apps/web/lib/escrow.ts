import { prisma as defaultPrisma, type Prisma, type PrismaClient } from '@vendoora/db';
import { verifyDeliveryCode } from './delivery-code';

/**
 * Trust-mechanic domain logic — the delivery-code verification gate and the
 * windowed escrow auto-release eligibility (Build_Fidelity_Directive §2.4,
 * Engineering_Spec §6.3/§6.4).
 *
 * These functions take a Prisma client so they are callable from a Server
 * Action today and from the BullMQ auto-release worker (apps/worker) once it
 * exists. They are intentionally free of next/* imports. State-machine
 * transitions are spec-faithful:
 *
 *   code verified at door → Order DELIVERED + scheduled_release_at = +24h
 *                           (escrow stays HELD — the dispute window)
 *   window passes, no dispute → EscrowHold HELD → RELEASING
 *   RELEASING → RELEASED      → driven by a real payout-provider webhook,
 *                               which is §5 credential-blocked (Stripe / MTN
 *                               MoMo / Orange Money). NOT performed here.
 */

/** Max wrong code entries before the order locks (Polish_Phase_Addendum §1.13). */
export const MAX_DELIVERY_ATTEMPTS = 3;
/** Dispute window after delivery before escrow becomes release-eligible. */
export const DISPUTE_WINDOW_MS = 24 * 3600 * 1000;

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
 */
export async function confirmDeliveryByCode(
  db: Db,
  args: { orderId: string; code: string; actorUserId?: string | null; now?: Date },
): Promise<ConfirmDeliveryResult> {
  const { orderId, code } = args;
  const actorUserId = args.actorUserId ?? null;
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    // Lock the order row for the duration of the transaction so concurrent
    // code submissions serialize. Without this (Postgres default Read
    // Committed) two parallel wrong guesses could both read attempts=N and
    // both write N+1 — losing an increment and letting the 3-attempt lockout
    // be bypassed — and two correct submissions could both transition to
    // DELIVERED. A no-op SELECT … FOR UPDATE takes the row lock; the later
    // findUnique then reads the locked, current row.
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

export interface ReleaseResult {
  releasedHoldIds: string[];
}

/**
 * Transition every release-eligible escrow hold for a DELIVERED order from
 * HELD → RELEASING. Eligible = state HELD (disputed holds are HELD_DISPUTED
 * and excluded) AND scheduled_release_at has passed. Idempotent: holds already
 * past HELD are ignored. This is the eligibility step the auto-release worker
 * (apps/worker, Engineering_Spec §6.4) runs on a 5-minute cron.
 *
 * It deliberately stops at RELEASING. RELEASING → RELEASED is driven by a real
 * payout-provider webhook (§5 credential-blocked) and is not faked here.
 */
export async function releaseEligibleEscrowForOrder(
  db: Db,
  args: { orderId: string; now?: Date; actorUserId?: string | null },
): Promise<ReleaseResult> {
  const { orderId } = args;
  const now = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true },
    });
    if (!order || order.status !== 'DELIVERED') return { releasedHoldIds: [] };

    const holds = await tx.escrowHold.findMany({
      where: {
        order_id: orderId,
        state: 'HELD',
        scheduled_release_at: { lte: now },
      },
      select: { id: true },
    });

    const releasedHoldIds: string[] = [];
    for (const hold of holds) {
      // State-guarded write: the UPDATE re-checks `state = 'HELD'` atomically,
      // so it is a no-op (count 0) if another transaction already moved this
      // hold to RELEASING (concurrent release) or HELD_DISPUTED (a dispute that
      // committed after our findMany read it as HELD). This makes release
      // idempotent and prevents releasing a just-disputed hold.
      const { count } = await tx.escrowHold.updateMany({
        where: { id: hold.id, state: 'HELD' },
        data: { state: 'RELEASING', state_changed_at: now },
      });
      if (count === 0) continue;

      await tx.escrowStateTransition.create({
        data: {
          escrow_hold_id: hold.id,
          from_state: 'HELD',
          to_state: 'RELEASING',
          actor_system: true,
          reason: 'auto_release_window_passed',
          transitioned_at: now,
        },
      });
      await tx.auditLog.create({
        data: {
          actor_system: true,
          action: 'escrow.releasing',
          resource_type: 'escrow_hold',
          resource_id: hold.id,
          before_state: { state: 'HELD' } satisfies Prisma.InputJsonValue,
          after_state: { state: 'RELEASING' } satisfies Prisma.InputJsonValue,
          metadata: {
            reason: 'auto_release_window_passed',
            order_id: orderId,
          } satisfies Prisma.InputJsonValue,
        },
      });
      releasedHoldIds.push(hold.id);
    }

    return { releasedHoldIds };
  });
}

/** The default app-wide client, for callers that don't inject one. */
export const escrowDb = defaultPrisma;
