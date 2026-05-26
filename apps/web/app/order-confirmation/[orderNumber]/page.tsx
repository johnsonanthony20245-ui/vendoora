import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { prisma } from '@vendoora/db';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ orderNumber: string }>;
}

export default async function OrderConfirmationPage({ params }: PageProps) {
  const { orderNumber } = await params;

  const order = await prisma.order.findUnique({
    where: { order_number: orderNumber },
    include: {
      items: { include: { seller: { select: { business_name: true } } } },
      escrow_holds: true,
    },
  });
  if (!order) notFound();

  const jar = await cookies();
  const deliveryCodePlaintext = jar.get(`vdr_dc_${order.order_number}`)?.value ?? null;

  const sellersCount = order.escrow_holds.filter((h) => h.beneficiary_type === 'SELLER').length;

  return (
    <main className="bg-neutral-50 min-h-screen">
      {/* Success hero */}
      <section className="bg-emerald-700 px-6 py-12 text-neutral-0 md:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-100">
            Paid into escrow
          </p>
          <h1 className="mt-2 text-3xl font-bold md:text-5xl">
            Your order is on its way.
          </h1>
          <p className="mt-3 text-base text-emerald-100 md:text-lg">
            Order <span className="font-mono">{order.order_number}</span> &middot;
            ${Number(order.total_amount).toFixed(2)} held safely.{' '}
            {sellersCount > 0 && `${sellersCount} seller${sellersCount > 1 ? 's' : ''} will be paid only after you confirm delivery.`}
          </p>
        </div>
      </section>

      {/* Delivery code */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-red-600">
            Your 6-digit delivery code
          </p>
          <h2 className="mt-2 text-xl font-semibold text-neutral-900">
            Give this code to the driver only when your order arrives and looks right.
          </h2>

          {deliveryCodePlaintext ? (
            <div className="mt-6 inline-block rounded-xl border-2 border-red-200 bg-red-50 px-8 py-5">
              <div
                className="text-5xl font-bold tracking-widest text-red-700"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {deliveryCodePlaintext}
              </div>
            </div>
          ) : (
            <div className="mt-6 inline-block rounded-xl border-2 border-neutral-200 bg-neutral-100 px-8 py-5 text-neutral-500">
              <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>· · · · · ·</span>
              <p className="mt-2 text-xs">
                Code already sent. Check your phone (SMS in production).
              </p>
            </div>
          )}

          <p className="mt-4 max-w-xl text-sm text-neutral-600">
            <strong>In production this code is sent by SMS.</strong> We&apos;re showing it inline
            here while SMS integration ({BRAND_NAME} uses Africa&apos;s Talking + Twilio) is wired
            up in a later slice. Three failed attempts at the door triggers Trust &amp; Safety
            escalation (Build_Prompt §10.7).
          </p>
        </div>
      </section>

      {/* What happens next */}
      <section className="bg-blue-700 px-6 py-12 text-neutral-0 md:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-200">
            What happens next
          </p>
          <h2
            className="text-2xl font-medium md:text-3xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Four steps to <span className="italic text-red-200">verified-at-the-door</span> delivery.
          </h2>

          <ol className="mt-8 grid gap-4 md:grid-cols-4">
            {[
              { n: 1, title: 'Seller prepares', desc: 'They have 24 hours to accept and pack the order.' },
              { n: 2, title: 'Driver picks up', desc: 'Your delivery code is generated and sent by SMS.' },
              { n: 3, title: 'Driver arrives', desc: 'Inspect the order. Hand over the code only when satisfied.' },
              { n: 4, title: 'Seller paid', desc: 'Escrow releases automatically 24 hours after delivery.' },
            ].map((step) => (
              <li key={step.n} className="rounded-xl border border-blue-500 bg-blue-800 p-4">
                <div className="text-xl font-bold text-red-200" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                  0{step.n}
                </div>
                <div className="mt-2 text-base font-semibold">{step.title}</div>
                <div className="mt-1 text-sm text-blue-100">{step.desc}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Order summary */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-xl font-bold text-neutral-900">Order summary</h2>
          <ul className="mt-4 space-y-3 rounded-xl border border-neutral-200 bg-neutral-0 p-4">
            {order.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3 border-b border-neutral-100 pb-3 last:border-0 last:pb-0">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {(item.product_snapshot as { name?: string })?.name ?? 'Item'}
                  </div>
                  <div className="text-xs text-neutral-600">
                    {item.seller.business_name} &middot; Qty {item.quantity}
                  </div>
                </div>
                <div className="text-sm font-semibold text-neutral-900">
                  ${Number(item.subtotal).toFixed(2)}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-0 p-4 text-sm">
            <Row label="Subtotal" value={`$${Number(order.subtotal).toFixed(2)}`} />
            <Row label="Shipping" value={`$${Number(order.shipping_fee).toFixed(2)}`} />
            <div className="mt-2 border-t border-neutral-200 pt-2 flex justify-between text-base">
              <span className="font-bold text-neutral-900">Total paid into escrow</span>
              <span className="font-bold text-neutral-900">${Number(order.total_amount).toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Keep browsing
            </Link>
            <Link
              href="/trust-center"
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              How protection works
            </Link>
          </div>
        </div>
      </section>
    </main>
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
