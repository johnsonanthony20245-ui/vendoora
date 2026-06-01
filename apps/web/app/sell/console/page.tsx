import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getSellerSession } from '../../../lib/seller-auth';
import { getListingUsage, formatLimit, type SellerPlan } from '../../../lib/seller-tier';
import { getModerationFeedback } from '../../../lib/seller-moderation-feedback';
import { devSellerSignOut } from '../../actions/seller-auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Seller console — ${BRAND_NAME}`,
};

// Only REJECTED or PENDING listings can be edited & resubmitted; APPROVED/
// PUBLISHED listings are live and re-moderating them is a separate concern.
// Mirrors EDITABLE_STATUSES in lib/product-edit.ts and the gate on the edit page.
const EDITABLE_MODERATION = new Set(['REJECTED', 'PENDING']);

export default async function SellerConsolePage() {
  const session = await getSellerSession();
  if (!session) redirect('/sell/sign-in');

  const seller = await prisma.seller.findUnique({
    where: { id: session.sellerId },
    select: {
      id: true,
      business_name: true,
      business_slug: true,
      business_type: true,
      saas_plan: true,
      saas_commission_rate: true,
      kyc_tier: true,
      kyc_status: true,
      total_orders: true,
      total_gmv: true,
      rating_average: true,
      rating_count: true,
    },
  });
  if (!seller) redirect('/sell/sign-in');

  const usage = await getListingUsage(seller.id, seller.saas_plan as SellerPlan);

  const products = await prisma.product.findMany({
    where: { seller_id: seller.id, deleted_at: null },
    orderBy: { created_at: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      base_price: true,
      currency: true,
      status: true,
      moderation_status: true,
      created_at: true,
    },
  });

  // Pull the latest rejection feedback for any REJECTED products so the
  // seller can see exactly what T&S said and act on it. Bulk-loaded (one
  // findMany over the audit log keyed by resource_id) to keep the page-load
  // cost flat regardless of how many rejected products the seller has.
  const rejectedIds = products
    .filter((p) => p.moderation_status === 'REJECTED')
    .map((p) => p.id);
  const feedback = await getModerationFeedback(rejectedIds);

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Seller console
            </p>
            <h1 className="mt-2 text-3xl font-bold text-neutral-900">{seller.business_name}</h1>
            <p className="mt-1 text-sm text-neutral-600">
              {session.kind === 'dev'
                ? 'Dev session via the vdr_seller_dev cookie. Production gates on Clerk.'
                : `Signed in as Clerk user ${session.clerk_user_id}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/store/${seller.business_slug}`}
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              View public store →
            </Link>
            {session.kind === 'dev' && (
              <form action={devSellerSignOut}>
                <button
                  type="submit"
                  className="rounded-lg border border-neutral-300 bg-neutral-0 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                >
                  Sign out
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <StatCard label="Plan" value={seller.saas_plan} sub={`${(seller.saas_commission_rate * 100).toFixed(0)}% commission`} />
          <StatCard
            label="KYC"
            value={`T${seller.kyc_tier}`}
            sub={seller.kyc_status.replace(/_/g, ' ')}
            tone={seller.kyc_status === 'APPROVED' ? 'emerald' : 'amber'}
          />
          <StatCard label="Listings" value={`${usage.used} / ${formatLimit(usage.limit)}`} sub={usage.atCap ? 'At cap' : `${usage.remaining === Infinity ? 'Unlimited' : usage.remaining} left`} tone={usage.atCap ? 'red' : 'blue'} />
          <StatCard label="Total orders" value={String(seller.total_orders)} sub={`$${Number(seller.total_gmv).toFixed(2)} GMV`} />
        </div>

        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-neutral-900">Products</h2>
            <Link
              href="/sell/console/products/new"
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                usage.atCap
                  ? 'pointer-events-none bg-neutral-200 text-neutral-500'
                  : 'bg-blue-700 text-neutral-0 hover:bg-blue-800'
              }`}
              aria-disabled={usage.atCap}
            >
              {usage.atCap ? 'Listing cap reached' : 'New product →'}
            </Link>
          </div>

          {products.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-neutral-0 p-10 text-center text-neutral-600">
              No products yet. Add your first listing — it starts as a draft and goes live after T&amp;S
              moderation.
            </div>
          ) : (
            <div className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-0">
              <table className="w-full text-sm">
                <thead className="bg-neutral-100 text-left text-xs font-bold uppercase tracking-widest text-neutral-600">
                  <tr>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Moderation</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {products.map((p) => {
                    const fb =
                      p.moderation_status === 'REJECTED'
                        ? feedback.get(p.id) ?? null
                        : null;
                    return (
                      <Fragment key={p.id}>
                        <tr>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-neutral-900">{p.name}</div>
                            <div className="text-xs text-neutral-500 font-mono">{p.slug}</div>
                          </td>
                          <td className="px-4 py-3 text-neutral-700">
                            ${Number(p.base_price).toFixed(2)} {p.currency}
                          </td>
                          <td className="px-4 py-3">
                            <Pill tone={p.status === 'PUBLISHED' ? 'emerald' : 'neutral'}>{p.status}</Pill>
                          </td>
                          <td className="px-4 py-3">
                            <Pill tone={p.moderation_status === 'APPROVED' ? 'emerald' : p.moderation_status === 'REJECTED' ? 'red' : 'amber'}>
                              {p.moderation_status}
                            </Pill>
                          </td>
                          <td className="px-4 py-3 text-xs text-neutral-500">
                            {p.created_at.toISOString().slice(0, 10)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {EDITABLE_MODERATION.has(p.moderation_status) ? (
                              <Link
                                href={`/sell/console/products/${p.id}/edit`}
                                className="text-xs font-semibold text-blue-700 hover:underline"
                              >
                                Edit &amp; resubmit →
                              </Link>
                            ) : (
                              <span className="text-xs text-neutral-400">—</span>
                            )}
                          </td>
                        </tr>
                        {fb && (
                          <tr className="bg-red-50/50">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-red-700">
                                  Reviewer feedback
                                  <span className="font-normal normal-case text-red-500">
                                    · {fb.decided_at.toISOString().slice(0, 16).replace('T', ' ')}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-neutral-800 whitespace-pre-wrap">
                                  {fb.notes ?? 'No notes provided by the reviewer.'}
                                </p>
                                <Link
                                  href={`/sell/console/products/${p.id}/edit`}
                                  className="mt-2 inline-block text-xs font-semibold text-red-700 hover:underline"
                                >
                                  Edit the listing and re-submit it to clear the rejection →
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
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
  sub,
  tone = 'blue',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const tones: Record<typeof tone, string> = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-neutral-200 bg-neutral-0 text-neutral-900',
  };
  return (
    <div className={`rounded-xl border p-5 ${tones[tone]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs font-bold uppercase tracking-widest text-neutral-600">{label}</div>
      {sub && <div className="mt-1 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

function Pill({ tone, children }: { tone: 'emerald' | 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const tones: Record<typeof tone, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${tones[tone]}`}>
      {String(children).replace(/_/g, ' ')}
    </span>
  );
}
