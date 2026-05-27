import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { createDispute } from '../../../actions/dispute';
import { isOrderDisputable, DISPUTE_CATEGORIES } from '../../../../lib/dispute-helpers';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function OpenDisputePage({ params, searchParams }: PageProps) {
  const { orderNumber } = await params;
  const { error } = await searchParams;

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    select: {
      id: true,
      order_number: true,
      status: true,
      total_amount: true,
      created_at: true,
    },
  });
  if (!order) notFound();

  const disputable = isOrderDisputable(order.status);

  return (
    <main className="bg-neutral-50 min-h-screen">
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-8">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Open a dispute
          </p>
          <h1 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Tell us what went wrong with order{' '}
            <span
              className="rounded-md bg-neutral-100 px-2 py-1 text-base font-bold text-neutral-700"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {order.order_number}
            </span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-neutral-700 md:text-base">
            Your payment of <strong>${Number(order.total_amount).toFixed(2)}</strong> stays in
            escrow while Trust &amp; Safety reviews. We aim to resolve disputes within{' '}
            <strong>48 hours</strong>. No one is paid until the dispute is resolved.
          </p>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-3xl">
          {!disputable ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
              <p className="text-sm font-bold text-amber-900">
                Orders in status {order.status} can&apos;t be disputed.
              </p>
              <p className="mt-1 text-sm text-amber-900/80">
                {order.status === 'DISPUTED'
                  ? 'A dispute is already open on this order.'
                  : order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'EXPIRED'
                    ? 'This order has already been cancelled or refunded.'
                    : 'Contact support if you believe this is in error.'}
              </p>
              <div className="mt-4">
                <Link
                  href={`/orders/${order.order_number}`}
                  className="text-sm font-semibold text-blue-700 hover:text-blue-800"
                >
                  ← Back to tracking
                </Link>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}
              <form action={createDispute} className="space-y-6">
                <input type="hidden" name="orderNumber" value={order.order_number} />

                <fieldset className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                  <legend className="px-2 text-sm font-bold uppercase tracking-wider text-neutral-600">
                    What happened?
                  </legend>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="category" className="block text-sm font-semibold text-neutral-900">
                        Category <span className="text-red-500">*</span>
                      </label>
                      <select
                        id="category"
                        name="category"
                        required
                        defaultValue="NOT_RECEIVED"
                        className="mt-2 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
                      >
                        {DISPUTE_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>{c.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-sm font-semibold text-neutral-900">
                        Describe the issue <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id="description"
                        name="description"
                        required
                        minLength={20}
                        rows={6}
                        className="mt-2 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm"
                        placeholder="What did you receive? What did you expect? Include any details that would help Trust & Safety understand the situation."
                      />
                      <p className="mt-1 text-xs text-neutral-500">
                        At least 20 characters. Be specific — clear descriptions resolve faster.
                      </p>
                    </div>
                  </div>
                </fieldset>

                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">What happens when you open this</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-blue-900/90">
                    <li>Your payment stays frozen in escrow — sellers are NOT paid.</li>
                    <li>Trust &amp; Safety reviews within 48 hours.</li>
                    <li>You and the seller can both add messages and evidence.</li>
                    <li>T&amp;S resolves by refunding you, releasing to seller, or using the insurance fund — based on the evidence.</li>
                  </ul>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-700 px-6 py-3 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
                  >
                    Open dispute
                  </button>
                  <Link
                    href={`/orders/${order.order_number}`}
                    className="rounded-lg border border-neutral-300 bg-neutral-0 px-6 py-3 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
                  >
                    Cancel
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
