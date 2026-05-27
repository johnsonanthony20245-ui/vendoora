import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';

export const dynamic = 'force-static';

export const metadata = {
  title: `Seller verification — ${BRAND_NAME}`,
  description:
    'The four KYC tiers — what each one verifies, what the badge means to buyers, and how sellers graduate.',
};

interface Tier {
  tier: number;
  name: string;
  badge: string;
  badgeTone: string;
  audience: string;
  verified: string[];
  unlocks: string[];
  graduate: string;
}

const TIERS: Tier[] = [
  {
    tier: 1,
    name: 'Phone verified',
    badge: 'T1',
    badgeTone: 'bg-neutral-200 text-neutral-700 ring-neutral-300',
    audience: 'Brand-new sellers exploring the platform.',
    verified: [
      'Phone number — SMS code sent and received',
      'Email — link clicked',
      'Liberian phone country code (+231) confirmed',
    ],
    unlocks: [
      'Up to 25 active listings',
      'Escrow + delivery code on every order',
      'Weekly payouts',
    ],
    graduate: 'Upload a government ID through the seller console to apply for T2.',
  },
  {
    tier: 2,
    name: 'Identity verified',
    badge: 'T2',
    badgeTone: 'bg-blue-50 text-blue-700 ring-blue-200',
    audience: 'Established individual sellers.',
    verified: [
      'Government photo ID (passport, voter card, drivers license)',
      'Selfie liveness check matched to the ID photo',
      'Address declared and cross-checked against the ID',
    ],
    unlocks: [
      'Up to 200 active listings',
      '3 pinned product slots',
      'Bulk CSV upload',
      'Daily payouts available as an add-on',
      'T2 badge visible on every listing',
    ],
    graduate: 'Submit a Liberia Business Registry filing to apply for T3.',
  },
  {
    tier: 3,
    name: 'Business verified',
    badge: 'T3',
    badgeTone: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    audience: 'Registered businesses and storefronts.',
    verified: [
      'Liberia Business Registry filing or LRA tax record',
      'Business address physically confirmed (postcard or in-person)',
      'A real banking or MoMo merchant account linked to the business',
    ],
    unlocks: [
      'Unlimited listings',
      '10 pinned product slots',
      'Advanced analytics + 30-day demand forecast',
      'Instant payouts (MoMo / Orange)',
      'Custom SEO controls',
      'T3 badge — most buyers feel safe ordering large amounts',
    ],
    graduate: 'Apply for T4 via your account manager. Includes an in-person shop visit.',
  },
  {
    tier: 4,
    name: 'Platform verified',
    badge: 'T4',
    badgeTone: 'bg-purple-50 text-purple-700 ring-purple-200',
    audience: 'High-volume sellers with a physical presence we have visited.',
    verified: [
      'Everything in T3',
      'In-person Vendoora team visit to the shop or warehouse',
      'Supply-chain documentation reviewed',
      'Authenticated audit of inventory authenticity claims (Vlisco, electronics, etc.)',
    ],
    unlocks: [
      'Up to 25 pinned slots',
      'Dedicated account manager',
      'White-glove onboarding for new product lines',
      'API access',
      'SLA-backed support',
      'T4 badge — the strongest trust signal on Vendoora',
    ],
    graduate: 'You are at the top. Welcome.',
  },
];

export default function SellerVerificationPage() {
  return (
    <main className="bg-neutral-50">
      {/* Hero */}
      <section className="bg-blue-900 px-6 py-20 text-neutral-0 md:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
            Seller verification
          </p>
          <h1
            className="mt-3 text-4xl font-medium leading-tight md:text-6xl"
            style={{ fontFamily: 'var(--font-fraunces)' }}
          >
            Four tiers. One <span className="italic text-red-200">honest</span> ladder.
          </h1>
          <p className="mt-6 max-w-2xl text-base text-blue-100 md:text-lg">
            Every {BRAND_NAME} seller has at minimum a verified phone and email. From
            there the ladder is open: more verification = bigger badge =
            more buyers willing to place bigger orders. We work hard to make
            sure each rung means what it says.
          </p>
        </div>
      </section>

      {/* Tier cards */}
      <section className="px-6 py-12 md:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-2">
            {TIERS.map((t) => (
              <article
                key={t.tier}
                className="flex flex-col rounded-2xl border border-neutral-200 bg-neutral-0 p-6"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset ${t.badgeTone}`}
                  >
                    {t.badge}
                  </span>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                      Tier {t.tier}
                    </div>
                    <h2 className="text-xl font-bold text-neutral-900">{t.name}</h2>
                  </div>
                </div>
                <p className="mt-4 text-sm italic text-neutral-600">{t.audience}</p>

                <div className="mt-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    What we verify
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
                    {t.verified.map((v) => (
                      <li key={v} className="flex items-start gap-2">
                        <span aria-hidden className="mt-0.5 shrink-0 text-emerald-600">
                          ✓
                        </span>
                        <span>{v}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    What it unlocks
                  </div>
                  <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
                    {t.unlocks.map((u) => (
                      <li key={u} className="flex items-start gap-2">
                        <span aria-hidden className="mt-0.5 shrink-0 text-blue-700">
                          →
                        </span>
                        <span>{u}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-auto pt-6">
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600">
                    <span className="font-semibold uppercase tracking-wider text-neutral-500">
                      To graduate:
                    </span>{' '}
                    {t.graduate}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="border-t border-neutral-200 bg-neutral-0 px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Why this matters
          </p>
          <h2 className="mt-2 text-2xl font-bold text-neutral-900 md:text-3xl">
            The badge is a promise, not a sticker.
          </h2>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <h3 className="text-base font-bold text-neutral-900">For buyers</h3>
              <p className="mt-2 text-sm text-neutral-700">
                The tier on a listing tells you how much we&apos;ve already verified
                about the person on the other end. Combined with escrow and the
                door-code, a T3 or T4 purchase is genuinely low-risk.
              </p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-6">
              <h3 className="text-base font-bold text-neutral-900">For sellers</h3>
              <p className="mt-2 text-sm text-neutral-700">
                Higher tiers genuinely move product. Buyers filter by tier; sponsored
                slots prefer T3+; the conversion gap between T1 and T3 is the
                biggest reason to invest the hour to upload your business
                registration.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cross-links */}
      <section className="border-t border-neutral-200 px-6 py-12">
        <div className="mx-auto max-w-5xl flex flex-wrap gap-3">
          <Link
            href="/kyc-policy"
            className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
          >
            KYC policy + data handling →
          </Link>
          <Link
            href="/pricing"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Seller pricing
          </Link>
          <Link
            href="/trust-center"
            className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
          >
            Trust Center
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
