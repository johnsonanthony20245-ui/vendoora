import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';
import { WizardStepper } from '../../../components/WizardStepper';
import { getOnboardingDraft, submitStep1 } from '../../actions/seller-onboarding';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Sell on ${BRAND_NAME} — step 1`,
};

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SellerOnboardingStep1({ searchParams }: PageProps) {
  const { error } = await searchParams;
  const draft = await getOnboardingDraft();

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-12">
      <div className="mx-auto max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Open a store on {BRAND_NAME}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Your business</h1>
        <p className="mt-1 text-sm text-neutral-600">
          We&apos;ll use this on your storefront and on every listing. You can
          rename later from the seller console.
        </p>

        <div className="mt-8">
          <WizardStepper current={1} />
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">
            {decodeURIComponent(error)}
          </div>
        )}

        <form action={submitStep1} className="mt-8 space-y-5">
          <Field
            id="business_name"
            label="Business name"
            placeholder="Konah Boutique"
            defaultValue={draft.business_name ?? ''}
            required
          />
          <Field
            id="business_slug"
            label="Storefront URL"
            placeholder="konah-boutique"
            defaultValue={draft.business_slug ?? ''}
            prefix={`${BRAND_NAME.toLowerCase()}.com/store/`}
            hint="Letters, digits, hyphens. Leave blank to auto-fill from the name."
          />
          <Field
            id="business_phone"
            label="Business phone"
            placeholder="+231 77 000 0000"
            defaultValue={draft.business_phone ?? ''}
            required
            type="tel"
            hint="Used for delivery notifications and customer messages. Include +231."
          />
          <Field
            id="business_email"
            label="Business email"
            placeholder="hello@konah-boutique.lr"
            defaultValue={draft.business_email ?? ''}
            required
            type="email"
            hint="Used for payout receipts and order notifications."
          />

          <div className="flex flex-wrap gap-3 pt-3">
            <button
              type="submit"
              className="rounded-lg bg-blue-700 px-6 py-2.5 text-sm font-bold text-neutral-0 hover:bg-blue-800"
            >
              Next: location →
            </button>
            <Link
              href="/"
              className="rounded-lg border border-neutral-300 bg-neutral-0 px-5 py-2.5 text-sm font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  placeholder,
  defaultValue,
  required,
  type = 'text',
  hint,
  prefix,
}: {
  id: string;
  label: string;
  placeholder: string;
  defaultValue: string;
  required?: boolean;
  type?: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-bold uppercase tracking-widest text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      <div className={`mt-1 flex rounded-lg border border-neutral-300 bg-neutral-0 ${prefix ? '' : ''}`}>
        {prefix && (
          <span className="border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
            {prefix}
          </span>
        )}
        <input
          id={id}
          name={id}
          type={type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="flex-1 rounded-lg bg-transparent px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-700/20"
        />
      </div>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
