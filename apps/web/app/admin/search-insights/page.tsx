import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Search insights — ${BRAND_NAME}`,
};

const DEFAULT_LOOKBACK_DAYS = 30;

export default async function SearchInsightsPage() {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const since = new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // ── Totals + zero-result rate ──────────────────────────────────────────
  const [totalSearches, zeroResultSearches, uniqueQueries] = await Promise.all([
    prisma.searchEvent.count({
      where: { created_at: { gte: since }, NOT: { q: '' } },
    }),
    prisma.searchEvent.count({
      where: { created_at: { gte: since }, total_count: 0, NOT: { q: '' } },
    }),
    prisma.searchEvent
      .findMany({
        where: { created_at: { gte: since }, NOT: { q: '' } },
        select: { q: true },
        distinct: ['q'],
      })
      .then((rows) => rows.length),
  ]);
  const zeroRate = totalSearches === 0 ? 0 : (zeroResultSearches / totalSearches) * 100;

  // ── Top queries by frequency ───────────────────────────────────────────
  const topQueries = await prisma.searchEvent.groupBy({
    by: ['q'],
    where: { created_at: { gte: since }, NOT: { q: '' } },
    _count: { _all: true },
    _avg: { total_count: true },
    orderBy: { _count: { q: 'desc' } },
    take: 20,
  });

  // ── Zero-result queries (catalog gaps) ─────────────────────────────────
  const zeroResultRows = await prisma.searchEvent.groupBy({
    by: ['q'],
    where: { created_at: { gte: since }, total_count: 0, NOT: { q: '' } },
    _count: { _all: true },
    _max: { created_at: true },
    orderBy: { _count: { q: 'desc' } },
    take: 20,
  });

  // ── Most recent searches (raw stream) ──────────────────────────────────
  const recent = await prisma.searchEvent.findMany({
    where: { NOT: { q: '' } },
    orderBy: { created_at: 'desc' },
    take: 25,
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/admin"
          className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-blue-700"
        >
          ← Admin
        </Link>

        <h1 className="mt-3 text-3xl font-bold text-neutral-900">Search insights</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Last {DEFAULT_LOOKBACK_DAYS} days. Zero-result queries are catalog
          gaps — surface them to merch + sourcing for next intake.
        </p>

        {/* Stats */}
        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <StatCard label="Total searches" value={totalSearches.toString()} tone="blue" />
          <StatCard
            label="Unique queries"
            value={uniqueQueries.toString()}
            tone="blue"
          />
          <StatCard
            label="Zero-result"
            value={zeroResultSearches.toString()}
            tone="amber"
          />
          <StatCard
            label="Zero-result rate"
            value={`${zeroRate.toFixed(1)}%`}
            tone={zeroRate > 20 ? 'red' : zeroRate > 10 ? 'amber' : 'emerald'}
          />
        </div>

        {/* Top queries + zero-result side by side */}
        <div className="mt-10 grid gap-8 lg:grid-cols-2">
          <section>
            <h2 className="text-lg font-bold text-neutral-900">Top queries</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Most searched — sorted by occurrence count.
            </p>
            {topQueries.length === 0 ? (
              <EmptyState label="No searches yet." />
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                    <tr>
                      <th className="px-4 py-2">Query</th>
                      <th className="px-4 py-2">Hits</th>
                      <th className="px-4 py-2">Avg results</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {topQueries.map((row) => (
                      <tr key={row.q}>
                        <td className="px-4 py-2 font-mono text-xs text-neutral-900">
                          {row.q}
                        </td>
                        <td className="px-4 py-2 text-neutral-700">
                          {row._count._all}
                        </td>
                        <td className="px-4 py-2 text-neutral-700">
                          {row._avg.total_count?.toFixed(1) ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-lg font-bold text-neutral-900">Zero-result queries</h2>
            <p className="mt-1 text-xs text-neutral-500">
              Buyers searched for these and found nothing. Catalog gaps + intake
              candidates.
            </p>
            {zeroResultRows.length === 0 ? (
              <EmptyState label="No zero-result queries — every search landed somewhere." />
            ) : (
              <div className="mt-4 overflow-hidden rounded-xl border border-amber-300 bg-amber-50">
                <table className="w-full text-sm">
                  <thead className="bg-amber-100 text-left text-xs font-bold uppercase tracking-widest text-amber-800">
                    <tr>
                      <th className="px-4 py-2">Query</th>
                      <th className="px-4 py-2">Hits</th>
                      <th className="px-4 py-2">Last seen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-200">
                    {zeroResultRows.map((row) => (
                      <tr key={row.q}>
                        <td className="px-4 py-2 font-mono text-xs text-amber-900">
                          {row.q}
                        </td>
                        <td className="px-4 py-2 text-amber-900">
                          {row._count._all}
                        </td>
                        <td className="px-4 py-2 text-xs text-amber-700">
                          {row._max.created_at
                            ?.toISOString()
                            .slice(0, 16)
                            .replace('T', ' ') ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        {/* Raw recent stream */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-neutral-900">Live stream</h2>
          <p className="mt-1 text-xs text-neutral-500">
            Last {recent.length} non-empty searches across the platform.
          </p>
          {recent.length === 0 ? (
            <EmptyState label="No searches recorded yet." />
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                  <tr>
                    <th className="px-4 py-2">When</th>
                    <th className="px-4 py-2">Query</th>
                    <th className="px-4 py-2">Filters</th>
                    <th className="px-4 py-2">Hits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {recent.map((r) => (
                    <tr key={r.id} className={r.total_count === 0 ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-2 text-xs text-neutral-600">
                        {r.created_at.toISOString().slice(0, 19).replace('T', ' ')}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-neutral-900">
                        {r.q}
                      </td>
                      <td className="px-4 py-2 text-xs text-neutral-700">
                        {[r.category_slug, r.condition].filter(Boolean).join(' / ') || '—'}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`font-mono text-xs ${
                            r.total_count === 0 ? 'font-bold text-amber-700' : 'text-neutral-700'
                          }`}
                        >
                          {r.total_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
  value: string;
  tone: 'amber' | 'red' | 'blue' | 'emerald';
}) {
  const tones: Record<typeof tone, string> = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-xl border ${tones[tone]} p-5`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-widest opacity-80">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-8 text-center text-sm text-neutral-600">
      {label}
    </div>
  );
}
