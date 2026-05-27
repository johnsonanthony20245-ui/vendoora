import Link from 'next/link';
import { BRAND_NAME } from '@vendoora/types';
import { IS_CLERK_ENABLED } from '../../../lib/auth';
import { ClerkAuthCard } from '../../../components/ClerkAuthCard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Create account — ${BRAND_NAME}`,
};

export default function SignUpPage() {
  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="text-xs font-bold uppercase tracking-widest text-neutral-500 hover:text-blue-700"
        >
          ← Back to {BRAND_NAME}
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-neutral-900">Create your account</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Order with escrow protection. Open a store when you&apos;re ready. Your
          phone is your delivery-code anchor — keep it accurate.
        </p>

        <div className="mt-8">
          {IS_CLERK_ENABLED ? (
            <ClerkAuthCard mode="signUp" />
          ) : (
            <ConfigurationNotice />
          )}
        </div>

        <p className="mt-8 text-center text-sm text-neutral-600">
          Already have one?{' '}
          <Link href="/sign-in" className="font-semibold text-blue-700 hover:underline">
            Sign in
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
        Sign-up is not configured for this deployment.
      </h2>
      <p className="mt-2 text-sm text-amber-800">
        Drop Clerk keys into <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env</code>{' '}
        to activate. The marketplace works as a guest until then — every order
        is still escrow-protected and code-verified.
      </p>
    </div>
  );
}
