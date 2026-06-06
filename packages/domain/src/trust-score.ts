import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Buyer trust score (Engineering_Spec §5.1.12). An internal 0-100 score, hidden
 * from the user, that later tunes fraud-detection thresholds. New buyers start at
 * the neutral 50; the score is then a function of the buyer's payment-success
 * rate, dispute rate, and return rate over their settled orders.
 *
 * Formula (documented + tunable — could move to PlatformConfig):
 *   score = 50 + 30·payment_success_rate − 40·dispute_rate − 20·return_rate
 * clamped to [0,100]. "Settled" = orders past payment (status not in
 * PENDING_PAYMENT / EXPIRED / CANCELLED); the dispute/return rates are over that
 * denominator. A buyer with no orders is the neutral base (50).
 */

type Db = PrismaClient;

const BASE = 50;
const PAYMENT_SUCCESS_WEIGHT = 30;
const DISPUTE_WEIGHT = 40;
const RETURN_WEIGHT = 20;

/** Order statuses that never represent a completed payment by the buyer. */
const UNSETTLED_STATUSES = ['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'] as const;

export interface TrustScoreResult {
  userId: string;
  score: number;
  totalOrders: number;
  settledOrders: number;
  disputedOrders: number;
  refundedOrders: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Recompute and persist a buyer's trust score from their order/dispute history.
 * Writes users.trust_score and an audit row; returns the score + the inputs.
 */
export async function recomputeBuyerTrustScore(db: Db, userId: string): Promise<TrustScoreResult> {
  const [totalOrders, settledOrders, refundedOrders, disputedOrders] = await Promise.all([
    db.order.count({ where: { buyer_user_id: userId } }),
    db.order.count({ where: { buyer_user_id: userId, status: { notIn: [...UNSETTLED_STATUSES] } } }),
    db.order.count({ where: { buyer_user_id: userId, status: 'REFUNDED' } }),
    db.dispute.count({ where: { order: { buyer_user_id: userId } } }),
  ]);

  let score: number;
  if (totalOrders === 0) {
    score = BASE; // no history → neutral
  } else {
    const paymentSuccessRate = settledOrders / totalOrders;
    // Dispute/return rates are only meaningful over settled orders. With zero
    // settled orders they contribute nothing — a dispute filed against an
    // unsettled (PENDING/EXPIRED/CANCELLED) order must not be divided by an
    // empty denominator and slam the score.
    const disputeRate = settledOrders > 0 ? Math.min(1, disputedOrders / settledOrders) : 0;
    const returnRate = settledOrders > 0 ? Math.min(1, refundedOrders / settledOrders) : 0;
    score = clamp(
      Math.round(
        BASE +
          PAYMENT_SUCCESS_WEIGHT * paymentSuccessRate -
          DISPUTE_WEIGHT * disputeRate -
          RETURN_WEIGHT * returnRate,
      ),
      0,
      100,
    );
  }

  // Persist the score + audit row atomically (matches escrow.ts / insurance.ts).
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { trust_score: score } }),
    db.auditLog.create({
      data: {
        actor_system: true,
        action: 'user.trust_score.recomputed',
        resource_type: 'user',
        resource_id: userId,
        after_state: {
          trust_score: score,
          total_orders: totalOrders,
          settled_orders: settledOrders,
          disputed_orders: disputedOrders,
          refunded_orders: refundedOrders,
        } satisfies Prisma.InputJsonValue,
      },
    }),
  ]);

  return { userId, score, totalOrders, settledOrders, disputedOrders, refundedOrders };
}
