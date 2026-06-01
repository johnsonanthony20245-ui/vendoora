import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../../lib/admin';
import { reviewKyc, uploadKycDocument } from '../../../actions/admin-kyc';
import { IS_R2_ENABLED, getDownloadUrl } from '../../../../lib/r2';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `KYC application — ${BRAND_NAME}`,
};

const ERROR_COPY: Record<string, string> = {
  already_decided: 'This application was already decided by another reviewer.',
  not_found: 'Application not found.',
  notes_required: 'Add at least 10 characters of review notes to deny.',
  bad_decision: 'Pick a valid decision.',
};

const UPLOAD_ERROR_COPY: Record<string, string> = {
  bad_doc_type: 'Pick a valid document type.',
  bad_application: 'Application not found.',
  missing_file: 'Choose a file to upload.',
  bad_mime: 'Only JPEG, PNG, WebP, or PDF files are accepted.',
  mime_mismatch:
    "The file's actual contents don't match its declared type. Re-export from the source app and try again.",
  too_large: 'File is larger than 10 MB.',
  r2_not_configured: 'Document upload is not configured in this environment.',
  db_write_failed:
    'The file was uploaded but could not be recorded. The orphan was cleaned up — please try again.',
};

const DOC_TYPE_OPTIONS = [
  'GOVERNMENT_ID',
  'SELFIE',
  'PROOF_OF_ADDRESS',
  'BUSINESS_REGISTRATION',
  'TAX_CERTIFICATE',
  'BANK_STATEMENT',
  'DRIVER_LICENSE',
  'VEHICLE_REGISTRATION',
  'OTHER',
] as const;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    reviewed?: string;
    uploaded?: string;
    upload_error?: string;
  }>;
}

