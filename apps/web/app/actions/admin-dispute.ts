'use server';

import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { getAdminSession } from '../../lib/admin';

// Resolutions an admin can pick from the queue. Each maps the dispute into
// a terminal status + transitions the escrow holds + records an audit row.
export type AdminResolution =
  | 'FULL_REFUND_TO_BUYER'
  | 'PARTIAL_REFUND_TO_BUYER'
  | 'RELEASE_TO_SELLER'
  | 'INSURANCE_PAYOUT';

const VALID_RESOLUTIONS = new Set<AdminResolution>([
  'FULL_REFUND_TO_BUYER',
  'PARTIAL_REFUND_TO_BUYER',
  'RELEASE_TO_SELLER',
  'INSURANCE_PAYOUT',
]);

function failValidation(disputeNumber: string, message: string): never {
  redirect(
    `/admin/disputes/${disputeNumber}?error=${encodeURIComponent(message)}`,
  );
}

/**
 * Resolve a dispute on behalf of T&S.
 *
 * Inputs (form fields):
 *   disputeNumber    : the dispute being resolved
 *   resolution       : one of AdminResolution
 *   resolutionNotes  : free-text rationale (required, min 10 chars)
 *   partialAmount    : optional amount for PARTIAL_REFUND_TO_BUYER (decimal string)
 *
 * Effects (single $transaction):
 *   - Dispute.status            → RESOLVED_FAVOR_* / RESOLVED_PARTIAL / RESOLVED_INSURANCE
 *   - Dispute.resolution        → mirrors the picked enum
 *   - Dispute.resolved_at / by  → now / admin Clerk id (when present)
 *   - EscrowHold.state          → REFUNDED / PARTIALLY_REFUNDED / RELEASED / INSURANCE_PAYOUT
 *   - EscrowStateTransition row per hold
 *   - Order.status              → REFUNDED / COMPLETED based on the picked path
 *   - OrderStatusHistory entry
 *   - AuditLog entry            → action='dispute.resolved'
 */
