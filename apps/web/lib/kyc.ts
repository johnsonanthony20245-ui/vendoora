import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * KYC review domain logic (Engineering_Spec §4.9 / RBAC §4.3).
 *
 * A Trust & Safety reviewer approves or denies a submitted KYC application.
 * Approving a SELLER application promotes the seller's KYC tier to the
 * application's target_tier — the observable change browse/search/PDP read off
 * `Seller.kyc_tier`. The core logic lives here (next/*-free, testable); the
 * admin Server Action wraps it with the auth gate.
 *
 * Capability tier-gating (e.g. listing caps per tier) is intentionally NOT here
 * yet: there is no seller product-management flow to gate. It's flagged to land
 * with that flow — gating an action that doesn't exist would be speculative.
 */

const MIN_DENY_NOTES = 10;

/** Application statuses a reviewer may still act on. */
const REVIEWABLE_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'NEEDS_MORE_INFO'] as const;

export type KycDecision = 'APPROVE' | 'DENY';
export type KycReviewFailure = 'not_found' | 'already_decided' | 'notes_required';

export type KycReviewResult =
  | { ok: true; applicationId: string; sellerId: string | null; newTier: number | null }
  | { ok: false; reason: KycReviewFailure };

type Db = PrismaClient;

function actorFields(reviewerUserId: string | null) {
  return reviewerUserId
    ? { actor_user_id: reviewerUserId, actor_system: false }
    : { actor_system: true };
}

/**
 * Approve or deny a KYC application.
 *
 * - APPROVE → application APPROVED (current_tier = target_tier); a SELLER
 *   applicant's seller is promoted (kyc_tier = target_tier, kyc_status APPROVED).
 * - DENY → application DENIED (notes required); a SELLER applicant's seller is
 *   marked kyc_status REJECTED; the tier is left unchanged.
 *
 * The status transition is a state-guarded updateMany (only from a reviewable
 * status), so two concurrent reviewers can't both decide the same application —
 * the loser gets `already_decided`.
 */
export async function reviewKycApplication(
  db: Db,
  args: {
    applicationId: string;
    decision: KycDecision;
    reviewerUserId?: string | null;
    notes?: string;
    now?: Date;
  },
): Promise<KycReviewResult> {
  const { applicationId, decision } = args;
  const reviewerUserId = args.reviewerUserId ?? null;
  const notes = (args.notes ?? '').trim();
  const now = args.now ?? new Date();

  if (decision === 'DENY' && notes.length < MIN_DENY_NOTES) {
    return { ok: false, reason: 'notes_required' };
  }

  const application = await db.kycApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      applicant_type: true,
      applicant_user_id: true,
      target_tier: true,
    },
  });
  if (!application) return { ok: false, reason: 'not_found' };

  const newStatus = decision === 'APPROVE' ? 'APPROVED' : 'DENIED';

  return db.$transaction(async (tx) => {
    // State-guarded transition: only succeeds from a still-reviewable status.
    const { count } = await tx.kycApplication.updateMany({
      where: { id: applicationId, status: { in: [...REVIEWABLE_STATUSES] } },
      data: {
        status: newStatus,
        review_completed_at: now,
        review_notes: notes.length > 0 ? notes : null,
        ...(reviewerUserId ? { reviewer_user_id: reviewerUserId } : {}),
        ...(decision === 'APPROVE' ? { current_tier: application.target_tier } : {}),
      },
    });
    if (count === 0) return { ok: false, reason: 'already_decided' };

    // Promote / reject the seller (SELLER applicants only — driver onboarding
    // is P7 and creates no KYC applications yet). The seller row can outlive
    // many applications, so the mutation is written defensively:
    //   - APPROVE never DOWNgrades: kyc_tier = max(current, target). Approving a
    //     stale lower-tier application can't lower a seller already higher.
    //   - DENY only rejects a seller that isn't already APPROVED. Denying an
    //     *upgrade* leaves an already-verified seller at their current tier
    //     rather than clobbering them to REJECTED.
    let sellerId: string | null = null;
    let sellerBefore: { kyc_tier: number; kyc_status: string } | null = null;
    let sellerAfter: { kyc_tier: number; kyc_status: string } | null = null;
    let resultTier: number | null = decision === 'APPROVE' ? application.target_tier : null;

    if (application.applicant_type === 'SELLER') {
      const seller = await tx.seller.findUnique({
        where: { user_id: application.applicant_user_id },
        select: { id: true, kyc_tier: true, kyc_status: true },
      });
      if (seller) {
        sellerId = seller.id;
        sellerBefore = { kyc_tier: seller.kyc_tier, kyc_status: seller.kyc_status };

        if (decision === 'APPROVE') {
          const promotedTier = Math.max(seller.kyc_tier, application.target_tier);
          resultTier = promotedTier;
          await tx.seller.update({
            where: { id: seller.id },
            data: {
              kyc_tier: promotedTier,
              kyc_status: 'APPROVED',
              ...(promotedTier > seller.kyc_tier ? { kyc_tier_promoted_at: now } : {}),
            },
          });
          sellerAfter = { kyc_tier: promotedTier, kyc_status: 'APPROVED' };
        } else if (seller.kyc_status !== 'APPROVED') {
          await tx.seller.update({
            where: { id: seller.id },
            data: { kyc_status: 'REJECTED' },
          });
          sellerAfter = { kyc_tier: seller.kyc_tier, kyc_status: 'REJECTED' };
        } else {
          // Denied upgrade for an already-approved seller — leave them be.
          sellerAfter = sellerBefore;
        }
      }
    }

    await tx.auditLog.create({
      data: {
        ...actorFields(reviewerUserId),
        action: decision === 'APPROVE' ? 'kyc.approved' : 'kyc.denied',
        resource_type: 'kyc_application',
        resource_id: applicationId,
        before_state: {
          status: application.status,
          seller_kyc_tier: sellerBefore?.kyc_tier ?? null,
          seller_kyc_status: sellerBefore?.kyc_status ?? null,
        } satisfies Prisma.InputJsonValue,
        after_state: {
          status: newStatus,
          target_tier: application.target_tier,
          seller_kyc_tier: sellerAfter?.kyc_tier ?? null,
          seller_kyc_status: sellerAfter?.kyc_status ?? null,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          applicant_type: application.applicant_type,
          seller_id: sellerId,
          seller_missing: application.applicant_type === 'SELLER' && sellerId === null,
          notes: notes.length > 0 ? notes : null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { ok: true, applicationId, sellerId, newTier: resultTier };
  });
}
