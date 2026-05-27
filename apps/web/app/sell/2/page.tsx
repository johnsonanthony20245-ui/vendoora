import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { prisma } from '@vendoora/db';
import { WizardStepper } from '../../../components/WizardStepper';
import { getOnboardingDraft, submitStep2 } from '../../actions/seller-onboarding';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Sell on ${BRAND_NAME} — step 2`,
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SellerOnboardingStep2({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const draft = await getOnboardingDraft();
  if (!draft.business_name) redirect('/sell/1');

  const zones = await prisma.deliveryZone.findMany({
    where: { is_active: true },
    orderBy: { name: 'asc' },
    select: { name: true, county: true, city: true },
  });

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Open a store on {BRAND_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Where you sell from</h1>
        <p className="mt-1 text-sm text-neutral-600">
          We use this to match you with the right driver pool and to show the
          right delivery estimate on each listing.
        </p>

        <div className="mt-8">
          <WizardStepper current={2} />
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={submitStep2} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="delivery_city"
              className="block text-xs font-bold uppercase tracking-widest text-neutral-700"
            >
              City / delivery zone<span className="ml-1 text-red-500">*</span>
            </label>
            <select
              id="delivery_city"
              name="delivery_city"
              required
              defaultValue={draft.delivery_city ?? ''}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-2 text-sm text-neutral-900"
            >
              <option value="" disabled>
                Pick your home zone…
              </option>
              {zones.map((z) => (
                <option key={z.name} value={z.name}>
                  {[z.city, z.county].filter(Boolean).join(', ') || z.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              You can list to buyers anywhere we deliver — this is your pickup
              zone.
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-3">
            <Link
              href="/sell/1"
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              ← Back
            </Link>
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-neutral-0 hover:bg-blue-800"
            >
              Next: plan →
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