export async function resolveDispute(formData: FormData): Promise<void> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin?error=not_authorized');

  const disputeNumber = String(formData.get('disputeNumber') ?? '').trim();
  if (!disputeNumber) redirect('/admin/disputes?error=missing_dispute');

  const resolution = String(formData.get('resolution') ?? '').trim() as AdminResolution;
  if (!VALID_RESOLUTIONS.has(resolution)) {
    failValidation(disputeNumber, 'Pick a valid resolution.');
  }

  const notes = String(formData.get('resolutionNotes') ?? '').trim();
  if (notes.length < 10) {
    failValidation(disputeNumber, 'Add at least 10 characters of resolution notes.');
  }

  const partialAmountRaw = String(formData.get('partialAmount') ?? '').trim();
  let partialAmount: number | null = null;
  if (resolution === 'PARTIAL_REFUND_TO_BUYER') {
    const parsed = Number(partialAmountRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      failValidation(disputeNumber, 'Partial-refund amount must be a positive number.');
    }
    partialAmount = parsed;
  }

  const dispute = await prisma.dispute.findUnique({
    where: { dispute_number: disputeNumber },
    include: {
      order: {
        include: { escrow_holds: true },
      },
    },
  });
  if (!dispute) failValidation(disputeNumber, 'Dispute not found.');

  if (
    dispute.status === 'RESOLVED_FAVOR_BUYER' ||
    dispute.status === 'RESOLVED_FAVOR_SELLER' ||
    dispute.status === 'RESOLVED_PARTIAL' ||
    dispute.status === 'RESOLVED_INSURANCE' ||
    dispute.status === 'CLOSED'
  ) {
    failValidation(disputeNumber, `Dispute is already ${dispute.status}.`);
  }

  // Map resolution → final EscrowState + Dispute.status + Order.status
  const escrowTarget: Record<AdminResolution, 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'RELEASED' | 'INSURANCE_PAYOUT'> = {
    FULL_REFUND_TO_BUYER: 'REFUNDED',
    PARTIAL_REFUND_TO_BUYER: 'PARTIALLY_REFUNDED',
    RELEASE_TO_SELLER: 'RELEASED',
    INSURANCE_PAYOUT: 'INSURANCE_PAYOUT',
  };
  const disputeStatusTarget: Record<AdminResolution, 'RESOLVED_FAVOR_BUYER' | 'RESOLVED_FAVOR_SELLER' | 'RESOLVED_PARTIAL' | 'RESOLVED_INSURANCE'> = {
    FULL_REFUND_TO_BUYER: 'RESOLVED_FAVOR_BUYER',
    PARTIAL_REFUND_TO_BUYER: 'RESOLVED_PARTIAL',
    RELEASE_TO_SELLER: 'RESOLVED_FAVOR_SELLER',
    INSURANCE_PAYOUT: 'RESOLVED_INSURANCE',
  };
  const orderStatusTarget: Record<AdminResolution, 'REFUNDED' | 'COMPLETED'> = {
    FULL_REFUND_TO_BUYER: 'REFUNDED',
    PARTIAL_REFUND_TO_BUYER: 'REFUNDED',
    RELEASE_TO_SELLER: 'COMPLETED',
    INSURANCE_PAYOUT: 'REFUNDED',
  };

  const resolvedAt = new Date();
  await prisma.$transaction(async (tx) => {
    // Transition every HELD_DISPUTED hold on this dispute.
    const disputedHolds = dispute.order.escrow_holds.filter(
      (h) => h.state === 'HELD_DISPUTED' && h.dispute_id === dispute.id,
    );

    for (const hold of disputedHolds) {
      const targetState = escrowTarget[resolution];
      await tx.escrowHold.update({
        where: { id: hold.id },
        data: {
          state: targetState,
          state_changed_at: resolvedAt,
          released_at: targetState === 'RELEASED' ? resolvedAt : null,
          released_amount: targetState === 'RELEASED' ? hold.amount : null,
          refunded_amount:
            targetState === 'REFUNDED'
              ? hold.amount
              : targetState === 'PARTIALLY_REFUNDED'
              ? partialAmount
              : null,
        },
      });
      await tx.escrowStateTransition.create({
        data: {
          escrow_hold_id: hold.id,
          from_state: 'HELD_DISPUTED',
          to_state: targetState,
          actor_user_id: admin.clerk_user_id,
          actor_system: false,
          reason: 'dispute_resolved',
          metadata: {
            resolution,
            dispute_id: dispute.id,
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    // Update the dispute.
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: disputeStatusTarget[resolution],
        resolution,
        resolution_amount: partialAmount,
        resolution_notes: notes,
        resolved_at: resolvedAt,
        resolved_by_user_id: admin.clerk_user_id,
      },
    });

    // Update the order.
    await tx.order.update({
      where: { id: dispute.order_id },
      data: {
        status: orderStatusTarget[resolution],
        status_updated_at: resolvedAt,
      },
    });
    await tx.orderStatusHistory.create({
      data: {
        order_id: dispute.order_id,
        from_status: dispute.order.status,
        to_status: orderStatusTarget[resolution],
        changed_by_user_id: admin.clerk_user_id,
        reason: 'dispute_resolved',
      },
    });

    // Audit log.
    await tx.auditLog.create({
      data: {
        actor_user_id: admin.clerk_user_id,
        actor_system: admin.clerk_user_id === null,
        action: 'dispute.resolved',
        resource_type: 'dispute',
        resource_id: dispute.id,
        before_state: {
          dispute_status: dispute.status,
          order_status: dispute.order.status,
        } satisfies Prisma.InputJsonValue,
        after_state: {
          dispute_status: disputeStatusTarget[resolution],
          order_status: orderStatusTarget[resolution],
          resolution,
          partial_amount: partialAmount,
          notes,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          dispute_number: disputeNumber,
          holds_transitioned: disputedHolds.length,
          admin_kind: admin.kind,
        } satisfies Prisma.InputJsonValue,
      },
    });
  });

  redirect(`/admin/disputes/${disputeNumber}?resolved=1`);
}
