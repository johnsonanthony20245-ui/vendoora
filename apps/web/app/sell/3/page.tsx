import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { WizardStepper } from '../../../components/WizardStepper';
import { getOnboardingDraft, submitStep3 } from '../../actions/seller-onboarding';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Sell on ${BRAND_NAME} — step 3`,
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

interface PlanCard {
  value: 'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE';
  name: string;
  price: string;
  commission: string;
  bullets: string[];
  recommended?: boolean;
}

const PLANS: PlanCard[] = [
  {
    value: 'STARTER',
    name: 'Starter',
    price: 'Free',
    commission: '12% per order',
    bullets: ['Up to 25 active listings', 'Escrow + delivery code', 'KYC Tier 1 included'],
  },
  {
    value: 'GROWTH',
    name: 'Growth',
    price: '$15 / month',
    commission: '10% per order',
    bullets: ['200 active listings', '3 pinned slots', 'Bulk CSV upload'],
    recommended: true,
  },
  {
    value: 'PRO',
    name: 'Pro',
    price: '$45 / month',
    commission: '8% per order',
    bullets: ['Unlimited listings', '10 pinned slots', 'Instant payouts'],
  },
  {
    value: 'ENTERPRISE',
    name: 'Enterprise',
    price: 'Custom',
    commission: '5–7% negotiated',
    bullets: ['Account manager', 'White-glove onboarding', 'API access'],
  },
];

export default async function SellerOnboardingStep3({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const draft = await getOnboardingDraft();
  if (!draft.business_name) redirect('/sell/1');
  if (!draft.delivery_city) redirect('/sell/2');

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Open a store on {BRAND_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Pick a plan</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Starter is free forever — pay nothing until you sell. Upgrade any time
          for a lower commission rate and more features.
        </p>

        <div className="mt-8">
          <WizardStepper current={3} />
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={submitStep3} className="mt-8">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((p, i) => (
              <label
                key={p.value}
                className="cursor-pointer rounded-2xl border-2 border-neutral-200 bg-neutral-0 p-5 transition has-[:checked]:border-blue-700 has-[:checked]:shadow-lg"
              >
                <input
                  type="radio"
                  name="plan"
                  value={p.value}
                  required
                  defaultChecked={i === 0}
                  className="sr-only"
                />
                {p.recommended && (
                  <span className="inline-block rounded-full bg-blue-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-neutral-0">
                    Most popular
                  </span>
                )}
                <div className="mt-2 text-lg font-bold text-neutral-900">{p.name}</div>
                <div className="mt-1 text-base font-semibold text-neutral-900">{p.price}</div>
                <div className="mt-1 text-sm font-semibold text-blue-700">
                  {p.commission}
                </div>
                <ul className="mt-4 space-y-1 text-xs text-neutral-700">
                  {p.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-1.5">
                      <span aria-hidden className="shrink-0 text-emerald-600">✓</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </label>
            ))}
          </div>

          <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-5">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-700">
              Review
            </h2>
            <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <Row label="Business" value={draft.business_name ?? '—'} />
              <Row
                label="Storefront"
                value={`${BRAND_NAME.toLowerCase()}.com/store/${draft.business_slug ?? '—'}`}
              />
              <Row label="Phone" value={draft.business_phone ?? '—'} />
              <Row label="Email" value={draft.business_email ?? '—'} />
              <Row label="Pickup zone" value={draft.delivery_city ?? '—'} />
            </dl>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sell/2"
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              ← Back
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-neutral-0 hover:bg-blue-800"
            >
              Open my store →
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-widest text-neutral-500">{label}</dt>
      <dd className="text-sm font-semibold text-neutral-900">{value}</dd>
    </div>
  );
}
