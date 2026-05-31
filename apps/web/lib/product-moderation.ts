import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Product moderation domain logic. T&S reviews seller-created products and
 * approves them (DRAFT → PUBLISHED, moderation_status APPROVED, published_at
 * stamped) or rejects them (moderation_status REJECTED, notes required;
 * product stays DRAFT so the seller can edit and resubmit).
 *
 * Same shape as lib/kyc.reviewKycApplication: next/*-free + tested; the
 * Server-Action wrapper composes auth on top.
 */

const MIN_REJECT_NOTES = 10;

const REVIEWABLE_STATUSES = ['PENDING', 'FLAGGED'] as const;

export type ProductDecision = 'APPROVE' | 'REJECT';
export type ProductReviewFailure = 'not_found' | 'already_decided' | 'notes_required';

export type ProductReviewResult =
  | { ok: true; productId: string; published: boolean }
  | { ok: false; reason: ProductReviewFailure };

type Db = PrismaClient;

function actorFields(reviewerUserId: string | null) {
  return reviewerUserId
    ? { actor_user_id: reviewerUserId, actor_system: false }
    : { actor_system: true };
}

export async function reviewProduct(
  db: Db,
  args: {
    productId: string;
    decision: ProductDecision;
    reviewerUserId?: string | null;
    notes?: string;
    now?: Date;
  },
): Promise<ProductReviewResult> {
  const { productId, decision } = args;
  const reviewerUserId = args.reviewerUserId ?? null;
  const notes = (args.notes ?? '').trim();
  const now = args.now ?? new Date();

  if (decision === 'REJECT' && notes.length < MIN_REJECT_NOTES) {
    return { ok: false, reason: 'notes_required' };
  }

  const product = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, status: true, moderation_status: true },
  });
  if (!product) return { ok: false, reason: 'not_found' };

  // State-guarded transition: only review a product whose moderation status is
  // still reviewable. Concurrent reviewers can't both decide one product — the
  // loser sees `already_decided`. (Same pattern as the escrow + KYC reviews.)
  const newModeration = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
  const goLive = decision === 'APPROVE';

  return db.$transaction(async (tx) => {
    const { count } = await tx.product.updateMany({
      where: { id: productId, moderation_status: { in: [...REVIEWABLE_STATUSES] } },
      data: {
        moderation_status: newModeration,
        ...(goLive
          ? { status: 'PUBLISHED' as const, published_at: now }
          : {}),
      },
    });
    if (count === 0) return { ok: false, reason: 'already_decided' };

    await tx.auditLog.create({
      data: {
        ...actorFields(reviewerUserId),
        action: decision === 'APPROVE' ? 'product.approved' : 'product.rejected',
        resource_type: 'product',
        resource_id: productId,
        before_state: {
          status: product.status,
          moderation_status: product.moderation_status,
        } satisfies Prisma.InputJsonValue,
        after_state: {
          status: goLive ? 'PUBLISHED' : product.status,
          moderation_status: newModeration,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          notes: notes.length > 0 ? notes : null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { ok: true, productId, published: goLive };
  });
}
