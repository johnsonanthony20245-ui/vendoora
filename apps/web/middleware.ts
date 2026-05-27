/**
 * Conditional Clerk middleware.
 *
 * When Clerk keys are configured (NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY +
 * CLERK_SECRET_KEY), we delegate to clerkMiddleware which attaches the
 * auth() helper. Without keys, we pass through — the rest of the app reads
 * IS_CLERK_ENABLED and treats every request as a guest.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const IS_CLERK_ENABLED = Boolean(
  process.env['NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY'] &&
    process.env['CLERK_SECRET_KEY'],
);

// We resolve the actual middleware lazily so importing this file in a no-
// Clerk environment does not pull @clerk/nextjs into the bundle.
type ClerkHandler = (req: NextRequest) => Promise<Response> | Response;
let clerkHandler: ClerkHandler | null = null;

async function getClerkHandler(): Promise<ClerkHandler | null> {
  if (!IS_CLERK_ENABLED) return null;
  if (clerkHandler) return clerkHandler;
  const { clerkMiddleware } = await import('@clerk/nextjs/server');
  clerkHandler = clerkMiddleware() as unknown as ClerkHandler;
  return clerkHandler;
}

export default async function middleware(req: NextRequest) {
  const handler = await getClerkHandler();
  if (handler) return handler(req);
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next internals, static files, and the api/_next paths
    '/((?!_next|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2)$).*)',
  ],
};
