import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Delivery code — ${BRAND_NAME}`,
  description:
    'The 6-digit code that confirms delivery. How it is generated, when it arrives, what to do if it doesn’t.',
};

const LIFECYCLE = [
  {
    n: 1,
    title: 'Driver picks up',
    body: 'The seller hands the package to the driver. The driver scans the order; our system generates a fresh 6-digit code and stores it as a bcrypt hash — even our team can’t read the plaintext later.',
  },
  {
    n: 2,
    title: 'Code lands by SMS',
    body: 'You receive the code by SMS the moment pickup is confirmed. The message says it is from Vendoora and lists the order number, so you can match it to the right delivery.',
  },
  {
    n: 3,
    title: 'Inspect the package',
    body: 'When the driver arrives, open the package and check it against the listing. Photos, item, condition, accessories — all of it. Take your time.',
  },
  {
    n: 4,
    title: 'Speak the code',
    body: 'Tell the driver the 6 digits out loud. The driver enters them into their app. If they match, delivery is confirmed and the escrow timer starts ticking down.',
  },
  {
    n: 5,
    title: '24-hour escrow window',
    body: 'After a correct code, escrow holds the funds for 24 more hours. If you open a dispute in that window, the money stays frozen. Otherwise it releases to the seller.',
  },
];

const RULES = [
  {
    title: 'Never give the code first.',
    body: 'Inspect before you speak. Once the code is in, the seller is on the path to getting paid. If anything is wrong, refuse the delivery and the order moves into review automatically.',
  },
  {
    title: 'Three wrong entries = Trust & Safety review.',
    body: 'If the driver enters the wrong code three times, the order is paused. A T&S analyst contacts both sides and decides — usually a re-attempt with a fresh code, sometimes a refund.',
  },
  {
    title: 'Never share the code with anyone except the driver at your door.',
    body: 'Not by phone before the driver arrives. Not by message. Not by photo of the SMS. Only spoken, only on the spot.',
  },
  {
    title: 'The code expires when the order does.',
    body: 'Codes are tied to the order. If a delivery is cancelled or rolled back, the code is invalidated automatically — no leftover risk.',
  },
];

const TROUBLESHOOTING = [
  {
    q: 'I didn’t get an SMS.',
    a: 'Check the order tracking page — the code is also visible there once the driver has picked up. If neither shows, contact support; we can re-send.',
  },
  {
    q: 'The driver says the code is wrong.',
    a: 'Re-read it slowly. Make sure you’re looking at the right order’s message. If two attempts fail, ask the driver to verify the order number on their screen against yours.',
  },
  {
    q: 'The driver is in a rush and asks me to confirm by phone instead.',
    a: 'Don’t. The code is the only signal we accept. If a driver pressures you, refuse delivery and report it via the order tracking page.',
  },
  {
    q: 'My phone is dead and I can’t see the code.',
    a: 'Use a friend’s phone to log in, or open the order on a laptop. The code is also visible in the order tracking page for the verified buyer.',
  },
  {
    q: 'I gave the code but the item is wrong.',
    a: 'Open a dispute within 24 hours from the order page. Escrow stays frozen while T&S investigates.',
  },
];

export default function DeliveryCodePage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Delivery code
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Six digits.{' '}
            <span className="italic text-red-200">One door.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            The code is the moment of consent in every {BRAND_NAME} order. The seller
            does not get paid until you, at your door, say it out loud. Here is exactly
            how it works.
          </p>
        </div>
      </section>

      {/* Code badge visual */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-3 rounded-2xl border-2 border-blue-700 bg-blue-50 px-8 py-6">
            {['8', '3', '4', '7', '1', '2'].map((d, i) => (
              <span
                key={i}
                className="text-4xl font-bold text-blue-900 md:text-5xl"
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
              >
                {d}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            Sample. Real codes are randomly generated server-side and never reused.
          </p>
        </div>
      </section>

      {/* Lifecycle */}
      <section className="border-b border-neutral-200 bg-neutral-50 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Lifecycle
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Five moments. Pickup to payout.
          </h2>

          <ol className="mt-10 space-y-4">
            {LIFECYCLE.map((s) => (
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

      {/* Rules */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Four rules
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            If you remember nothing else, remember these.
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {RULES.map((r) => (
              <div
                key={r.title}
                className="rounded-xl border-2 border-red-500/30 bg-red-50 p-6"
              >
                <h3 className="text-base font-bold text-red-700">{r.title}</h3>
                <p className="mt-2 text-sm text-neutral-800">{r.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security panel */}
      <section className="bg-blue-900 px-6 py-16 text-neutral-0">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            How it stays safe
          </p>
          <h2
            className="mt-3 text-3xl font-medium md:text-4xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            What an attacker would need.
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Your phone</h3>
              <p className="mt-2 text-sm text-blue-100">
                The SMS lands on the verified phone number on the account. Without it,
                no code.
              </p>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Your door</h3>
              <p className="mt-2 text-sm text-blue-100">
                The driver only enters codes in person, on a verified delivery scan.
                Phone-call confirmations are never accepted.
              </p>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <h3 className="text-base font-bold text-neutral-0">Three tries</h3>
              <p className="mt-2 text-sm text-blue-100">
                Wrong codes lock the order to manual review. Brute force is not a
                strategy that works here.
              </p>
            </div>
          </div>

          <p className="mt-8 text-sm text-blue-100">
            The code itself is stored as a bcrypt hash. Even our engineers cannot read
            the original 6 digits — only verify that the right ones were spoken.
          </p>
        </div>
      </section>

      {/* Troubleshooting */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Troubleshooting
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            The things people actually ask us.
          </h2>

          <dl className="mt-10 space-y-4">
            {TROUBLESHOOTING.map((t) => (
              <div
                key={t.q}
                className="rounded-xl border border-neutral-200 bg-neutral-0 p-5"
              >
                <dt className="text-base font-semibold text-neutral-900">{t.q}</dt>
                <dd className="mt-2 text-sm text-neutral-700">{t.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Footer */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/safe-shopping"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            Safe-shopping checklist →
          </Link>
          <Link
            href="/protection"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Buyer protection
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
