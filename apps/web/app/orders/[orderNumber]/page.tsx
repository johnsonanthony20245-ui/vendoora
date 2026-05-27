import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { stageFor, nextHappyStatus } from '../../../lib/order-stage';
import { OrderStageStrip } from '../../../components/OrderStageStrip';
import { advanceOrderStatus } from '../../actions/order-status';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function OrderTrackingPage({ params }: PageProps) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    include: {
      items: { include: { seller: { select: { business_name: true } } } },
      escrow_holds: true,
    },
  });
  if (!order) notFound();

  const info = stageFor(order.status);
  const jar = await cookies();
  const codePlain = jar.get(`vdr_dc_${order.order_number}`)?.value ?? null;
  const nextStatus = nextHappyStatus(order.status);
  const showDevAdvance =
    process.env.NODE_ENV !== 'production' && nextStatus !== null;

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Header */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
              Order
            </p>
            <span
              className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-bold text-neutral-700"
              style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
            >
              {order.order_number}
            </span>
            <StatusPill tone={info.pillTone}>{info.pillLabel}</StatusPill>
          </div>
          <h1 className="mt-3 text-2xl font-bold text-neutral-900 md:text-3xl">{info.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-neutral-700 md:text-base">{info.description}</p>
        </div>
      </section>

      {/* Stage strip */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <OrderStageStrip currentStage={info.stage} />
        </div>
      </section>

      {/* Main panel */}
      <section className="px-6 py-8">
        <div className="mx-auto max-w-5xl grid gap-6 lg:grid-cols-[1fr_320px]">
          {/* Left: stage-specific content */}
          <div className="space-y-6">
            {/* Code-live celebration card at stage 2-3, verified celebration at stage 4 */}
            {info.codeVisible && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-red-700">
                      Your delivery code
                    </p>
                    <p className="mt-1 text-sm text-neutral-700">
                      Give this only when you&apos;ve seen the order and it&apos;s right.
                    </p>
                  </div>
                </div>
                {codePlain ? (
                  <div
                    className="mt-4 text-5xl font-bold tracking-widest text-red-700"
                    style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                  >
                    {codePlain}
                  </div>
                ) : (
                  <div className="mt-4">
                    <div
                      className="text-3xl font-bold tracking-widest text-neutral-400"
                      style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                    >
                      · · · · · ·
                    </div>
                    <p className="mt-2 text-xs text-neutral-600">
                      Check your phone (SMS) — the code is only displayed inline right after checkout.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Verified celebration card at stage 4 */}
            {info.stage === 4 && (
              <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-emerald-700">
                  Code verified at the door
                </p>
                <h3 className="mt-1 text-xl font-bold text-emerald-900">
                  Escrow releases in 24 hours.
                </h3>
                <p className="mt-2 text-sm text-emerald-900/80">
                  Your seller(s) will be paid automatically unless you open a dispute. If anything&apos;s wrong, open one within the next 24 hours.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/trust-center"
                    className="rounded-lg border border-emerald-300 bg-neutral-0 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                  >
                    How escrow release works
                  </Link>
                  <Link
                    href={`/orders/${order.order_number}/dispute`}
                    className="rounded-lg border border-red-300 bg-neutral-0 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Open a dispute
                  </Link>
                </div>
              </div>
            )}

            {/* Driver card at stages 2-3 */}
            {info.driverVisible && info.stage !== 4 && (
              <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
                <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
                  Your driver
                </p>
                <p className="mt-2 text-sm text-neutral-700">
                  Driver dispatch + live location land in P7. For now, picture a verified
                  Vendoora rider on a motorbike, en route from the seller&apos;s pickup to your door.
                </p>
              </div>
            )}

            {/* Items list */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-0 p-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
                Items in this order
              </h2>
              <ul className="mt-4 space-y-3">
                {order.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex justify-between gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="text-sm font-semibold text-neutral-900">
                        {(item.product_snapshot as { name?: string })?.name ?? 'Item'}
                      </div>
                      <div className="text-xs text-neutral-600">
                        {item.seller.business_name} · Qty {item.quantity}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-neutral-900">
                      ${Number(item.subtotal).toFixed(2)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Dev-only stage advance */}
            {showDevAdvance && nextStatus && (
              <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4">
                <p className="text-xs font-bold uppercase tracking-widest text-amber-700">
                  Dev tool · not in production
                </p>
                <p className="mt-1 text-sm text-amber-900">
                  Real transitions land via seller-console + driver-app actions (P4 / P7) +
                  the auto-release worker (P3). This button is a demo affordance.
                </p>
                <form action={advanceOrderStatus} className="mt-3">
                  <input type="hidden" name="orderNumber" value={order.order_number} />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-neutral-0 hover:bg-amber-700"
                  >
                    Advance to next stage → {nextStatus.replace(/_/g, ' ')}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Right rail: order summary */}
          <aside className="h-fit rounded-xl border border-neutral-200 bg-neutral-0 p-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-600">
              Order summary
            </h2>
            <div className="mt-4 space-y-2 text-sm">
              <Row label="Subtotal" value={`$${Number(order.subtotal).toFixed(2)}`} />
              <Row label="Shipping" value={`$${Number(order.shipping_fee).toFixed(2)}`} />
              <div className="border-t border-neutral-200 pt-2 mt-2 flex justify-between text-base">
                <span className="font-bold text-neutral-900">Total in escrow</span>
                <span className="font-bold text-neutral-900">
                  ${Number(order.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="mt-6 space-y-2 text-xs text-neutral-600">
              <p>
                <span className="font-semibold text-neutral-900">Delivery</span> ·{' '}
                {order.delivery_city}, {order.delivery_zone}
              </p>
              <p>
                <span className="font-semibold text-neutral-900">Payment</span> ·{' '}
                {order.payment_method.replace(/_/g, ' ')}
              </p>
              <p>
                <span className="font-semibold text-neutral-900">Placed</span> ·{' '}
                {new Date(order.created_at).toLocaleString()}
              </p>
            </div>

            <div className="mt-6">
              <Link
                href="/"
                className="text-xs font-semibold text-blue-700 hover:text-blue-800"
              >
                ← Keep browsing
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: ReturnType<typeof stageFor>['pillTone'];
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    preparing: 'bg-amber-50 text-amber-700 ring-amber-200',
    live: 'bg-blue-50 text-blue-700 ring-blue-200',
    arriving: 'bg-red-50 text-red-700 ring-red-200',
    complete: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    cancelled: 'bg-neutral-100 text-neutral-700 ring-neutral-300',
    disputed: 'bg-red-50 text-red-700 ring-red-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className="font-semibold text-neutral-900">{value}</span>
    </div>
  );
}
