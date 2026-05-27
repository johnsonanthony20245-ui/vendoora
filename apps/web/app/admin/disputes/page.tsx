import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma, type Prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Dispute queue — ${BRAND_NAME}`,
};

type StatusFilter = 'open' | 'resolved' | 'all';

const OPEN_STATUSES = [
  'OPEN',
  'IN_REVIEW',
  'PENDING_BUYER',
  'PENDING_SELLER',
  'ESCALATED',
] as const;

const RESOLVED_STATUSES = [
  'RESOLVED_FAVOR_BUYER',
  'RESOLVED_FAVOR_SELLER',
  'RESOLVED_PARTIAL',
  'RESOLVED_INSURANCE',
  'CLOSED',
] as const;

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminDisputesPage({ searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const sp = await searchParams;
  const filter: StatusFilter =
    sp.filter === 'resolved' ? 'resolved' : sp.filter === 'all' ? 'all' : 'open';

  const where: Prisma.DisputeWhereInput =
    filter === 'open'
      ? { status: { in: [...OPEN_STATUSES] } }
      : filter === 'resolved'
      ? { status: { in: [...RESOLVED_STATUSES] } }
      : {};

  const disputes = await prisma.dispute.findMany({
    where,
    orderBy: [
      { sla_breached: 'desc' },
      { sla_due_at: 'asc' },
    ],
    take: 100,
    include: {
      order: {
        select: {
          order_number: true,
          total_amount: true,
          currency: true,
          status: true,
        },
      },
    },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          T&amp;S queue
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Disputes</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Sorted by SLA breach first, then closest deadline. Top of list is
          where to spend the next hour.
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          <FilterChip label="Open" current={filter} value="open" />
          <FilterChip label="Resolved" current={filter} value="resolved" />
          <FilterChip label="All" current={filter} value="all" />
        </div>

        {disputes.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-12 text-center text-neutral-600">
            No disputes in this view.
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
            <table className="w-full text-sm">
              <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                <tr>
                  <th className="px-4 py-3">Dispute</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">SLA</th>
                  <th className="px-4 py-3">Opened</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {disputes.map((d) => {
                  const breached = d.sla_breached;
                  const hoursToSla =
                    (d.sla_due_at.getTime() - Date.now()) / (1000 * 60 * 60);
                  return (
                    <tr
                      key={d.id}
                      className={breached ? 'bg-red-50' : ''}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/disputes/${d.dispute_number}`}
                          className="font-mono font-bold text-blue-700 hover:underline"
                        >
                          {d.dispute_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        {d.category.replace(/_/g, ' ')}
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill status={d.status} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-700">
                        {d.order.order_number}
                      </td>
                      <td className="px-4 py-3 text-neutral-700">
                        ${Number(d.order.total_amount).toFixed(2)}{' '}
                        <span className="text-xs text-neutral-500">
                          {d.order.currency}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {breached ? (
                          <span className="font-bold text-red-700">
                            BREACHED · {Math.abs(hoursToSla).toFixed(0)}h over
                          </span>
                        ) : hoursToSla < 12 ? (
                          <span className="font-bold text-amber-700">
                            {hoursToSla.toFixed(0)}h left
                          </span>
                        ) : (
                          <span className="text-neutral-600">
                            {hoursToSla.toFixed(0)}h left
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-500">
                        {d.initiated_at.toISOString().slice(0, 16).replace('T', ' ')}
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
  const href = `/admin/disputes${value === 'open' ? '' : `?filter=${value}`}`;
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
    status === 'OPEN'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : status.startsWith('RESOLVED_FAVOR_BUYER') || status === 'RESOLVED_PARTIAL'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : status === 'RESOLVED_FAVOR_SELLER'
      ? 'bg-blue-50 text-blue-700 ring-blue-200'
      : status === 'RESOLVED_INSURANCE'
      ? 'bg-purple-50 text-purple-700 ring-purple-200'
      : status === 'CLOSED'
      ? 'bg-neutral-100 text-neutral-600 ring-neutral-300'
      : status === 'ESCALATED'
      ? 'bg-red-50 text-red-700 ring-red-200'
      : 'bg-neutral-100 text-neutral-700 ring-neutral-300';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
