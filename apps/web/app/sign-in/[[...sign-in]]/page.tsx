import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';
import { IS_CLERK_ENABLED } from '../../../lib/auth';
import { ClerkAuthCard } from '../../../components/ClerkAuthCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Sign in — ${BRAND_NAME}`,
};

export default function SignInPage() {
  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-blue-700"
        >
          ← Back to {BRAND_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-neutral-900">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Pick up your orders, manage your store, or open a dispute on something
          that arrived wrong.
        </p>

        <div className="mt-8">
          {IS_CLERK_ENABLED ? (
            <ClerkAuthCard mode="signIn" />
          ) : (
            <ConfigurationNotice />
          )}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-600">
          New here?{' '}
          <Link href="/sign-up" className="font-semibold text-blue-700 hover:underline">
            Create an account
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function ConfigurationNotice() {
  return (
    <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 p-6">
      <h2 className="text-base font-bold text-amber-900">
        Sign-in is not configured for this deployment.
      </h2>
      <p className="mt-2 text-sm text-amber-800">
        Drop <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
        </code>{' '}
        and{' '}
        <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
          CLERK_SECRET_KEY
        </code>{' '}
        into <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env</code>{' '}
        and restart to enable the flow. The rest of the site works as a guest
        until then.
      </p>
      <p className="mt-3 text-xs text-amber-700">
        Get keys at{' '}
        <a
          href="https://dashboard.clerk.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline"
        >
          dashboard.clerk.com
        </a>
        .
      </p>
    </div>
  );
}
