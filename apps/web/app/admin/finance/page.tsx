import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { prisma } from '@vendoora/db';
import { getAdminSession } from '../../../lib/admin';
import { getEscrowSummary } from '../../../lib/admin-finance';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Financial control — ${BRAND_NAME}`,
};

const usd = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AdminFinancePage() {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const escrow = await getEscrowSummary(prisma);
  const ageMax = Math.max(1, ...escrow.byAge.map((r) => r.amount));
  const aged = escrow.byAge.find((r) => r.bucket === '> 7 days');

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Admin tools</p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Financial control</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Buyer funds the platform is currently holding in escrow.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6 ring-1 ring-inset ring-emerald-200 sm:col-span-1">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">Total held</p>
            <p className="mt-2 text-3xl font-bold text-neutral-900">{usd(escrow.totalHeld)}</p>
            <p className="mt-1 text-xs text-neutral-500">{escrow.heldCount.toLocaleString()} holds</p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6 sm:col-span-2">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">By state</p>
            {escrow.byState.length === 0 ? (
              <p className="mt-3 text-sm text-neutral-500">Nothing currently held.</p>
            ) : (
              <table className="mt-3 w-full text-sm">
                <tbody className="divide-y divide-neutral-100">
                  {escrow.byState.map((r) => (
                    <tr key={r.state}>
                      <td className="py-1.5 font-medium text-neutral-700">{r.state.replace(/_/g, ' ')}</td>
                      <td className="py-1.5 text-right text-neutral-500">{r.count.toLocaleString()}</td>
                      <td className="py-1.5 text-right font-semibold text-neutral-900">{usd(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-6">
          <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-600">Aging holds</h2>
          <p className="mt-1 text-xs text-neutral-500">
            How long funds have sat in their current state. Money held &gt; 7 days usually means a
            stuck dispute or a missed auto-release.
          </p>
          <div className="mt-4 space-y-3">
            {escrow.byAge.map((r) => {
              const isAged = r.bucket === '> 7 days' && r.amount > 0;
              return (
                <div key={r.bucket}>
                  <div className="flex justify-between text-xs">
                    <span className={isAged ? 'font-bold text-red-700' : 'text-neutral-600'}>
                      {r.bucket}
                    </span>
                    <span className="font-semibold text-neutral-800">
                      {usd(r.amount)} · {r.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full ${isAged ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${Math.round((r.amount / ageMax) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          {aged && aged.amount > 0 ? (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
              {usd(aged.amount)} across {aged.count} hold{aged.count === 1 ? '' : 's'} held over 7 days
              — review for stuck disputes.
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
