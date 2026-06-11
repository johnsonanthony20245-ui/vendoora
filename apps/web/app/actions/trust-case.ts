'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { prisma } from '@vendoora/db';
import { resolveTrustCase, type TrustResolutionAction } from '@vendoora/domain';
import { getAdminSession } from '../../lib/admin';

const RESOLUTIONS: TrustResolutionAction[] = [
  'NO_ACTION_TAKEN',
  'WARNING_ISSUED',
  'SUSPENDED_TEMPORARY',
  'SUSPENDED_PERMANENT',
  'REFUND_ISSUED',
  'INSURANCE_PAYOUT',
  'RESTORED',
];

/**
 * T&S admin resolves a trust case from the detail page. Auth-gated; the acting
 * admin id is recorded by resolveTrustCase in the audit trail. Errors come back
 * as ?error=<reason> on the detail page; success as ?resolved=1.
 */
export async function resolveTrustCaseAction(formData: FormData): Promise<void> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin?error=not_authorized');

  const caseNumber = String(formData.get('caseNumber') ?? '').trim();
  const caseId = String(formData.get('caseId') ?? '').trim();
  const back = caseNumber
    ? `/admin/trust-cases/${encodeURIComponent(caseNumber)}`
    : '/admin/trust-cases';
  if (!caseId) redirect(`${back}?error=missing_case`);

  const resolution = String(formData.get('resolution') ?? '').trim() as TrustResolutionAction;
  if (!RESOLUTIONS.includes(resolution)) redirect(`${back}?error=invalid_resolution`);

  const summary = String(formData.get('summary') ?? '').trim();
  if (summary.length < 10) redirect(`${back}?error=short_summary`);

  const result = await resolveTrustCase(prisma, {
    caseId,
    resolution,
    summary,
    actorUserId: admin.clerk_user_id ?? 'dev-admin',
  });
  if (!result.ok) redirect(`${back}?error=${result.reason}`);

  revalidatePath('/admin/trust-cases');
  revalidatePath(back);
  redirect(`${back}?resolved=1`);
}
