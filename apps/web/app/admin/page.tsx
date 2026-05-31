import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Admin — ${BRAND_NAME}`,
};

export default async function AdminLanding() {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const [
    openCount,
    breachedCount,
    totalDisputes,
    kycPendingCount,
    productsPendingCount,
  ] = await Promise.all([
    prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW', 'PENDING_BUYER', 'PENDING_SELLER', 'ESCALATED'] } } }),
    prisma.dispute.count({ where: { sla_breached: true, status: { not: { in: ['RESOLVED_FAVOR_BUYER', 'RESOLVED_FAVOR_SELLER', 'RESOLVED_PARTIAL', 'RESOLVED_INSURANCE', 'CLOSED'] } } } }),
    prisma.dispute.count(),
    prisma.kycApplication.count({ where: { status: { in: ['SUBMITTED', 'IN_REVIEW', 'NEEDS_MORE_INFO'] } } }),
    // Reviewable = PENDING (fresh seller submission) + FLAGGED (re-review).
    // Matches /admin/products's PENDING_STATUSES + flagged filter.
    prisma.product.count({
      where: {
        moderation_status: { in: ['PENDING', 'FLAGGED'] },
        deleted_at: null,
      },
    }),
  ]);

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          Trust &amp; Safety admin
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Welcome.</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {admin.kind === 'clerk'
            ? `Signed in as ${admin.clerk_user_id}.`
            : 'Dev session via the vdr_admin_dev cookie. Production requires Clerk + ADMIN_CLERK_USER_IDS.'}
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-5">
          <StatCard label="Disputes — open" value={openCount} tone="amber" />
          <StatCard label="SLA breached" value={breachedCount} tone="red" />
          <StatCard label="KYC — pending" value={kycPendingCount} tone="amber" />
          <StatCard label="Products — pending" value={productsPendingCount} tone="amber" />
          <StatCard label="Disputes — all-time" value={totalDisputes} tone="blue" />
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/admin/disputes"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            Open dispute queue →
          </Link>
          <Link
            href="/admin/kyc"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            KYC review queue →
          </Link>
          <Link
            href="/admin/products"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            Product moderation queue →
          </Link>
          <Link
            href="/admin/search-insights"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Search insights
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'amber' | 'red' | 'blue';
}) {
  const tones: Record<typeof tone, string> = {
    amber: 'border-amber-200 bg-amber-50',
    red: 'border-red-200 bg-red-50',
    blue: 'border-blue-200 bg-blue-50',
  };
  const text: Record<typeof tone, string> = {
    amber: 'text-amber-900',
    red: 'text-red-900',
    blue: 'text-blue-900',
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-5`}>
      <div className={`text-3xl font-bold ${text[tone]}`}>{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-600">
        {label}
      </div>
    </div>
  );
}
