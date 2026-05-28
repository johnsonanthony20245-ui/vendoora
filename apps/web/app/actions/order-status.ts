'use server';

import { revalidatePath } from 'next/cache';
import { prisma, type Prisma } from '@vendoora/db';
import { nextHappyStatus } from '../../lib/order-stage';

/**
 * DEV-ONLY happy-path stage advance. Lets you walk an order through
 * PAID → ACCEPTED → PREPARING → READY_FOR_PICKUP → PICKED_UP →
 * OUT_FOR_DELIVERY → ARRIVED → DELIVERED → COMPLETED for demo purposes.
 *
 * In production the real state transitions are driven by:
 * - Seller console actions (accept/prepare/ready) — P4
 * - Driver app actions (pickup / arrived / code entered) — P7
 * - Auto-release worker (DELIVERED → COMPLETED) — P3
 *
 * State-machine guards (concurrency-safe transitions with SELECT FOR
 * UPDATE, valid-transition validation) live in packages/domain/src/escrow/
 * — P3. This dev helper bypasses those because it only runs in dev.
 */
export async function advanceOrderStatus(formData: FormData): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('advanceOrderStatus is dev-only');
  }

  const orderNumber = String(formData.get('orderNumber') ?? '').trim();
  if (!orderNumber) return;

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    select: { id: true, status: true },
  });
  if (!order) return;

  const next = nextHappyStatus(order.status);
  if (!next) return; // already at the end or in a failure state

  // The DELIVERED transition is owned by the delivery-code mechanism
  // (verifyDeliveryCodeAtDoor → confirmDeliveryByCode). The dev shortcut must
  // not let an order reach DELIVERED — and thus start escrow release — without
  // a verified code. It walks the order only up to ARRIVED.
  if (next === 'DELIVERED') return;

  await prisma.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: next,
        status_updated_at: new Date(),
      },
    });

    await tx.orderStatusHistory.create({
      data: {
        order_id: order.id,
        from_status: order.status,
        to_status: next,
        changed_by_system: true,
        reason: 'dev_stage_advance',
      },
    });

    await tx.auditLog.create({
      data: {
        actor_system: true,
        action: 'order.status.advanced',
        resource_type: 'order',
        resource_id: order.id,
        before_state: { status: order.status } satisfies Prisma.InputJsonValue,
        after_state: { status: next } satisfies Prisma.InputJsonValue,
        metadata: { source: 'dev_stage_advance' } satisfies Prisma.InputJsonValue,
      },
    });
  });

  revalidatePath(`/orders/${orderNumber}`);
}
