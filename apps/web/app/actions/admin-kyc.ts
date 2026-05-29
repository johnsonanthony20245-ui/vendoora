'use server';

import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { getAdminSession } from '../../lib/admin';
import { reviewKycApplication, type KycDecision } from '../../lib/kyc';

/**
 * Approve or deny a KYC application on behalf of Trust & Safety.
 *
 * Auth: getAdminSession() (Clerk allowlist in prod, dev cookie otherwise).
 * The real review logic + tier promotion is in lib/kyc.ts and is tested
 * against the DB; this is the thin transport + auth wrapper.
 */
export async function reviewKyc(formData: FormData): Promise<void> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const applicationId = String(formData.get('applicationId') ?? '').trim();
  if (!applicationId) redirect('/admin/kyc?error=missing_application');

  const decisionRaw = String(formData.get('decision') ?? '').trim();
  if (decisionRaw !== 'APPROVE' && decisionRaw !== 'DENY') {
    redirect(`/admin/kyc/${applicationId}?error=bad_decision`);
  }
  const decision = decisionRaw as KycDecision;
  const notes = String(formData.get('notes') ?? '').trim();

  // KycApplication.reviewer_user_id is a FK to User — resolve the admin's
  // Vendoora user id from their Clerk id (null in the dev-cookie path).
  let reviewerUserId: string | null = null;
  if (admin.kind === 'clerk' && admin.clerk_user_id) {
    const reviewer = await prisma.user.findUnique({
      where: { clerk_id: admin.clerk_user_id },
      select: { id: true },
    });
    reviewerUserId = reviewer?.id ?? null;
  }

  const result = await reviewKycApplication(prisma, {
    applicationId,
    decision,
    notes,
    reviewerUserId,
  });

  if (!result.ok) {
    redirect(`/admin/kyc/${applicationId}?error=${result.reason}`);
  }
  redirect(`/admin/kyc/${applicationId}?reviewed=${decision.toLowerCase()}`);
}
