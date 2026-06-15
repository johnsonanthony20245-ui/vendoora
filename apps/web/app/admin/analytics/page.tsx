import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { prisma } from '@vendoora/db';
import { getAdminSession } from '../../../lib/admin';
import { getPlatformAnalytics } from '../../../lib/admin-analytics';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Analytics — ${BRAND_NAME}`,
};

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface PageProps {
  searchParams: Promise<{ days?: string }>;
}

export default async function AdminAnalyticsPage({ searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const sp = await searchParams;
  const windowDays = sp.days === '7' ? 7 : sp.days === '90' ? 90 : 30;
  const a = await getPlatformAnalytics(prisma, { windowDays });

  const funnelRows: { label: string; value: number; tone: string }[] = [
    { label: 'Pending payment', value: a.funnel.pendingPayment, tone: 'bg-neutral-400' },
    { label: 'In flight', value: a.funnel.inFlight, tone: 'bg-blue-500' },
    { label: 'Delivered', value: a.funnel.delivered, tone: 'bg-emerald-500' },
    { label: 'Completed', value: a.funnel.completed, tone: 'bg-emerald-600' },
    { label: 'Disputed', value: a.funnel.disputed, tone: 'bg-amber-500' },
    { label: 'Refunded', value: a.funnel.refunded, tone: 'bg-red-400' },
    { label: 'Cancelled / expired', value: a.funnel.cancelledOrExpired, tone: 'bg-neutral-300' },
  ];
  const funnelMax = Math.max(1, ...funnelRows.map((r) => r.value));
  const audienceTotal = a.audience.domestic + a.audience.diaspora;
  const domesticPct = audienceTotal > 0 ? Math.round((a.audience.domestic / audienceTotal) * 100) : 0;

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Admin tools</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Analytics</h1>
        <p className="mt-1 text-sm text-neutral-600">Platform health over the last {windowDays} days.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <RangeChip label="7 days" days="7" current={windowDays} />
          <RangeChip label="30 days" days="30" current={windowDays} />
          <RangeChip label="90 days" days="90" current={windowDays} />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label="GMV (paid)" value={usd(a.gmv)} tone="emerald" />
          <Kpi label="Paid orders" value={a.paidOrders.toLocaleString()} tone="blue" />
          <Kpi label="Avg order value" value={usd(a.aov)} tone="blue" />
          <Kpi label="New buyers" value={a.newBuyers.toLocaleString()} tone="blue" />
          <Kpi label="Open disputes" value={a.openDisputes.toLocaleString()} tone="amber" />
          <Kpi label="Open trust cases" value={a.openTrustCases.toLocaleString()} tone="red" />
        </div>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-600">Order funnel</h2>
            <div className="mt-4 space-y-3">
              {funnelRows.map((r) => (
                <div key={r.label}>
                  <div className="flex justify-between text-xs text-neutral-600">
                    <span>{r.label}</span>
                    <span className="font-semibold text-neutral-800">{r.value.toLocaleString()}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full ${r.tone}`}
                      style={{ width: `${Math.round((r.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-600">
              Audience (orders)
            </h2>
            <div className="mt-6 flex items-end gap-6">
              <div className="flex-1">
                <p className="text-3xl font-bold text-neutral-900">{domesticPct}%</p>
                <p className="text-sm text-neutral-600">Liberia-domestic</p>
                <p className="mt-1 text-xs text-neutral-500">{a.audience.domestic.toLocaleString()} orders</p>
              </div>
              <div className="flex-1">
                <p className="text-3xl font-bold text-neutral-900">{100 - domesticPct}%</p>
                <p className="text-sm text-neutral-600">Diaspora</p>
                <p className="mt-1 text-xs text-neutral-500">{a.audience.diaspora.toLocaleString()} orders</p>
              </div>
            </div>
            <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full bg-blue-600" style={{ width: `${domesticPct}%` }} />
              <div className="h-full bg-purple-500" style={{ width: `${100 - domesticPct}%` }} />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function RangeChip({ label, days, current }: { label: string; days: string; current: number }) {
  const active = String(current) === days;
  return (
    <a
      href={`/admin/analytics?days=${days}`}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? 'border-blue-700 bg-blue-700 text-neutral-0'
          : 'border-neutral-300 bg-neutral-0 text-neutral-700 hover:border-blue-700 hover:text-blue-700'
      }`}
    >
      {label}
    </a>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'blue' | 'amber' | 'red' }) {
  const ring =
    tone === 'emerald'
      ? 'ring-emerald-200'
      : tone === 'amber'
        ? 'ring-amber-200'
        : tone === 'red'
          ? 'ring-red-200'
          : 'ring-blue-200';
  return (
    <div className={`rounded-xl border border-neutral-200 bg-neutral-0 p-5 ring-1 ring-inset ${ring}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}
