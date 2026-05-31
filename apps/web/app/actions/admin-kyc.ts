'use server';

import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { getAdminSession } from '../../lib/admin';
import { reviewKycApplication, type KycDecision } from '../../lib/kyc';
import { IS_R2_ENABLED, uploadObject, deleteObject } from '../../lib/r2';

/** Cuid v1/v2 plus uuid — what Prisma @default(cuid()) produces. */
const ID_RE = /^[A-Za-z0-9_-]{20,40}$/;

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
  // The Clerk id ALSO rides through into audit metadata so a missing
  // User-row sync doesn't anonymize the decision into actor_system. Same
  // pattern as uploadKycDocument and moderateProduct.
  let reviewerUserId: string | null = null;
  const actorClerkId = admin.kind === 'clerk' ? admin.clerk_user_id : null;
  if (actorClerkId) {
    const reviewer = await prisma.user.findUnique({
      where: { clerk_id: actorClerkId },
      select: { id: true },
    });
    reviewerUserId = reviewer?.id ?? null;
  }

  const result = await reviewKycApplication(prisma, {
    applicationId,
    decision,
    notes,
    reviewerUserId,
    actorClerkId,
  });

  if (!result.ok) {
    redirect(`/admin/kyc/${applicationId}?error=${result.reason}`);
  }
  redirect(`/admin/kyc/${applicationId}?reviewed=${decision.toLowerCase()}`);
}

const KYC_DOC_TYPES = new Set([
  'GOVERNMENT_ID',
  'SELFIE',
  'PROOF_OF_ADDRESS',
  'BUSINESS_REGISTRATION',
  'TAX_CERTIFICATE',
  'BANK_STATEMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'OTHER',
] as const);
type KycDocType = typeof KYC_DOC_TYPES extends Set<infer T> ? T : never;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Upload a KYC document to Cloudflare R2 on behalf of the applicant and record
 * a KycDocument row linked to the application. Admin-gated (same gate as
 * reviewKyc); the applicant-facing upload UI is a separate slice.
 *
 * File goes through this Server Action (multipart form data) and is streamed
 * straight to R2 — KYC docs aren't high-volume and don't need browser→R2
 * presigned PUTs.
 */
export async function uploadKycDocument(formData: FormData): Promise<void> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const applicationId = String(formData.get('applicationId') ?? '').trim();
  // Shape-check before anything else so a tampered hidden field can't be
  // interpolated into an R2 object key or used to spam DB lookups.
  if (!applicationId || !ID_RE.test(applicationId)) {
    redirect('/admin/kyc?error=missing_application');
  }

  const docTypeRaw = String(formData.get('doc_type') ?? '').trim();
  if (!KYC_DOC_TYPES.has(docTypeRaw as KycDocType)) {
    redirect(`/admin/kyc/${applicationId}?upload_error=bad_doc_type`);
  }
  const docType = docTypeRaw as KycDocType;

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    redirect(`/admin/kyc/${applicationId}?upload_error=missing_file`);
  }
  if (!ALLOWED_MIME.has(file.type)) {
    redirect(`/admin/kyc/${applicationId}?upload_error=bad_mime`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`/admin/kyc/${applicationId}?upload_error=too_large`);
  }

  if (!IS_R2_ENABLED) {
    redirect(`/admin/kyc/${applicationId}?upload_error=r2_not_configured`);
  }

  // Existence check BEFORE the R2 PUT: a non-existent or malformed id would
  // otherwise leave bytes stranded in R2 with no DB row pointing at them.
  const application = await prisma.kycApplication.findUnique({
    where: { id: applicationId },
    select: { id: true },
  });
  if (!application) {
    redirect(`/admin/kyc/${applicationId}?upload_error=bad_application`);
  }

  // Resolve actor User.id from Clerk id (same pattern as reviewKyc). The Clerk
  // id is always recorded in audit metadata too, so a missing User-row sync
  // doesn't anonymize the action.
  let actorUserId: string | null = null;
  const actorClerkId = admin.kind === 'clerk' ? admin.clerk_user_id : null;
  if (actorClerkId) {
    const reviewer = await prisma.user.findUnique({
      where: { clerk_id: actorClerkId },
      select: { id: true },
    });
    actorUserId = reviewer?.id ?? null;
  }

  const safeFileName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120);
  const objectKey = `kyc/${applicationId}/${docType.toLowerCase()}/${randomUUID()}-${safeFileName}`;

  const bytes = Buffer.from(await file.arrayBuffer());
  await uploadObject({
    key: objectKey,
    body: bytes,
    contentType: file.type,
    contentLength: file.size,
  });

  // Best-effort cleanup on DB failure so we never leak orphaned KYC PII in R2.
  let dbOk = false;
  try {
    await prisma.$transaction(async (tx) => {
      const doc = await tx.kycDocument.create({
        data: {
          kyc_application_id: applicationId,
          doc_type: docType,
          // We store the object KEY in storage_url; the admin page mints a
          // short-lived presigned GET URL per render so the bucket stays private.
          storage_url: objectKey,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type,
          status: 'UPLOADED',
        },
      });
      await tx.auditLog.create({
        data: {
          ...(actorUserId
            ? { actor_user_id: actorUserId, actor_system: false }
            : { actor_system: actorClerkId === null }),
          action: 'kyc.document.uploaded',
          resource_type: 'kyc_document',
          resource_id: doc.id,
          metadata: {
            kyc_application_id: applicationId,
            doc_type: docType,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            object_key: objectKey,
            actor_clerk_id: actorClerkId,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });
    dbOk = true;
  } catch {
    // DB write failed (FK violation, conn blip, etc.) — clean up the orphan
    // bytes in R2 so we don't leak PII. Best-effort: a delete failure here is
    // worse than the upload failure itself, so we swallow it.
    try {
      await deleteObject(objectKey);
    } catch {
      /* swallowed by design */
    }
  }
  if (!dbOk) {
    redirect(`/admin/kyc/${applicationId}?upload_error=db_write_failed`);
  }
  redirect(`/admin/kyc/${applicationId}?uploaded=1`);
}
