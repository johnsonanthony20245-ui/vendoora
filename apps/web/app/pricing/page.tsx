import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Seller pricing — ${BRAND_NAME}`,
  description:
    'Four plans. Lower commission as you grow. Vendoora is free to start; you pay nothing until you sell.',
};

interface PlanTier {
  name: string;
  price: string;
  priceNote: string;
  commission: string;
  highlight: boolean;
  cta: string;
  features: Array<{ label: string; included: boolean }>;
}

const PLANS: PlanTier[] = [
  {
    name: 'Starter',
    price: 'Free',
    priceNote: 'forever',
    commission: '12% per order',
    highlight: false,
    cta: 'Start free',
    features: [
      { label: 'Up to 25 active listings', included: true },
      { label: 'Escrow + delivery code protection', included: true },
      { label: 'KYC Tier 1 included', included: true },
      { label: 'Weekly payouts', included: true },
      { label: 'Pinned product slots', included: false },
      { label: 'Bulk CSV upload', included: false },
      { label: 'Advanced analytics', included: false },
      { label: 'Instant payouts', included: false },
    ],
  },
  {
    name: 'Growth',
    price: '$15',
    priceNote: '/ month',
    commission: '10% per order',
    highlight: true,
    cta: 'Choose Growth',
    features: [
      { label: 'Up to 200 active listings', included: true },
      { label: 'Escrow + delivery code protection', included: true },
      { label: 'KYC Tier 2 verification', included: true },
      { label: '3 pinned product slots', included: true },
      { label: 'Bulk CSV upload', included: true },
      { label: 'Weekly payouts (daily upgrade $5/mo)', included: true },
      { label: 'Advanced analytics', included: false },
      { label: 'Instant payouts', included: false },
    ],
  },
  {
    name: 'Pro',
    price: '$45',
    priceNote: '/ month',
    commission: '8% per order',
    highlight: false,
    cta: 'Choose Pro',
    features: [
      { label: 'Unlimited active listings', included: true },
      { label: 'KYC Tier 3 verification', included: true },
      { label: '10 pinned product slots', included: true },
      { label: 'Bulk CSV upload', included: true },
      { label: 'Advanced analytics + 30-day forecast', included: true },
      { label: 'Instant payouts (MoMo / Orange)', included: true },
      { label: 'Custom SEO controls', included: true },
      { label: 'Priority support', included: true },
    ],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    priceNote: 'talk to us',
    commission: '5–7% negotiated',
    highlight: false,
    cta: 'Contact sales',
    features: [
      { label: 'Everything in Pro', included: true },
      { label: 'KYC Tier 4 platform-verified status', included: true },
      { label: 'Up to 25 pinned slots', included: true },
      { label: 'Dedicated account manager', included: true },
      { label: 'White-glove onboarding', included: true },
      { label: 'Custom commission negotiation', included: true },
      { label: 'API access', included: true },
      { label: 'SLA-backed support', included: true },
    ],
  },
];

export default function PricingPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            For sellers
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Sell with{' '}
            <span className="italic text-red-200">{BRAND_NAME}.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            Start free. Lower commission as you grow. Every order is escrow-protected and
            code-verified — buyers trust the badge, you get paid faster.
          </p>
        </div>
      </section>

      {/* Plan grid */}
      <section className="px-6 py-12 md:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-4">
            {PLANS.map((p) => (
              <article
                key={p.name}
                className={`flex flex-col rounded-2xl border-2 bg-neutral-0 p-6 ${
                  p.highlight
                    ? 'border-blue-700 shadow-lg'
                    : 'border-neutral-200'
                }`}
              >
                {p.highlight && (
                  <span className="self-start rounded-full bg-blue-700 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-neutral-0">
                    Most popular
                  </span>
                )}
                <h2 className="mt-3 text-xl font-bold text-neutral-900">{p.name}</h2>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-neutral-900">{p.price}</span>
                  <span className="text-sm text-neutral-600">{p.priceNote}</span>
                </div>

                <div className="mt-1 text-sm font-semibold text-blue-700">
                  {p.commission}
                </div>

                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((f, i) => (
                    <li
                      key={i}
                      className={`flex items-start gap-2 ${
                        f.included ? 'text-neutral-900' : 'text-neutral-400'
                      }`}
                    >
                      <span aria-hidden className="shrink-0">
                        {f.included ? '✓' : '×'}
                      </span>
                      <span>{f.label}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  <Link
                    href="/#categories"
                    className={`block w-full rounded-lg px-4 py-2.5 text-center text-sm font-semibold transition ${
                      p.highlight
                        ? 'bg-blue-700 text-neutral-0 hover:bg-blue-800'
                        : 'border border-neutral-300 bg-neutral-0 text-neutral-900 hover:bg-neutral-100'
                    }`}
                  >
                    {p.cta}
                  </Link>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-6 max-w-3xl text-xs text-neutral-500">
            Seller onboarding lands in a future slice. Today the &quot;Choose plan&quot;
            buttons link back home — the seller console + KYC flow + plan selection are
            tracked under Playbook §6 (Phase 4 Seller Infrastructure).
          </p>
        </div>
      </section>

      {/* Why these prices */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Why we charge what we charge
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            Three honest reasons.
          </h2>

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <div className="text-sm font-bold uppercase tracking-wider text-blue-700">
                Escrow infrastructure
              </div>
              <p className="mt-2 text-sm text-neutral-700">
                Holding money is expensive — payment provider fees, reconciliation, the
                insurance fund. Commission funds the trust mechanic everyone relies on.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <div className="text-sm font-bold uppercase tracking-wider text-blue-700">
                KYC + Trust &amp; Safety
              </div>
              <p className="mt-2 text-sm text-neutral-700">
                Verifying sellers, reviewing disputes within 48 hours, running fraud
                detection — there&apos;s a real team behind every badge.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <div className="text-sm font-bold uppercase tracking-wider text-blue-700">
                Growth that pays you back
              </div>
              <p className="mt-2 text-sm text-neutral-700">
                Higher tiers don&apos;t just save commission — they unlock pinned slots,
                instant payouts, and the audience that comes with a verified-elite badge.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/trust-center"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            How escrow protects you too
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
