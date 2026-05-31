'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { getAdminSession } from '../../lib/admin';
import { reviewProduct, type ProductDecision } from '../../lib/product-moderation';

/**
 * Approve or reject a draft product on behalf of Trust & Safety. The real
 * moderation logic + state-guarded transition lives in lib/product-moderation
 * and is tested; this is the thin transport + auth wrapper.
 */
export async function moderateProduct(formData: FormData): Promise<void> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const productId = String(formData.get('productId') ?? '').trim();
  if (!productId) redirect('/admin/products?error=missing_product');

  const decisionRaw = String(formData.get('decision') ?? '').trim();
  if (decisionRaw !== 'APPROVE' && decisionRaw !== 'REJECT') {
    redirect(`/admin/products/${productId}?error=bad_decision`);
  }
  const decision = decisionRaw as ProductDecision;
  const notes = String(formData.get('notes') ?? '').trim();

  // Resolve reviewer's Vendoora User.id from Clerk id (FK on auditLog).
  let reviewerUserId: string | null = null;
  if (admin.kind === 'clerk' && admin.clerk_user_id) {
    const reviewer = await prisma.user.findUnique({
      where: { clerk_id: admin.clerk_user_id },
      select: { id: true },
    });
    reviewerUserId = reviewer?.id ?? null;
  }

  const result = await reviewProduct(prisma, {
    productId,
    decision,
    notes,
    reviewerUserId,
  });

  if (!result.ok) {
    redirect(`/admin/products/${productId}?error=${result.reason}`);
  }
  redirect(`/admin/products/${productId}?reviewed=${decision.toLowerCase()}`);
}
