import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Trust cases — ${BRAND_NAME}`,
};

type StatusFilter = 'open' | 'resolved' | 'all';

const OPEN_STATUSES = ['NEW', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED'] as const;
const RESOLVED_STATUSES = ['HEALTHY', 'RESOLVED'] as const;

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminTrustCasesPage({ searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const sp = await searchParams;
  const filter: StatusFilter =
    sp.filter === 'resolved' ? 'resolved' : sp.filter === 'all' ? 'all' : 'open';

  const where: Prisma.TrustCaseWhereInput =
    filter === 'open'
      ? { status: { in: [...OPEN_STATUSES] } }
      : filter === 'resolved'
        ? { status: { in: [...RESOLVED_STATUSES] } }
        : {};

  const cases = await prisma.trustCase.findMany({
    where,
    orderBy: [{ due_date: 'asc' }],
    take: 100,
    select: {
      id: true,
      case_number: true,
      subject_type: true,
      subject_id: true,
      title: true,
      severity: true,
      status: true,
      due_date: true,
      auto_created: true,
      auto_creation_signal: true,
      created_at: true,
    },
  });

  const autoOpen = await prisma.trustCase.count({
    where: { status: { in: [...OPEN_STATUSES] }, auto_created: true },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">T&amp;S queue</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Trust cases</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Sorted by due date — soonest first. {autoOpen} open case{autoOpen === 1 ? '' : 's'} were
          opened automatically by the risk engine.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip label="Open" current={filter} value="open" />
          <FilterChip label="Resolved" current={filter} value="resolved" />
          <FilterChip label="All" current={filter} value="all" />
        </div>

        {cases.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
            No trust cases in this view.
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {cases.map((c) => {
                  const overdue =
                    [...OPEN_STATUSES].includes(c.status as (typeof OPEN_STATUSES)[number]) &&
                    c.due_date.getTime() < Date.now();
                  const hoursToDue = (c.due_date.getTime() - Date.now()) / (1000 * 60 * 60);
                  return (
                    <tr key={c.id} className={overdue ? 'bg-red-50' : ''}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/trust-cases/${encodeURIComponent(c.case_number)}`}
                          className="font-mono font-bold text-blue-700 hover:underline"
                        >
                          {c.case_number}
                        </Link>
                        <span className="mt-0.5 block max-w-xs truncate text-xs text-neutral-500">
                          {c.title}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-neutral-700">{c.subject_type}</span>
                        <span className="ml-1 font-mono text-xs text-neutral-500">
                          {c.subject_id.slice(0, 10)}…
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SeverityPill severity={c.severity} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {c.auto_created ? (
                          <span className="font-semibold text-blue-700">
                            {(c.auto_creation_signal ?? 'auto').replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-neutral-500">Manual</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {overdue ? (
                          <span className="font-bold text-red-700">
                            OVERDUE · {Math.abs(hoursToDue).toFixed(0)}h
                          </span>
                        ) : (
                          <span className="text-neutral-600">{hoursToDue.toFixed(0)}h left</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {c.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                      </td>
                    </tr>
                  );
                })}
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
  const href = `/admin/trust-cases${value === 'open' ? '' : `?filter=${value}`}`;
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

function SeverityPill({ severity }: { severity: string }) {
  const tone =
    severity === 'CRITICAL'
      ? 'bg-red-100 text-red-800 ring-red-300'
      : severity === 'HIGH'
        ? 'bg-orange-50 text-orange-700 ring-orange-200'
        : severity === 'MEDIUM'
          ? 'bg-amber-50 text-amber-700 ring-amber-200'
          : 'bg-neutral-100 text-neutral-600 ring-neutral-300';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {severity}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'NEW'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : status === 'ESCALATED' || status === 'RESTRICTED'
        ? 'bg-red-50 text-red-700 ring-red-200'
        : status === 'MONITORING'
          ? 'bg-blue-50 text-blue-700 ring-blue-200'
          : status === 'NEEDS_INFO'
            ? 'bg-purple-50 text-purple-700 ring-purple-200'
            : status === 'HEALTHY' || status === 'RESOLVED'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : 'bg-neutral-100 text-neutral-700 ring-neutral-300';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
