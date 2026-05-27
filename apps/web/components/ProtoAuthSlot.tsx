import Link from 'next/link';
import { IS_CLERK_ENABLED } from '../lib/auth';

/**
 * Header auth slot — the small piece between the theme toggle and the right
 * edge that the prototype renders as a `.user-avatar` (initials in a circle).
 *
 * Real users land on their own role's surface after sign-in — there is no
 * "switch role" affordance in the production site. (The prototype's role
 * switcher was a demo-only convenience to preview every surface.)
 *
 * Signed-out:  small "Sign in" link styled to fit the .icon-btn rhythm.
 * Signed-in :  Clerk's UserButton (avatar + menu) when Clerk is enabled;
 *              when Clerk is not configured, the slot just stays a Sign in
 *              link (the rest of the buyer surface is guest-friendly).
 */
export async function ProtoAuthSlot() {
  if (!IS_CLERK_ENABLED) {
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
  const { ClerkAuthSlot } = await import('./ProtoClerkAuthSlot');
  return <ClerkAuthSlot />;
}
