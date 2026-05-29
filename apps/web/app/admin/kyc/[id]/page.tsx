import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../../lib/admin';
import { reviewKyc } from '../../../actions/admin-kyc';

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

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; reviewed?: string }>;
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
              No documents uploaded. The applicant-facing document upload requires Cloudflare
              R2 storage (flagged §5) — until then T1 (phone + email verified at signup) is
              reviewed without uploads.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {application.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3">
                  <span className="text-neutral-800">
                    {d.doc_type.replace(/_/g, ' ')} · {d.file_name}
                  </span>
                  <span className="text-xs text-neutral-500">{d.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
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
