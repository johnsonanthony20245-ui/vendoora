import { prisma } from '@vendoora/db';

/**
 * Homepage data reads — replaces the prototype's hand-curated stub numbers
 * (the stats bar and the "Verified sellers in Sinkor" cards) with real Prisma
 * queries. Displayed figures reflect actual seeded marketplace state and grow
 * automatically as the marketplace does.
 */

/** City the marketplace is anchored in — fallback + delivery-average filter. */
const HOME_CITY = 'Monrovia';
/** Delivery-time fallback (hours) when no Monrovia zone estimate exists yet. */
const DEFAULT_DELIVERY_HOURS = 24;
/** Every order creates an EscrowHold in the order pipeline — true by design. */
const ESCROW_INVARIANT_PCT = 100;

export interface HomeStats {
  /** KYC-approved, non-suspended, non-deleted sellers. */
  verifiedSellers: number;
  /** Distinct counties covered by at least one active delivery zone. */
  countiesServed: number;
  /**
   * Share of orders protected by escrow. 100 by platform design — every order
   * creates an EscrowHold in the order pipeline — so this is a true structural
   * invariant, not a marketing figure.
   */
  escrowPct: number;
  /** Mean estimated delivery time across active Monrovia delivery zones. */
  avgDeliveryHours: number;
}

export async function getHomeStats(): Promise<HomeStats> {
  const [verifiedSellers, activeZones] = await Promise.all([
    prisma.seller.count({
      where: { kyc_status: 'APPROVED', is_suspended: false, deleted_at: null },
    }),
    prisma.deliveryZone.findMany({
      where: { is_active: true },
      select: { county: true, city: true, estimated_delivery_hours: true },
    }),
  ]);

  const countiesServed = new Set(activeZones.map((z) => z.county)).size;

  const cityZones = activeZones.filter((z) => z.city === HOME_CITY);
  const avgDeliveryHours =
    cityZones.length > 0
      ? Math.round(
          cityZones.reduce((sum, z) => sum + z.estimated_delivery_hours, 0) /
            cityZones.length,
        )
      : DEFAULT_DELIVERY_HOURS;

  return {
    verifiedSellers,
    countiesServed,
    escrowPct: ESCROW_INVARIANT_PCT,
    avgDeliveryHours,
  };
}

export interface NearbySeller {
  slug: string;
  name: string;
  /** Two-letter monogram for the card avatar, derived from the business name. */
  initials: string;
  tier: number;
  ratingAverage: number | null;
  ratingCount: number;
  /** Published, approved products this seller currently lists. */
  productCount: number;
  /** Lifetime completed orders — a distinct activity/trust signal. */
  totalOrders: number;
  city: string;
}

/** Two-letter monogram: first letters of the first and last name words. */
function initialsFor(name: string): string {
  const words = name
    .replace(/[^A-Za-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const first = words[0];
  if (!first) return '?';
  if (words.length === 1) return first.slice(0, 2).toUpperCase();
  const last = words[words.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

function cityOf(address: unknown): string {
  if (address && typeof address === 'object' && 'city' in address) {
    const v = (address as { city?: unknown }).city;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return HOME_CITY;
}

/**
 * Top verified sellers, ranked by KYC tier, then rating, then order volume.
 * Product counts come from a single groupBy so we avoid an N+1.
 */
export async function getNearbySellers(limit = 4): Promise<NearbySeller[]> {
  const sellers = await prisma.seller.findMany({
    where: { kyc_status: 'APPROVED', is_suspended: false, deleted_at: null },
    orderBy: [
      { kyc_tier: 'desc' },
      { rating_average: 'desc' },
      { total_orders: 'desc' },
    ],
    take: limit,
    select: {
      id: true,
      business_slug: true,
      business_name: true,
      kyc_tier: true,
      rating_average: true,
      rating_count: true,
      total_orders: true,
      business_address: true,
    },
  });

  if (sellers.length === 0) return [];

  const counts = await prisma.product.groupBy({
    by: ['seller_id'],
    where: {
      seller_id: { in: sellers.map((s) => s.id) },
      status: 'PUBLISHED',
      moderation_status: 'APPROVED',
      deleted_at: null,
    },
    _count: { _all: true },
  });
  const countBySeller = new Map(counts.map((c) => [c.seller_id, c._count._all]));

  return sellers.map((s) => ({
    slug: s.business_slug,
    name: s.business_name,
    initials: initialsFor(s.business_name),
    tier: s.kyc_tier,
    ratingAverage: s.rating_average,
    ratingCount: s.rating_count,
    productCount: countBySeller.get(s.id) ?? 0,
    totalOrders: s.total_orders,
    city: cityOf(s.business_address),
  }));
}
