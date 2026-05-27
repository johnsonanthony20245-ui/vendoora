/**
 * Auth wrapper that gracefully degrades when Clerk env vars are missing.
 *
 * In a fresh clone with no Clerk keys configured, IS_CLERK_ENABLED is false:
 * the app renders, all existing routes work, and "Sign in" links route to
 * /sign-in which renders a clear configuration message instead of crashing.
 *
 * Drop NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY into .env to
 * activate the full sign-in/sign-up flow without code changes.
 */

export const IS_CLERK_ENABLED = Boolean(
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] &&
    process.env['CLERK_SECRET_KEY'],
);

/**
 * Buyer identity for an incoming request. When Clerk is enabled and the user
 * is signed in, returns the Prisma User id (synced from Clerk on first sight).
 * Otherwise returns null — the existing guest-checkout / cart-cookie posture
 * carries the flow.
 *
 * Callers that need to act on identity (e.g. attach an order to a user) should
 * use this and treat null as "guest".
 */
export async function getCurrentBuyerUserId(): Promise<string | null> {
  if (!IS_CLERK_ENABLED) return null;

  // Dynamic import so the @clerk/nextjs/server bundle is not loaded in
  // builds where Clerk is disabled (saves ~15kb on the cold path).
  const { auth } = await import('@clerk/nextjs/server');
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  const { syncClerkUser } = await import('./user-sync');
  const user = await syncClerkUser(clerkId);
  return user.id;
}
