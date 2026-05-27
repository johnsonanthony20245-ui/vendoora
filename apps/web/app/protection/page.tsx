import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Buyer Protection — ${BRAND_NAME}`,
  description:
    'What Vendoora protects you against, what we don’t cover, and how to open a dispute.',
};

const PROTECTED_CATEGORIES = [
  {
    icon: '📦',
    title: "Didn't receive it",
    body: 'Driver marked it delivered but the package never arrived, or it was delivered to the wrong address.',
  },
  {
    icon: '💥',
    title: 'Arrived damaged',
    body: 'Packaging or contents broken on arrival. We compare the photo-of-delivery against your evidence.',
  },
  {
    icon: '🔁',
    title: 'Wrong item',
    body: 'You received something other than what was on the listing — wrong size, wrong color, wrong product entirely.',
  },
  {
    icon: '⚠️',
    title: 'Counterfeit',
    body: 'The item is fake. T&S reviews seller authenticity claims and uploaded proof to decide.',
  },
  {
    icon: '📋',
    title: 'Quality not as described',
    body: 'Listing said one thing, reality is materially different — fabric, ingredients, condition, etc.',
  },
  {
    icon: '🚨',
    title: 'Fraud',
    body: 'Seller misrepresented the offer or your card was used without your authorization.',
  },
];

const EXCLUSIONS = [
  'Buyer’s remorse — changed your mind after a perfect delivery. (Some sellers offer their own returns. Check the listing.)',
  'Damage caused after the driver handed it over to you.',
  'Items that arrived correct but you wanted a different variant or size.',
  'Disputes opened outside the 24-hour window after delivery.',
  'Off-platform transactions. If the conversation moved to WhatsApp and money changed hands there, we cannot protect you.',
];

const DISPUTE_STEPS = [
  {
    n: 1,
    title: 'Open the dispute',
    body: 'From your order tracking page, click "Open a dispute". You have 24 hours after delivery.',
  },
  {
    n: 2,
    title: 'Tell us what happened',
    body: 'Pick a category and write at least a few sentences. The more specific, the faster T&S can investigate.',
  },
  {
    n: 3,
    title: 'Money freezes in escrow',
    body: 'The seller doesn’t get paid while T&S reviews. Your payment stays frozen.',
  },
  {
    n: 4,
    title: 'T&S investigates',
    body: 'A Trust & Safety analyst reviews the order, your evidence, the seller’s response, and the delivery photo + GPS metadata.',
  },
  {
    n: 5,
    title: 'You and the seller can add evidence',
    body: 'Photos, videos, receipts. The dispute thread is private to you, the seller, and T&S.',
  },
  {
    n: 6,
    title: 'Resolution within 48 hours',
    body: 'Refund to you, release to seller, partial refund, or insurance-fund payout — based on the evidence.',
  },
];

export default function ProtectionPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Buyer Protection
          </p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight md:text-5xl">
            If something&apos;s wrong, you don&apos;t pay for it.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-blue-100 md:text-lg">
            Your money lives in {BRAND_NAME} escrow until you confirm delivery. If anything goes
            sideways, we&apos;ve got a clear, fast process to make you whole.
          </p>
        </div>
      </section>

      {/* What we protect */}
      <section className="border-b border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            What you&apos;re protected against
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Six categories. Full refund on legitimate claims.
          </h2>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {PROTECTED_CATEGORIES.map((c) => (
              <article
                key={c.title}
                className="rounded-xl border border-neutral-200 bg-neutral-50 p-6"
              >
                <div className="text-3xl" aria-hidden>{c.icon}</div>
                <h3 className="mt-3 text-base font-bold text-neutral-900">{c.title}</h3>
                <p className="mt-2 text-sm text-neutral-700">{c.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* What we don't cover */}
      <section className="border-b border-neutral-200 bg-neutral-50 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            What we don&apos;t cover
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            We&apos;d rather be honest with you up front.
          </h2>

          <ul className="mt-8 space-y-3">
            {EXCLUSIONS.map((e, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-lg border border-neutral-200 bg-neutral-0 p-4"
              >
                <span aria-hidden className="text-lg text-neutral-400">×</span>
                <span className="text-sm text-neutral-700">{e}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How to dispute */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            How to open a dispute
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Six steps. ~48 hours from open to resolution.
          </h2>

          <ol className="mt-10 space-y-4">
            {DISPUTE_STEPS.map((s) => (
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

      {/* Insurance Fund */}
      <section className="bg-blue-900 px-6 py-16 text-neutral-0 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Vendoora Insurance Fund
          </p>
          <h2 className="mt-3 text-3xl font-medium md:text-4xl" style={{ fontFamily: 'var(--font-fraunces)' }}>
            When the seller can&apos;t make you whole, <span className="italic text-red-200">we do.</span>
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <div className="text-3xl font-bold text-neutral-0">$248K</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-blue-200">
                Current fund balance
              </div>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <div className="text-3xl font-bold text-neutral-0">100%</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-blue-200">
                Insurance-paid disputes resolved
              </div>
            </div>
            <div className="rounded-xl border border-blue-500 bg-blue-800 p-6">
              <div className="text-3xl font-bold text-neutral-0">$0</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-blue-200">
                Buyer cost — funded by 0.5% of every order
              </div>
            </div>
          </div>
          <p className="mt-6 text-xs text-blue-200">
            Illustrative figures. Production wires the balance to the real PlatformConfig
            row and refreshes every 15 minutes.
          </p>
        </div>
      </section>

      {/* CTAs */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/trust-center"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            How the trust mechanic works
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
