import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { hoursUntil } from '../../../lib/dispute-helpers';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ disputeNumber: string }>;
}

export default async function DisputeViewPage({ params }: PageProps) {
  const { disputeNumber } = await params;

  const dispute = await prisma.dispute.findUnique({
    where: { dispute_number: disputeNumber },
    include: {
      order: {
        select: {
          order_number: true,
          total_amount: true,
          items: {
            include: { seller: { select: { business_name: true } } },
          },
        },
      },
      messages: { orderBy: { created_at: 'asc' } },
      escrow_holds: true,
    },
  });
  if (!dispute) notFound();

  const hoursLeft = hoursUntil(dispute.sla_due_at);
  const isOpen = dispute.status === 'OPEN' || dispute.status === 'IN_REVIEW';
  const heldDisputed = dispute.escrow_holds.filter((h) => h.state === 'HELD_DISPUTED').length;

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Header */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Dispute
            </p>
            <span
              className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-700"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {dispute.dispute_number}
            </span>
            <StatusPill status={dispute.status} />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-neutral-900 md:text-3xl">
            {titleFor(dispute.status)}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-700 md:text-base">
            {descriptionFor(dispute.status, hoursLeft)}
          </p>
        </div>
      </section>

      <section className="px-6 py-8">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: dispute details + messages */}
          <div className="space-y-6">
            {/* Escrow frozen indicator */}
            {heldDisputed > 0 && (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                  Funds frozen in escrow
                </p>
                <h3 className="mt-1 text-lg font-bold text-amber-900">
                  No one is paid while T&amp;S reviews.
                </h3>
                <p className="mt-2 text-sm text-amber-900/80">
                  {heldDisputed} escrow hold{heldDisputed === 1 ? '' : 's'} for this order
                  {heldDisputed === 1 ? ' is' : ' are'} in <code className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">HELD_DISPUTED</code> state. The
                  seller cannot be paid until the dispute is resolved.
                </p>
              </div>
            )}

            {/* Dispute summary card */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
                Dispute summary
              </h2>
              <dl className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wider text-neutral-500">Category</dt>
                  <dd className="mt-1 font-semibold text-neutral-900">
                    {dispute.category.replace(/_/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-neutral-500">Opened by</dt>
                  <dd className="mt-1 font-semibold text-neutral-900">
                    {dispute.reason === 'BUYER_INITIATED' ? 'Buyer' : dispute.reason.replace(/_/g, ' ')}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-neutral-500">Opened</dt>
                  <dd className="mt-1 font-semibold text-neutral-900">
                    {new Date(dispute.initiated_at).toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wider text-neutral-500">SLA due</dt>
                  <dd className="mt-1 font-semibold text-neutral-900">
                    {new Date(dispute.sla_due_at).toLocaleString()}
                    {isOpen && (
                      <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${hoursLeft <= 6 ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                        {hoursLeft > 0 ? `${hoursLeft}h remaining` : 'BREACHED'}
                      </span>
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Messages */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
                Messages
              </h2>
              {dispute.messages.length === 0 ? (
                <p className="mt-4 text-sm text-neutral-600">No messages yet.</p>
              ) : (
                <ul className="mt-4 space-y-4">
                  {dispute.messages
                    .filter((m) => !m.is_internal)
                    .map((m) => (
                      <li
                        key={m.id}
                        className={`rounded-lg border p-4 ${m.author_type === 'BUYER' ? 'border-blue-200 bg-blue-50' : m.author_type === 'SELLER' ? 'border-emerald-200 bg-emerald-50' : 'border-neutral-200 bg-neutral-50'}`}
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold uppercase tracking-wider">
                            {m.author_type === 'BUYER'
                              ? 'You'
                              : m.author_type === 'SELLER'
                                ? 'Seller'
                                : m.author_type === 'ADMIN'
                                  ? 'Trust & Safety'
                                  : 'System'}
                          </span>
                          <span className="text-neutral-600">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-line text-sm text-neutral-900">{m.body}</p>
                      </li>
                    ))}
                </ul>
              )}

              <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-xs text-neutral-600">
                Reply form + evidence upload land in a future slice (needs Cloudflare R2 wiring +
                the dispute messages thread per Engineering_Spec §7).
              </div>
            </div>
          </div>

          {/* Right rail: order context */}
          <aside className="h-fit rounded-xl border border-neutral-200 bg-neutral-0 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Order
            </h2>
            <p className="mt-2 text-sm">
              <Link
                href={`/orders/${dispute.order.order_number}`}
                className="font-semibold text-blue-700 hover:text-blue-800"
              >
                {dispute.order.order_number} →
              </Link>
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              ${Number(dispute.order.total_amount).toFixed(2)} · {dispute.order.items.length}{' '}
              item{dispute.order.items.length === 1 ? '' : 's'}
            </p>

            <ul className="mt-4 space-y-2 text-xs">
              {dispute.order.items.map((item) => (
                <li key={item.id} className="text-neutral-700">
                  <div className="font-semibold text-neutral-900">
                    {(item.product_snapshot as { name?: string })?.name ?? 'Item'}
                  </div>
                  <div className="text-neutral-600">
                    {item.seller.business_name} · Qty {item.quantity}
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </main>
  );
}

function titleFor(status: string): string {
  switch (status) {
    case 'OPEN':
      return 'Under review by Trust & Safety';
    case 'IN_REVIEW':
      return 'T&S is investigating';
    case 'PENDING_BUYER':
      return 'Waiting on your response';
    case 'PENDING_SELLER':
      return 'Waiting on seller response';
    case 'ESCALATED':
      return 'Escalated to senior T&S';
    case 'RESOLVED_FAVOR_BUYER':
      return 'Resolved in your favor';
    case 'RESOLVED_FAVOR_SELLER':
      return 'Resolved in seller’s favor';
    case 'RESOLVED_PARTIAL':
      return 'Resolved — partial refund';
    case 'RESOLVED_INSURANCE':
      return 'Resolved via insurance fund';
    case 'CLOSED':
      return 'Closed';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return 'Dispute';
  }
}

function descriptionFor(status: string, hoursLeft: number): string {
  if (status === 'OPEN') {
    return `T&S reviews disputes within 48 hours. ${hoursLeft > 0 ? `~${hoursLeft}h remaining on this SLA.` : 'SLA window has elapsed; review will complete shortly.'}`;
  }
  if (status === 'IN_REVIEW') {
    return 'A Trust & Safety analyst has picked this up and is investigating.';
  }
  if (status.startsWith('RESOLVED')) {
    return 'Decision recorded. Funds movement will reflect in your account shortly.';
  }
  return '';
}

function StatusPill({ status }: { status: string }) {
  const isResolved = status.startsWith('RESOLVED') || status === 'CLOSED';
  const isPending = status === 'OPEN' || status === 'IN_REVIEW' || status.startsWith('PENDING');
  const style = isResolved
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    : isPending
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-neutral-100 text-neutral-700 ring-neutral-300';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${style}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
