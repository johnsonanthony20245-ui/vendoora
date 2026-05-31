/**
 * Seller gate.
 *
 * Production (Clerk enabled): identifies the authenticated Clerk user, resolves
 * their Vendoora `User`, then their `Seller`. Returns null if any link breaks.
 *
 * Development (Clerk disabled): falls back to a `vdr_seller_dev` cookie whose
 * value is the seller's `business_slug`. Mirrors the `vdr_admin_dev` pattern in
 * `lib/admin.ts` so the seller surface is exercisable without Clerk wired.
 *
 * When the permission system grows full RBAC (P6), this becomes a wrapper that
 * also checks the seller-staff role grants for the resolved user.
 */
import { cookies } from 'next/headers';
import { prisma } from '@vendoora/db';
import { IS_CLERK_ENABLED } from './auth';

const DEV_SELLER_COOKIE = 'vdr_seller_dev';

export type SellerSession =
  | { kind: 'clerk'; sellerId: string; slug: string; clerk_user_id: string }
  | { kind: 'dev'; sellerId: string; slug: string; clerk_user_id: null };

/**
 * Resolve the active seller session, or null when the request isn't bound to a
 * seller. Callers should redirect to /sell/sign-in on null.
 */
export async function getSellerSession(): Promise<SellerSession | null> {
  if (IS_CLERK_ENABLED) {
    const { auth } = await import('@clerk/nextjs/server');
    const { userId } = await auth();
    if (!userId) return null;
    const user = await prisma.user.findUnique({
      where: { clerk_id: userId },
      select: { id: true },
    });
    if (!user) return null;
    const seller = await prisma.seller.findUnique({
      where: { user_id: user.id },
      select: { id: true, business_slug: true },
    });
    if (!seller) return null;
    return { kind: 'clerk', sellerId: seller.id, slug: seller.business_slug, clerk_user_id: userId };
  }

  // Dev-only cookie fallback.
  if (process.env.NODE_ENV !== 'production') {
    const c = await cookies();
    const slug = c.get(DEV_SELLER_COOKIE)?.value;
    if (!slug) return null;
    const seller = await prisma.seller.findUnique({
      where: { business_slug: slug },
      select: { id: true, business_slug: true },
    });
    if (!seller) return null;
    return { kind: 'dev', sellerId: seller.id, slug: seller.business_slug, clerk_user_id: null };
  }

  return null;
}

export const DEV_SELLER_COOKIE_NAME = DEV_SELLER_COOKIE;
