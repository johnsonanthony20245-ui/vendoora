/**
 * Admin gate.
 *
 * In production: requires the request to be signed in via Clerk AND for the
 * Clerk user id to be present in ADMIN_CLERK_USER_IDS (comma-separated env
 * var). Without that env var the gate is closed.
 *
 * In development: also accepts a cookie override (vdr_admin_dev=1) so the
 * admin surface can be exercised before Clerk is configured. Same pattern
 * as the dev-only order-status advance affordance.
 *
 * When the permission system grows a proper grant-by-clerk-id lookup (P6),
 * this file becomes a wrapper around prisma.userRole.findMany(where:{user:{
 * clerk_id: ...}, role: {permissions: {some: {permission: {name: 'dispute.resolve'}}}}}).
 */
import { cookies } from 'next/headers';
import { IS_CLERK_ENABLED } from './auth';

const DEV_ADMIN_COOKIE = 'vdr_admin_dev';

function parseAdminClerkIds(): Set<string> {
  const raw = process.env['ADMIN_CLERK_USER_IDS'] ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}

export type AdminSession =
  | { kind: 'clerk'; clerk_user_id: string }
  | { kind: 'dev'; clerk_user_id: null };

/**
 * Resolves the active admin session, or null when the request is not admin.
 * Callers should check the return value and notFound()/redirect on null.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  if (IS_CLERK_ENABLED) {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return null;
    const allowed = parseAdminClerkIds();
    if (!allowed.has(userId)) return null;
    return { kind: 'clerk', clerk_user_id: userId };
  }

  // Dev-only fallback: cookie override outside production.
  if (process.env.NODE_ENV !== 'production') {
    const c = await cookies();
    if (c.get(DEV_ADMIN_COOKIE)?.value === '1') {
      return { kind: 'dev', clerk_user_id: null };
    }
  }

  return null;
}

export const DEV_ADMIN_COOKIE_NAME = DEV_ADMIN_COOKIE;
