'use client';

import Link from 'next/link';
import { useAuth, UserButton } from '@clerk/nextjs';

/**
 * Clerk-enabled header auth slot, resolved entirely on the client.
 *
 * Why client-only: this slot lives in the root-layout header, so it renders on
 * every route — including the marketing and policy pages exported as
 * `force-static`. Clerk's server-aware control component (<Show>) calls auth()
 * during render; on a statically prerendered page that throws "auth() was
 * called but Clerk can't detect usage of clerkMiddleware()" because middleware
 * never runs at build time. Reading auth through the useAuth() client hook keeps
 * those pages static: during prerender the hook reports `isLoaded: false`, we
 * render the signed-out link, and the real state resolves after hydration.
 *
 * Signed-out (and while loading): a small "Sign in" link in the .icon-btn rhythm.
 * Signed-in : Clerk's UserButton — avatar + dropdown with the user's
 *             account/orders/sign-out menu.
 */
export function ClerkAuthSlot() {
  const { isLoaded, isSignedIn } = useAuth();

  if (isLoaded && isSignedIn) {
    return <UserButton />;
  }

  return (
    <Link
      href="/sign-in"
      className="icon-btn"
      aria-label="Sign in"
      style={{ width: 'auto', padding: '0 var(--space-3)', fontSize: 13, fontWeight: 600 }}
    >
      Sign in
    </Link>
  );
}
