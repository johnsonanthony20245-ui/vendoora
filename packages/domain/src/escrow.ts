import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Escrow release domain logic — shared by the web request path (which starts
 * the release clock on delivery) and the auto-release worker (apps/worker),
 * which sweeps for eligible holds on a timer (Engineering_Spec §6.4).
 *
 * State transitions are spec-faithful (Engineering_Spec §6.3):
 *   code verified → Order DELIVERED + scheduled_release_at = +24h (escrow HELD)
 *   window passes, no dispute → EscrowHold HELD → RELEASING
 *   RELEASING → RELEASED → driven by a real payout-provider webhook, which is
 *     §5 credential-blocked (Stripe / MTN MoMo / Orange Money). NOT done here.
 */

/** Dispute window after delivery before escrow becomes release-eligible. */
export const DISPUTE_WINDOW_MS = 24 * 3600 * 1000;

type Db = PrismaClient;

export interface ReleaseResult {
  releasedHoldIds: string[];
}

/**
 * Transition every release-eligible escrow hold for a DELIVERED order from
 * HELD → RELEASING. Eligible = state HELD (disputed holds are HELD_DISPUTED and
 * excluded) AND scheduled_release_at has passed. The per-hold write is
 * state-guarded (where state = 'HELD'), so it is idempotent under concurrency
 * and cannot release a hold that another transaction just disputed.
 *
 * It deliberately stops at RELEASING — RELEASING → RELEASED is driven by a real
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
      // committed after our findMany read it as HELD).
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

export interface ReleaseSweepResult {
  ordersProcessed: number;
  holdsReleased: number;
}

/**
 * Sweep the whole marketplace for release-eligible escrow and release each
 * eligible hold. This is what the auto-release worker calls on its interval.
 * Candidate discovery is a single indexed query; the actual transition runs
 * per-order through releaseEligibleEscrowForOrder so each order's release is
 * its own transaction (one slow/failed order can't roll back the others).
 */
export async function releaseAllEligibleEscrow(
  db: Db,
  args: { now?: Date; limit?: number } = {},
): Promise<ReleaseSweepResult> {
  const now = args.now ?? new Date();
  const limit = args.limit ?? 500;

  const due = await db.escrowHold.findMany({
    where: {
      state: 'HELD',
      scheduled_release_at: { lte: now },
      order: { status: 'DELIVERED' },
    },
    select: { order_id: true },
    take: limit,
  });

  const orderIds = [...new Set(due.map((h) => h.order_id))];
  let holdsReleased = 0;
  for (const orderId of orderIds) {
    const res = await releaseEligibleEscrowForOrder(db, { orderId, now });
    holdsReleased += res.releasedHoldIds.length;
  }

  return { ordersProcessed: orderIds.length, holdsReleased };
}
