import { type PrismaClient } from '@vendoora/db';

/**
 * Platform analytics aggregation for the admin Analytics Dashboard (Polish-Phase
 * Addendum, Phase 4). One windowed read of the headline KPIs + the order funnel
 * + the local-vs-diaspora audience split. Heavier per-category / per-seller
 * breakdowns are separate follow-ups.
 *
 * "Paid" = payment_status CAPTURED (money actually taken), consistent with the
 * rest of the domain. GMV sums total_amount over paid orders in the window.
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
  newBuyers: number;
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

  const paidInWindow = { payment_status: 'CAPTURED' as const, created_at: { gte: since, lte: now } };

  const [gmvAgg, paidOrders, newBuyers, statusGroups, audienceGroups, openDisputes, openTrustCases] =
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
    newBuyers,
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
