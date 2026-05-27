import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';

/**
 * Clerk-enabled variant of the header auth slot. Loaded only when
 * IS_CLERK_ENABLED is true so no-Clerk builds never pull these symbols.
 *
 * Signed-out: a small "Sign in" link in the .icon-btn rhythm.
 * Signed-in : Clerk's UserButton — avatar + dropdown with the user's
 *             account/orders/sign-out menu.
 */
export function ClerkAuthSlot() {
  return (
    <>
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="icon-btn"
          aria-label="Sign in"
          style={{ width: 'auto', padding: '0 var(--space-3)', fontSize: 13, fontWeight: 600 }}
        >
          Sign in
        </Link>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </>
  );
}
