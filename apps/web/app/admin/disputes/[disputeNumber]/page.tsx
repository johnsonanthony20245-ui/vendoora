import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';
import { getAdminSession } from '../../../../lib/admin';
import { resolveDispute } from '../../../actions/admin-dispute';
import { hoursUntil } from '../../../../lib/dispute-helpers';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Resolve dispute — ${BRAND_NAME}`,
};

interface PageProps {
  params: Promise<{ disputeNumber: string }>;
  searchParams: Promise<{ error?: string; resolved?: string }>;
}

const RESOLVED_STATUSES = new Set([
  'RESOLVED_FAVOR_BUYER',
  'RESOLVED_FAVOR_SELLER',
  'RESOLVED_PARTIAL',
  'RESOLVED_INSURANCE',
  'CLOSED',
]);

export default async function AdminDisputeDetail({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/sign-in');

  const { disputeNumber } = await params;
  const { error, resolved } = await searchParams;

  const dispute = await prisma.dispute.findUnique({
    where: { dispute_number: disputeNumber },
    include: {
      order: {
        include: {
          escrow_holds: true,
          items: { include: { product: { select: { name: true } } } },
        },
      },
      messages: { orderBy: { created_at: 'asc' } },
      evidence: { orderBy: { created_at: 'asc' } },
    },
  });
  if (!dispute) notFound();

  const isResolved = RESOLVED_STATUSES.has(dispute.status);
  const slaHours = hoursUntil(dispute.sla_due_at);
  const heldDisputed = dispute.order.escrow_holds.filter(
    (h) => h.state === 'HELD_DISPUTED' && h.dispute_id === dispute.id,
  );
  const totalDisputedAmount = heldDisputed.reduce(
    (sum, h) => sum + Number(h.amount),
    0,
  );

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin/disputes"
          className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-blue-700"
        >
          ← Back to queue
        </Link>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-mono text-3xl font-bold text-neutral-900">
            {dispute.dispute_number}
          </h1>
          <StatusPill status={dispute.status} />
        </div>

        {resolved && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Resolution applied. Escrow + order + audit trail updated.
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {decodeURIComponent(error)}
          </div>
        )}

        {/* SLA + escrow summary */}
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              SLA
            </div>
            <div
              className={`mt-2 text-xl font-bold ${
                dispute.sla_breached
                  ? 'text-red-700'
                  : slaHours < 12
                  ? 'text-amber-700'
                  : 'text-neutral-900'
              }`}
            >
              {dispute.sla_breached
                ? `${Math.abs(slaHours).toFixed(0)}h over`
                : `${slaHours.toFixed(0)}h left`}
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              In escrow
            </div>
            <div className="mt-2 text-xl font-bold text-blue-700">
              ${totalDisputedAmount.toFixed(2)}{' '}
              <span className="text-xs text-neutral-500">
                {dispute.order.currency}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Holds disputed
            </div>
            <div className="mt-2 text-xl font-bold text-neutral-900">
              {heldDisputed.length} of {dispute.order.escrow_holds.length}
            </div>
          </div>
        </div>

        {/* Order context */}
        <section className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-5">
          <h2 className="text-base font-bold text-neutral-900">Order context</h2>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>
              <span className="text-neutral-500">Order:</span>{' '}
              <span className="font-mono">{dispute.order.order_number}</span>
            </div>
            <div>
              <span className="text-neutral-500">Order status:</span>{' '}
              <span className="font-semibold">{dispute.order.status}</span>
            </div>
            <div>
              <span className="text-neutral-500">Total:</span> $
              {Number(dispute.order.total_amount).toFixed(2)} {dispute.order.currency}
            </div>
            <div>
              <span className="text-neutral-500">Items:</span>{' '}
              {dispute.order.items.length}
            </div>
          </div>
          <ul className="mt-3 space-y-1 text-sm text-neutral-700">
            {dispute.order.items.map((i) => (
              <li key={i.id}>
                · {i.product?.name ?? '(deleted)'} × {i.quantity}
              </li>
            ))}
          </ul>
        </section>

        {/* Reason */}
        <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-5">
          <h2 className="text-base font-bold text-neutral-900">Buyer&apos;s claim</h2>
          <div className="mt-2 text-xs text-neutral-500">
            Category:{' '}
            <span className="font-semibold text-neutral-900">
              {dispute.category.replace(/_/g, ' ')}
            </span>{' '}
            · Reason: {dispute.reason.replace(/_/g, ' ')}
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">
            {dispute.description}
          </p>
        </section>

        {/* Messages */}
        {dispute.messages.length > 0 && (
          <section className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-5">
            <h2 className="text-base font-bold text-neutral-900">Thread</h2>
            <ul className="mt-3 space-y-3">
              {dispute.messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                >
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    {m.author_type} ·{' '}
                    {m.created_at.toISOString().slice(0, 16).replace('T', ' ')}
                    {m.is_internal && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] text-amber-800">
                        INTERNAL
                      </span>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">
                    {m.body}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Resolution form / result */}
        {isResolved ? (
          <section className="mt-8 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-5">
            <h2 className="text-base font-bold text-emerald-900">Resolved</h2>
            <div className="mt-2 text-sm text-emerald-900">
              <div>
                Resolution:{' '}
                <span className="font-semibold">
                  {dispute.resolution?.replace(/_/g, ' ') ?? '—'}
                </span>
              </div>
              {dispute.resolution_amount && (
                <div>
                  Amount: ${Number(dispute.resolution_amount).toFixed(2)}{' '}
                  {dispute.order.currency}
                </div>
              )}
              <div>
                Resolved at:{' '}
                {dispute.resolved_at?.toISOString().replace('T', ' ').slice(0, 19) ??
                  '—'}{' '}
                by {dispute.resolved_by_user_id ?? 'system'}
              </div>
              {dispute.resolution_notes && (
                <p className="mt-3 whitespace-pre-wrap rounded-lg border border-emerald-200 bg-neutral-0 p-3 text-sm text-neutral-800">
                  {dispute.resolution_notes}
                </p>
              )}
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-xl border-2 border-blue-300 bg-blue-50 p-5">
            <h2 className="text-base font-bold text-blue-900">Resolve</h2>
            <p className="mt-1 text-xs text-blue-800">
              Picking a resolution writes the audit trail, transitions every
              HELD_DISPUTED hold on this dispute, and moves the order to its
              terminal status. This cannot be undone from this UI — corrections
              require a separate make-whole flow.
            </p>

            <form action={resolveDispute} className="mt-5 space-y-4">
              <input type="hidden" name="disputeNumber" value={dispute.dispute_number} />

              <div className="grid gap-3 md:grid-cols-2">
                <ResolutionRadio
                  value="FULL_REFUND_TO_BUYER"
                  label="Full refund to buyer"
                  blurb="Escrow → REFUNDED. Order → REFUNDED."
                />
                <ResolutionRadio
                  value="RELEASE_TO_SELLER"
                  label="Release to seller"
                  blurb="Escrow → RELEASED. Order → COMPLETED."
                />
                <ResolutionRadio
                  value="PARTIAL_REFUND_TO_BUYER"
                  label="Partial refund"
                  blurb="Specify amount below. Escrow → PARTIALLY_REFUNDED."
                />
                <ResolutionRadio
                  value="INSURANCE_PAYOUT"
                  label="Insurance fund payout"
                  blurb="Vendoora fund covers the refund. Escrow → INSURANCE_PAYOUT."
                />
              </div>

              <div>
                <label
                  htmlFor="partialAmount"
                  className="block text-xs font-bold uppercase tracking-widest text-blue-900"
                >
                  Partial amount (only if Partial refund)
                </label>
                <input
                  type="number"
                  name="partialAmount"
                  id="partialAmount"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="mt-1 w-full max-w-xs rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900"
                />
              </div>

              <div>
                <label
                  htmlFor="resolutionNotes"
                  className="block text-xs font-bold uppercase tracking-widest text-blue-900"
                >
                  Resolution notes (required, min 10 chars)
                </label>
                <textarea
                  name="resolutionNotes"
                  id="resolutionNotes"
                  required
                  minLength={10}
                  rows={4}
                  placeholder="Briefly explain what the evidence showed and why this resolution applies."
                  className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-neutral-0 hover:bg-blue-800"
              >
                Apply resolution
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}

function ResolutionRadio({
  value,
  label,
  blurb,
}: {
  value: string;
  label: string;
  blurb: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-neutral-300 bg-neutral-0 p-3 hover:border-blue-700">
      <input
        type="radio"
        name="resolution"
        value={value}
        required
        className="mt-1 h-4 w-4 accent-blue-700"
      />
      <div>
        <div className="text-sm font-semibold text-neutral-900">{label}</div>
        <div className="mt-0.5 text-xs text-neutral-600">{blurb}</div>
      </div>
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-700 ring-1 ring-inset ring-blue-200">
      {status.replace(/_/g, ' ')}
    </span>
  );
}
