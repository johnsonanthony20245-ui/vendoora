'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { confirmDeliveryByCode } from '../../lib/escrow';

/**
 * Driver-at-the-door delivery-code verification.
 *
 * The real mechanism (confirmDeliveryByCode) lives in lib/escrow.ts and is
 * fully tested. This Server Action is the thin transport wrapper.
 *
 * RBAC note (§5 deferred): in production only the *assigned driver* may call
 * this, enforced via driver auth + the Delivery assignment (P7). Until driver
 * auth exists the UI affordance that reaches this action is dev-gated on the
 * order page, so escrow can't be released by an unauthenticated buyer.
 */
export async function verifyDeliveryCodeAtDoor(formData: FormData): Promise<void> {
  const orderNumber = String(formData.get('orderNumber') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim();

  if (!orderNumber) redirect('/');

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    select: { id: true },
  });
  if (!order) redirect('/');

  const result = await confirmDeliveryByCode(prisma, { orderId: order.id, code });

  if (!result.ok) {
    const left = 'attemptsRemaining' in result ? result.attemptsRemaining : 0;
    redirect(`/orders/${orderNumber}?codeError=${result.reason}&left=${left}`);
  }

  revalidatePath(`/orders/${orderNumber}`);
  redirect(`/orders/${orderNumber}?codeOk=1`);
}
