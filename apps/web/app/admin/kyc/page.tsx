import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `KYC review queue — ${BRAND_NAME}`,
};

type StatusFilter = 'pending' | 'decided' | 'all';

const PENDING_STATUSES = ['SUBMITTED', 'IN_REVIEW', 'NEEDS_MORE_INFO'] as const;
const DECIDED_STATUSES = ['APPROVED', 'DENIED', 'EXPIRED'] as const;

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminKycPage({ searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const sp = await searchParams;
  const filter: StatusFilter =
    sp.filter === 'decided' ? 'decided' : sp.filter === 'all' ? 'all' : 'pending';

  const where: Prisma.KycApplicationWhereInput =
    filter === 'pending'
      ? { status: { in: [...PENDING_STATUSES] } }
      : filter === 'decided'
        ? { status: { in: [...DECIDED_STATUSES] } }
        : {};

  const applications = await prisma.kycApplication.findMany({
    where,
    orderBy: [{ submitted_at: 'asc' }, { created_at: 'asc' }],
    take: 100,
    include: { applicant: { select: { full_name: true, email: true } } },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">T&amp;S queue</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">KYC review</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Oldest submission first. Approving promotes the applicant&apos;s verification tier.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip label="Pending" current={filter} value="pending" />
          <FilterChip label="Decided" current={filter} value="decided" />
          <FilterChip label="All" current={filter} value="all" />
          <Link
            href="/admin"
            className="ml-auto rounded-full border border-neutral-300 bg-neutral-0 px-3 py-1 text-xs font-semibold text-neutral-700 hover:border-blue-700 hover:text-blue-700"
          >
            ← Admin home
          </Link>
        </div>

        {applications.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
            No KYC applications in this view.
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-neutral-900">
                        {a.applicant.full_name}
                      </div>
                      <div className="text-xs text-neutral-500">{a.applicant.email}</div>
                    </td>
                    <td className="px-4 py-3 text-neutral-700">{a.applicant_type}</td>
                    <td className="px-4 py-3 text-neutral-700">
                      T{a.current_tier} → <strong>T{a.target_tier}</strong>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={a.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">
                      {a.submitted_at
                        ? a.submitted_at.toISOString().slice(0, 16).replace('T', ' ')
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/kyc/${a.id}`}
                        className="rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-neutral-0 hover:bg-blue-800"
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterChip({
  label,
  current,
  value,
}: {
  label: string;
  current: StatusFilter;
  value: StatusFilter;
}) {
  const active = current === value;
  const href = `/admin/kyc${value === 'pending' ? '' : `?filter=${value}`}`;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-blue-700 bg-blue-700 text-neutral-0'
          : 'border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-blue-700 hover:text-blue-700'
      }`}
    >
      {label}
    </Link>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'APPROVED'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'DENIED'
        ? 'bg-red-50 text-red-700 ring-red-200'
        : status === 'EXPIRED'
          ? 'bg-neutral-100 text-neutral-600 ring-neutral-300'
          : status === 'NEEDS_MORE_INFO'
            ? 'bg-amber-50 text-amber-700 ring-amber-200'
            : 'bg-blue-50 text-blue-700 ring-blue-200';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
