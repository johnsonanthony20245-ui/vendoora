import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { IS_CLERK_ENABLED } from '../../../lib/auth';
import { getSellerSession } from '../../../lib/seller-auth';
import { devSellerSignIn } from '../../actions/seller-auth';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Seller sign-in — ${BRAND_NAME}`,
};

const ERROR_COPY: Record<string, string> = {
  missing_slug: 'Enter your business slug.',
  not_found: 'No seller with that slug. Did you complete the onboarding wizard?',
  dev_only: 'Dev sign-in is disabled in production.',
};

interface PageProps {
  searchParams: Promise<{ error?: string; slug?: string }>;
}

export default async function SellerSignInPage({ searchParams }: PageProps) {
  // Already signed in → straight to the console.
  const session = await getSellerSession();
  if (session) redirect('/sell/console');

  const sp = await searchParams;
  const errorCopy = sp.error ? ERROR_COPY[sp.error] ?? 'Could not sign you in.' : null;

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <Link href="/sell" className="text-xs font-semibold text-blue-700 hover:underline">
          ← Become a seller
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-neutral-900">Seller sign-in</h1>
        <p className="mt-1 text-sm text-neutral-600">
          The seller console for {BRAND_NAME}.
        </p>

        {errorCopy && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorCopy}
          </div>
        )}

        {IS_CLERK_ENABLED ? (
          <div className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-6 text-sm text-neutral-700">
            Production sign-in goes through Clerk. Use the Clerk SignIn component or your Clerk
            user with a Seller record. (Wiring this UI to Clerk is a tracked follow-up.)
          </div>
        ) : (
          <form
            action={devSellerSignIn}
            className="mt-8 rounded-xl border border-neutral-200 bg-neutral-0 p-6"
          >
            <p className="mb-4 text-xs font-bold uppercase tracking-widest text-amber-700">
              Dev sign-in · not in production
            </p>
            <label htmlFor="slug" className="block text-xs font-bold uppercase tracking-widest text-neutral-600">
              Business slug
            </label>
            <input
              id="slug"
              name="slug"
              required
              defaultValue={sp.slug ?? ''}
              placeholder="e.g. konah-boutique"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="submit"
              className="mt-4 w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-blue-800"
            >
              Sign in
            </button>
            <p className="mt-3 text-xs text-neutral-500">
              Production uses Clerk; this dev flow only verifies the slug exists in the DB.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
