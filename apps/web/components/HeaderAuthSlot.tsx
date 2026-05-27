import Link from 'next/link';
import { IS_CLERK_ENABLED } from '../lib/auth';

/**
 * Right-side header slot. When Clerk is enabled it loads the Clerk-aware
 * sub-component (avatar menu / sign-in link). Without Clerk it just shows
 * the Sign in link, which routes to a configuration-notice page.
 */
export async function HeaderAuthSlot() {
  if (!IS_CLERK_ENABLED) {
    return <SignInLink />;
  }
  const { ClerkHeaderSlot } = await import('./ClerkHeaderSlot');
  return <ClerkHeaderSlot />;
}

function SignInLink() {
  return (
    <Link
      href="/sign-in"
      className="hidden rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-1.5 text-sm font-semibold text-neutral-900 transition hover:border-blue-700 hover:text-blue-700 sm:inline-flex"
    >
      Sign in
    </Link>
  );
}
