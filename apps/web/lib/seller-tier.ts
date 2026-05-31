import { prisma } from '@vendoora/db';

/**
 * Per-saas_plan listing caps. The plan a seller picked at onboarding bounds
 * how many active (non-deleted) products they can list. These numbers are
 * defaults — the marketplace can publish them; an Enterprise contract can lift
 * the cap (modelled as a per-seller override, follow-up).
 */
export const LISTING_LIMIT_BY_PLAN: Record<
  'STARTER' | 'GROWTH' | 'PRO' | 'ENTERPRISE',
  number
> = {
  STARTER: 25,
  GROWTH: 100,
  PRO: 1000,
  ENTERPRISE: Number.POSITIVE_INFINITY,
};

export type SellerPlan = keyof typeof LISTING_LIMIT_BY_PLAN;

export interface ListingUsage {
  used: number;
  limit: number;
  remaining: number;
  atCap: boolean;
}

/** Count of this seller's non-deleted listings (DRAFT + PUBLISHED). */
export async function getListingUsage(sellerId: string, plan: SellerPlan): Promise<ListingUsage> {
  const used = await prisma.product.count({
    where: { seller_id: sellerId, deleted_at: null },
  });
  const limit = LISTING_LIMIT_BY_PLAN[plan];
  const remaining = Number.isFinite(limit) ? Math.max(0, limit - used) : Number.POSITIVE_INFINITY;
  return { used, limit, remaining, atCap: used >= limit };
}

/** Display helper: returns "1000" / "Unlimited" rather than the JS infinity literal. */
export function formatLimit(limit: number): string {
  return Number.isFinite(limit) ? String(limit) : 'Unlimited';
}
