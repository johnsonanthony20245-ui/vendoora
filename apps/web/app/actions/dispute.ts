'use server';

import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma, type Prisma } from '@vendoora/db';
import { isOrderDisputable, type DisputeCategoryValue } from '../../lib/dispute-helpers';

const ALLOWED_CATEGORIES = new Set<DisputeCategoryValue>([
  'NOT_RECEIVED',
  'DAMAGED',
  'WRONG_ITEM',
  'COUNTERFEIT',
  'QUALITY_ISSUE',
  'IN_TRANSIT_DAMAGE',
  'OTHER',
]);

const SLA_HOURS = 48;

function failValidation(orderNumber: string, message: string): never {
  redirect(`/orders/${orderNumber}/dispute?error=${encodeURIComponent(message)}`);
}

/**
 * Open a dispute on an order. Writes Dispute + transitions all HELD escrow
 * holds to HELD_DISPUTED + transitions Order.status to DISPUTED + writes audit.
 *
 * No auth yet — anyone with the order_number URL can open a dispute. This
 * matches the rest of the no-auth buyer surface; tighten when Clerk lands.
 *
 * T&S resolution actions (FULL_REFUND_TO_BUYER, RELEASE_TO_SELLER,
 * INSURANCE_PAYOUT) live in the admin surface (P6). This action only opens.
 */
export async function createDispute(formData: FormData): Promise<void> {
  const orderNumber = String(formData.get('orderNumber') ?? '').trim();
  if (!orderNumber) redirect('/?error=missing_order');

  const category = String(formData.get('category') ?? '').trim() as DisputeCategoryValue;
  const description = String(formData.get('description') ?? '').trim();

  if (!ALLOWED_CATEGORIES.has(category)) {
    failValidation(orderNumber, 'Please choose a category.');
  }
  if (description.length < 20) {
    failValidation(
      orderNumber,
      'Please describe what happened in at least 20 characters so T&S can investigate.',
    );
  }

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    include: { escrow_holds: true },
  });
  if (!order) failValidation(orderNumber, 'Order not found.');

  if (!isOrderDisputable(order.status)) {
    failValidation(orderNumber, `Orders in status ${order.status} cannot be disputed.`);
  }
  if (order.status === 'DISPUTED') {
    failValidation(orderNumber, 'A dispute is already open on this order.');
  }

  const dispute_number = `VDR-DIS-${randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()}`;
  const sla_due_at = new Date(Date.now() + SLA_HOURS * 60 * 60 * 1000);

  const created = await prisma.$transaction(async (tx) => {
    // ---- Dispute ----
    const dispute = await tx.dispute.create({
      data: {
        dispute_number,
        order_id: order.id,
        initiated_by_user_id: order.buyer_user_id,
        category,
        reason: 'BUYER_INITIATED',
        description,
        status: 'OPEN',
        sla_due_at,
        sla_breached: false,
      },
    });

    // ---- Initial DisputeMessage from the buyer (mirrors the description) ----
    await tx.disputeMessage.create({
      data: {
        dispute_id: dispute.id,
        author_user_id: order.buyer_user_id,
        author_type: 'BUYER',
        body: description,
        is_internal: false,
      },
    });

    // ---- Transition all HELD escrow holds → HELD_DISPUTED, link to dispute ----
    for (const hold of order.escrow_holds) {
      if (hold.state !== 'HELD') continue;
      await tx.escrowHold.update({
        where: { id: hold.id },
        data: {
          state: 'HELD_DISPUTED',
          state_changed_at: new Date(),
          dispute_id: dispute.id,
        },
      });
      await tx.escrowStateTransition.create({
        data: {
          escrow_hold_id: hold.id,
          from_state: 'HELD',
          to_state: 'HELD_DISPUTED',
          actor_user_id: order.buyer_user_id,
          actor_system: false,
          reason: 'dispute_opened',
          metadata: { dispute_id: dispute.id } satisfies Prisma.InputJsonValue,
        },
      });
    }

    // ---- Transition Order.status → DISPUTED ----
    await tx.order.update({
      where: { id: order.id },
      data: { status: 'DISPUTED', status_updated_at: new Date() },
    });
    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        from_status: order.status,
        to_status: 'DISPUTED',
        changed_by_user_id: order.buyer_user_id,
        reason: 'dispute_opened',
      },
    });

    // ---- Audit log (Build_Prompt §10.4) ----
    await tx.auditLog.create({
      data: {
        actor_user_id: order.buyer_user_id,
        actor_system: false,
        action: 'dispute.opened',
        resource_type: 'dispute',
        resource_id: dispute.id,
        after_state: {
          dispute_number,
          order_number: order.order_number,
          category,
          sla_due_at: sla_due_at.toISOString(),
        } satisfies Prisma.InputJsonValue,
        metadata: {
          order_id: order.id,
          escrow_holds_transitioned: order.escrow_holds.filter((h) => h.state === 'HELD').length,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { dispute_number };
  });

  redirect(`/disputes/${created.dispute_number}`);
}
