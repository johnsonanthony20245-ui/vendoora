import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Safe shopping — ${BRAND_NAME}`,
  description:
    'How to spot a trustworthy seller, what to do at the door, and the five red flags that mean walk away.',
};

const GREEN_FLAGS = [
  {
    title: 'KYC badge on every product card',
    body: 'Every seller is verified before they can list. T2 is identity, T3 is business registration, T4 is platform-verified — we have physically walked into their shop.',
  },
  {
    title: 'Escrow + delivery-code icons',
    body: 'If a listing shows the ESCROW and CODE pills, the order is protected. If the listing somehow doesn’t, do not buy it.',
  },
  {
    title: 'A real, complete listing',
    body: 'Multiple photos, a real description, sensible pricing. Stock photos and prices that seem too good to be true are the classic warning signs.',
  },
  {
    title: 'Reviews on the seller storefront',
    body: 'Open the seller’s store page. Ratings, total orders, days active — these are public for a reason. A brand-new seller with no orders isn’t bad, but expect more variance.',
  },
];

const RED_FLAGS = [
  {
    title: 'They ask you to message on WhatsApp',
    body: 'The conversation that matters lives on the platform. Anything off-platform is outside our protection, period.',
  },
  {
    title: 'They want payment outside escrow',
    body: '“Pay me MoMo direct and I’ll discount it” = scam pattern. Vendoora never asks for direct payment and neither does a legitimate seller.',
  },
  {
    title: 'Pressure to confirm before inspecting',
    body: 'You decide whether the package is right BEFORE you hand over the delivery code. The driver waits. If they pressure you, refuse.',
  },
  {
    title: 'Price wildly below market',
    body: 'Vlisco wax-print at $5/yd? Pixel-7 for $80? Almost always counterfeit, stolen, or both.',
  },
  {
    title: 'No KYC badge, vague seller name, fresh account',
    body: 'You can still buy from new sellers — many great ones start here — but match it with smaller orders and lean on the code-at-the-door check.',
  },
];

const AT_THE_DOOR = [
  {
    n: 1,
    title: 'Inspect before the code',
    body: 'Open the package on the doorstep. Check the item against the listing photos and description.',
  },
  {
    n: 2,
    title: 'If anything is wrong, refuse',
    body: 'Hand the package back to the driver. Tell them you’re refusing. The order moves into review automatically.',
  },
  {
    n: 3,
    title: 'Only then, give the code',
    body: 'The 6-digit SMS code is the seller’s confirmation that delivery happened correctly. Once you give it, escrow releases on a 24-hour timer.',
  },
  {
    n: 4,
    title: 'Save your evidence',
    body: 'If you accept the package and discover a problem within 24 hours, open a dispute. Photos and videos help T&S decide quickly.',
  },
];

export default function SafeShoppingPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Safe shopping
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Trust the badge. Inspect at the{' '}
            <span className="italic text-red-200">door.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            {BRAND_NAME} already does most of the safety work for you — KYC,
            escrow, the delivery code. Here&apos;s the small set of things you do, so
            the system works the way it should.
          </p>
        </div>
      </section>

      {/* Green flags */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Trust signals
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Four things every safe order has.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {GREEN_FLAGS.map((g) => (
              <article
                key={g.title}
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-6"
              >
                <h3 className="text-base font-bold text-neutral-900">
                  <span aria-hidden className="mr-2 text-emerald-600">✓</span>
                  {g.title}
                </h3>
                <p className="mt-2 text-sm text-neutral-700">{g.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Red flags */}
      <section className="border-b border-neutral-200 bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Red flags
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Five patterns that mean walk away.
          </h2>

          <ul className="mt-10 space-y-3">
            {RED_FLAGS.map((r) => (
              <li
                key={r.title}
                className="flex gap-4 rounded-xl border border-neutral-200 bg-neutral-0 p-5"
              >
                <span
                  aria-hidden
                  className="shrink-0 text-2xl font-bold text-red-500"
                >
                  ×
                </span>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">{r.title}</h3>
                  <p className="mt-1 text-sm text-neutral-700">{r.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* At the door */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            At the door
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Four moves. In this order.
          </h2>

          <ol className="mt-10 space-y-4">
            {AT_THE_DOOR.map((s) => (
              <li
                key={s.n}
                className="flex gap-4 rounded-xl border border-neutral-200 bg-neutral-0 p-5"
              >
                <div
                  className="shrink-0 text-2xl font-bold text-blue-700"
                  style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                >
                  {String(s.n).padStart(2, '0')}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-neutral-900">{s.title}</h3>
                  <p className="mt-1 text-sm text-neutral-700">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* If something goes wrong */}
      <section className="bg-blue-900 px-6 py-16 text-neutral-0">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            If something goes wrong
          </p>
          <h2
            className="mt-3 text-3xl font-medium md:text-4xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            You have <span className="italic text-red-200">24 hours.</span>
          </h2>
          <p className="mt-4 max-w-2xl text-base text-blue-100">
            Open a dispute from the order tracking page within 24 hours of
            delivery. Your money stays frozen in escrow while Trust &amp; Safety
            reviews. Resolution lands within 48 hours.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/protection"
              className="rounded-lg bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-blue-900 hover:bg-neutral-100"
            >
              Buyer protection details →
            </Link>
            <Link
              href="/trust-center"
              className="rounded-lg border border-blue-500 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
            >
              How the trust mechanic works
            </Link>
          </div>
        </div>
      </section>

      {/* Footer links */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/seller-verification"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            How sellers get verified
          </Link>
          <Link
            href="/delivery-code"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            How the delivery code works
          </Link>
          <Link
            href="/"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            ← Back home
          </Link>
        </div>
      </section>
    </main>
  );
}
