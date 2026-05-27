import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BRAND_NAME } from '@vendoora/types';
import { IS_CLERK_ENABLED } from '../../../lib/auth';
import { DEV_ADMIN_COOKIE_NAME } from '../../../lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `Admin sign-in — ${BRAND_NAME}`,
};

/**
 * Standalone admin sign-in page (the regular /sign-in is buyer-flow).
 *
 * In production with Clerk enabled this just redirects to /sign-in?redirect_url=
 * /admin and lets Clerk handle it. Without Clerk, exposes the dev cookie
 * affordance so the queue can be exercised before Clerk is wired.
 */
export default function AdminSignIn() {
  if (IS_CLERK_ENABLED) {
    redirect('/sign-in?redirect_url=%2Fadmin');
  }

  async function devLogin() {
    'use server';
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Dev admin login is disabled in production.');
    }
    const { cookies } = await import('next/headers');
    const c = await cookies();
    c.set(DEV_ADMIN_COOKIE_NAME, '1', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      // 12-hour session — admin work doesn't need long-lived cookies.
      maxAge: 60 * 60 * 12,
    });
    redirect('/admin');
  }

  return (
    <main className="bg-neutral-50 min-h-screen px-6 py-16">
      <div className="mx-auto max-w-md">
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
          Admin
        </p>
        <h1 className="mt-2 text-3xl font-bold text-neutral-900">Sign in to T&amp;S</h1>

        <div className="mt-8 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-6">
          <h2 className="text-base font-bold text-amber-900">
            Clerk is not configured for this deployment.
          </h2>
          <p className="mt-2 text-sm text-amber-800">
            In production, T&amp;S sign-in uses Clerk + the{' '}
            <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">
              ADMIN_CLERK_USER_IDS
            </code>{' '}
            allowlist. For local dev, set the cookie and proceed.
          </p>

          <form action={devLogin} className="mt-5">
            <button
              type="submit"
              className="w-full rounded-lg bg-amber-700 px-4 py-2.5 text-sm font-semibold text-neutral-0 hover:bg-amber-800"
            >
              Continue with dev cookie
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-sm text-neutral-600">
          <Link href="/" className="font-semibold text-blue-700 hover:underline">
            ← Back to site
          </Link>
        </p>
      </div>
    </main>
  );
}
