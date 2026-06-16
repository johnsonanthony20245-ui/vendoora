import { type PrismaClient } from '@vendoora/db';

/**
 * Platform analytics aggregation for the admin Analytics Dashboard (Polish-Phase
 * Addendum, Phase 4). One windowed read of the headline KPIs + the order funnel
 * + the local-vs-diaspora audience split. Heavier per-category / per-seller
 * breakdowns are separate follow-ups.
 *
 * "Paid" = payment_status CAPTURED (money actually taken), consistent with the
 * rest of the domain. GMV/paid-orders are windowed by paid_at (revenue recognised
 * in the window); the funnel, audience split, and signups window by created_at
 * (when the order was placed / the user joined).
 */

type Db = PrismaClient;

/** Order statuses past payment but not yet at a terminal delivery/closure state. */
const IN_FLIGHT_STATUSES = [
  'PAID',
  'ACCEPTED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'ARRIVED',
] as const;

export interface OrderFunnel {
  pendingPayment: number;
  inFlight: number;
  delivered: number;
  completed: number;
  disputed: number;
  refunded: number;
  cancelledOrExpired: number;
}

export interface PlatformAnalytics {
  windowDays: number;
  gmv: number;
  paidOrders: number;
  aov: number;
  newSignups: number;
  openDisputes: number;
  openTrustCases: number;
  funnel: OrderFunnel;
  audience: { domestic: number; diaspora: number };
}

export async function getPlatformAnalytics(
  db: Db,
  args: { now?: Date; windowDays?: number } = {},
): Promise<PlatformAnalytics> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? 30;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const paidInWindow = { payment_status: 'CAPTURED' as const, paid_at: { gte: since, lte: now } };

  const [gmvAgg, paidOrders, newSignups, statusGroups, audienceGroups, openDisputes, openTrustCases] =
    await Promise.all([
      db.order.aggregate({ where: paidInWindow, _sum: { total_amount: true } }),
      db.order.count({ where: paidInWindow }),
      db.user.count({ where: { created_at: { gte: since, lte: now } } }),
      db.order.groupBy({ by: ['status'], where: { created_at: { gte: since, lte: now } }, _count: { id: true } }),
      db.order.groupBy({ by: ['buyer_type'], where: { created_at: { gte: since, lte: now } }, _count: { id: true } }),
      db.dispute.count({
        where: { status: { in: ['OPEN', 'IN_REVIEW', 'PENDING_BUYER', 'PENDING_SELLER', 'ESCALATED'] } },
      }),
      db.trustCase.count({
        where: { status: { in: ['NEW', 'MONITORING', 'NEEDS_INFO', 'ESCALATED', 'RESTRICTED'] } },
      }),
    ]);

  const gmv = Number(gmvAgg._sum.total_amount ?? 0);
  const statusCount = (s: string): number =>
    statusGroups.find((g) => g.status === s)?._count.id ?? 0;
  const sumStatuses = (ss: readonly string[]): number => ss.reduce((a, s) => a + statusCount(s), 0);
  const audienceCount = (t: string): number =>
    audienceGroups.find((g) => g.buyer_type === t)?._count.id ?? 0;

  return {
    windowDays,
    gmv,
    paidOrders,
    aov: paidOrders > 0 ? gmv / paidOrders : 0,
    newSignups,
    openDisputes,
    openTrustCases,
    funnel: {
      pendingPayment: statusCount('PENDING_PAYMENT'),
      inFlight: sumStatuses(IN_FLIGHT_STATUSES),
      delivered: statusCount('DELIVERED'),
      completed: statusCount('COMPLETED'),
      disputed: statusCount('DISPUTED'),
      refunded: statusCount('REFUNDED'),
      cancelledOrExpired: sumStatuses(['CANCELLED', 'EXPIRED']),
    },
    audience: {
      domestic: audienceCount('LIBERIA_DOMESTIC'),
      diaspora: audienceCount('DIASPORA'),
    },
  };
}

export interface TopSeller {
  sellerId: string;
  businessName: string;
  gmv: number;
  lineItems: number;
}

/**
 * Top sellers by net revenue (seller_net) over paid order-items in the window.
 * Ranked descending; `lineItems` is order-item lines, not distinct orders.
 */
export async function getTopSellers(
  db: Db,
  args: { now?: Date; windowDays?: number; limit?: number } = {},
): Promise<TopSeller[]> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? 30;
  const limit = args.limit ?? 10;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const groups = await db.orderItem.groupBy({
    by: ['seller_id'],
    where: { order: { payment_status: 'CAPTURED', paid_at: { gte: since, lte: now } } },
    _sum: { seller_net: true },
    _count: { id: true },
    orderBy: { _sum: { seller_net: 'desc' } },
    take: limit,
  });
  if (groups.length === 0) return [];

  const sellers = await db.seller.findMany({
    where: { id: { in: groups.map((g) => g.seller_id) } },
    select: { id: true, business_name: true },
  });
  const nameById = new Map(sellers.map((s) => [s.id, s.business_name]));

  return groups.map((g) => ({
    sellerId: g.seller_id,
    businessName: nameById.get(g.seller_id) ?? '(unknown)',
    gmv: Number(g._sum.seller_net ?? 0),
    lineItems: g._count.id,
  }));
}

export interface CategoryGmv {
  categoryId: string;
  categoryName: string;
  gmv: number;
}

/**
 * GMV by product category over paid order-items in the window. Prisma can't group
 * by a relation-of-a-relation, so we group by product_id (bounded to distinct
 * sold products), resolve each product's category, then fold into categories.
 */
export async function getGmvByCategory(
  db: Db,
  args: { now?: Date; windowDays?: number } = {},
): Promise<CategoryGmv[]> {
  const now = args.now ?? new Date();
  const windowDays = args.windowDays ?? 30;
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  const byProduct = await db.orderItem.groupBy({
    by: ['product_id'],
    where: { order: { payment_status: 'CAPTURED', paid_at: { gte: since, lte: now } } },
    _sum: { subtotal: true },
  });
  if (byProduct.length === 0) return [];

  const products = await db.product.findMany({
    where: { id: { in: byProduct.map((p) => p.product_id) } },
    select: { id: true, category_id: true, category: { select: { name: true } } },
  });
  const catByProduct = new Map(products.map((p) => [p.id, { id: p.category_id, name: p.category.name }]));

  const totals = new Map<string, { name: string; gmv: number }>();
  for (const row of byProduct) {
    const cat = catByProduct.get(row.product_id);
    if (!cat) continue;
    const prev = totals.get(cat.id) ?? { name: cat.name, gmv: 0 };
    prev.gmv += Number(row._sum.subtotal ?? 0);
    totals.set(cat.id, prev);
  }

  return [...totals.entries()]
    .map(([categoryId, v]) => ({ categoryId, categoryName: v.name, gmv: v.gmv }))
    .sort((a, b) => b.gmv - a.gmv);
}