export default async function AdminKycDetailPage({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const { id } = await params;
  const sp = await searchParams;

  const application = await prisma.kycApplication.findUnique({
    where: { id },
    include: {
      applicant: { select: { full_name: true, email: true, phone: true } },
      documents: { orderBy: { uploaded_at: 'asc' } },
    },
  });
  if (!application) notFound();

  // KycApplication has no direct relation to Seller — look it up by applicant.
  const seller =
    application.applicant_type === 'SELLER'
      ? await prisma.seller.findUnique({
          where: { user_id: application.applicant_user_id },
          select: {
            business_name: true,
            business_slug: true,
            kyc_tier: true,
            kyc_status: true,
            business_type: true,
          },
        })
      : null;

  const decided = ['APPROVED', 'DENIED', 'EXPIRED'].includes(application.status);

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/kyc" className="text-xs font-semibold text-blue-700 hover:underline">
          ← KYC queue
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-neutral-900">
          {application.applicant.full_name}
        </h1>
        <p className="mt-1 text-sm text-neutral-600">
          {application.applicant_type} · requesting{' '}
          <strong>Tier {application.target_tier}</strong> (currently Tier {application.current_tier})
        </p>

        {sp.reviewed && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            Application {sp.reviewed === 'approve' ? 'approved' : 'denied'}.
          </div>
        )}
        {sp.error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {ERROR_COPY[sp.error] ?? 'Could not complete the review.'}
          </div>
        )}
        {sp.uploaded && (
          <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            Document uploaded.
          </div>
        )}
        {sp.upload_error && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {UPLOAD_ERROR_COPY[sp.upload_error] ?? 'Upload failed.'}
          </div>
        )}

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <Panel title="Applicant">
            <Row label="Name" value={application.applicant.full_name} />
            <Row label="Email" value={application.applicant.email} />
            <Row label="Phone" value={application.applicant.phone ?? '—'} />
            <Row label="Status" value={application.status.replace(/_/g, ' ')} />
          </Panel>
          <Panel title="Seller">
            {seller ? (
              <>
                <Row label="Business" value={seller.business_name} />
                <Row label="Type" value={seller.business_type.replace(/_/g, ' ')} />
                <Row label="Current tier" value={`T${seller.kyc_tier}`} />
                <Row label="KYC status" value={seller.kyc_status.replace(/_/g, ' ')} />
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                No seller record linked to this applicant.
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Documents" className="mt-6">
          {application.documents.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No documents uploaded yet.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {await Promise.all(
                application.documents.map(async (d) => {
                  // 120s default TTL + Content-Disposition: attachment (lib/r2)
                  // so leaked URLs expire fast and the browser downloads rather
                  // than rendering the PII inline.
                  const downloadUrl = IS_R2_ENABLED
                    ? await getDownloadUrl(d.storage_url, { fileName: d.file_name })
                    : null;
                  return (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 border-b border-neutral-100 pb-2 last:border-0 last:pb-0"
                    >
                      <div className="text-neutral-800">
                        <div className="font-medium">
                          {d.doc_type.replace(/_/g, ' ')}
                        </div>
                        {downloadUrl ? (
                          <a
                            href={downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-700 hover:underline"
                          >
                            {d.file_name}
                          </a>
                        ) : (
                          <span className="text-xs text-neutral-500">{d.file_name}</span>
                        )}
                        <span className="ml-2 text-xs text-neutral-500">
                          {formatBytes(d.file_size_bytes)}
                        </span>
                      </div>
                      <span className="text-xs text-neutral-500">{d.status.replace(/_/g, ' ')}</span>
                    </li>
                  );
                }),
              )}
            </ul>
          )}

          {IS_R2_ENABLED ? (
            <form
              action={uploadKycDocument}
              encType="multipart/form-data"
              className="mt-4 border-t border-neutral-200 pt-4"
            >
              <input type="hidden" name="applicationId" value={application.id} />
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[160px]">
                  <label htmlFor="doc_type" className="block text-xs font-bold uppercase tracking-widest text-neutral-600">
                    Document type
                  </label>
                  <select
                    id="doc_type"
                    name="doc_type"
                    defaultValue="GOVERNMENT_ID"
                    className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-2 py-1.5 text-sm"
                  >
                    {DOC_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label htmlFor="file" className="block text-xs font-bold uppercase tracking-widest text-neutral-600">
                    File <span className="font-normal normal-case text-neutral-400">(JPEG / PNG / WebP / PDF, ≤ 10 MB)</span>
                  </label>
                  <input
                    id="file"
                    name="file"
                    type="file"
                    required
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="mt-1 w-full text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
                >
                  Upload
                </button>
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                File streams through this Server Action straight to Cloudflare R2 (private bucket).
                Download links above are short-lived presigned URLs.
              </p>
            </form>
          ) : (
            <p className="mt-3 text-xs text-amber-700">
              Document upload is disabled — Cloudflare R2 is not configured.
            </p>
          )}
        </Panel>

        {/* Review action */}
        {decided ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-sm text-neutral-600">
            This application is <strong>{application.status.replace(/_/g, ' ')}</strong>
            {application.review_completed_at
              ? ` (decided ${application.review_completed_at.toISOString().slice(0, 16).replace('T', ' ')})`
              : ''}
            .{application.review_notes ? ` Notes: ${application.review_notes}` : ''}
          </div>
        ) : (
          <form
            action={reviewKyc}
            className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
          >
            <input type="hidden" name="applicationId" value={application.id} />
            <label
              htmlFor="notes"
              className="text-xs font-bold uppercase tracking-widest text-neutral-600"
            >
              Review notes <span className="font-normal normal-case text-neutral-400">(required to deny)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              placeholder="What did you verify? For a denial, say what was wrong."
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="submit"
                name="decision"
                value="APPROVE"
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-emerald-700"
              >
                Approve &amp; promote to Tier {application.target_tier}
              </button>
              <button
                type="submit"
                name="decision"
                value="DENY"
                className="rounded-lg border border-red-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
              >
                Deny
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

function Panel({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-neutral-0 p-6 ${className}`}>
      <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className="font-medium text-neutral-900">{value}</span>
    </div>
  );
}
