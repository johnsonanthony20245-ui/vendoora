import Link from 'next/link';
import { Show, UserButton } from '@clerk/nextjs';

/**
 * The Clerk-enabled variant of the header right-slot. Imported only when
 * IS_CLERK_ENABLED is true so no-Clerk builds never pull these components.
 *
 * Clerk 7 dropped the legacy <SignedIn>/<SignedOut> components in favour of
 * a single <Show when="signed-in" | "signed-out" /> control.
 */
export function ClerkHeaderSlot() {
  return (
    <>
      <Show when="signed-out">
        <Link
          href="/sign-in"
          className="hidden rounded-lg border border-neutral-300 bg-neutral-0 px-3 py-1.5 text-sm font-semibold text-neutral-900 transition hover:border-blue-700 hover:text-blue-700 sm:inline-flex"
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
