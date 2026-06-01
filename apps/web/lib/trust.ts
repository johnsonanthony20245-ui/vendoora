import { prisma } from '@vendoora/db';

/**
 * Live trust metrics for /trust-center — real DB aggregates that replace the
 * prototype's fabricated "$2.4M / 99.7% / 0.4%" illustrative constants. Figures
 * reflect actual marketplace state and grow with it.
 */
export interface TrustStats {
  /** USD held in escrow right now (active holds). */
  escrowHeldUsd: number;
  /**
   * Share of deliveries confirmed by the buyer's 6-digit code. 100 by design:
   * the delivery code is the ONLY transition into DELIVERED (enforced in the
   * order state machine + trust mechanic), so every delivery is code-verified.
   */
  codeVerifiedPct: number;
  /** Disputes as a percentage of all orders. */
  disputeRatePct: number;
  /** KYC-approved sellers as a percentage of all sellers. */
  sellersVerifiedPct: number;
}

export async function getTrustStats(): Promise<TrustStats> {
  const [escrowAgg, ordersTotal, disputesTotal, sellersTotal, sellersApproved] =
    await Promise.all([
      prisma.escrowHold.aggregate({
        _sum: { amount: true },
        where: { state: { in: ['HELD', 'HELD_DISPUTED', 'RELEASING'] } },
      }),
      prisma.order.count(),
      prisma.dispute.count(),
      prisma.seller.count({ where: { deleted_at: null } }),
      prisma.seller.count({ where: { deleted_at: null, kyc_status: 'APPROVED' } }),
    ]);

  const escrowHeldUsd = Number(escrowAgg._sum.amount ?? 0);
  const disputeRatePct =
    ordersTotal > 0 ? Math.round((disputesTotal / ordersTotal) * 1000) / 10 : 0;
  // Clamp to [0, 100]. The two counts (total + approved) are separate Prisma
  // statements and the Promise.all batches them at the network level but they
  // still snapshot independently under Read Committed, so a concurrent write
  // can briefly make the ratio exceed 1.0. Production stats should never
  // display >100% — the clamp is correct user-facing behavior.
  const sellersVerifiedPct =
    sellersTotal > 0
      ? Math.min(100, Math.round((sellersApproved / sellersTotal) * 100))
      : 100;

  return { escrowHeldUsd, codeVerifiedPct: 100, disputeRatePct, sellersVerifiedPct };
}
