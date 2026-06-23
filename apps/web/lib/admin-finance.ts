import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Financial Control Center aggregations (Polish-Phase Addendum, Phase 4). The
 * live escrow ledger: how much buyer money the platform is currently holding,
 * split by escrow state and by how long it's been held (an aging holds report —
 * money held too long usually means a stuck dispute or a missed auto-release).
 */

type Db = PrismaClient;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * States where the platform is actively holding buyer funds. RELEASING is in (the
 * release is in flight but the money is still in escrow until RELEASED); REFUNDING
 * is deliberately OUT — a refund-in-flight is treated as already owed back to the
 * buyer, not platform-held. RELEASED/REFUNDED/EXPIRED/PARTIALLY_REFUNDED/
 * INSURANCE_PAYOUT are terminal (money has left escrow); PENDING_PAYMENT isn't
 * captured yet.
 */
const HELD_STATES = ['HELD', 'HELD_DISPUTED', 'RELEASING'] as const;

export interface EscrowStateRow {
  state: string;
  amount: number;
  count: number;
}

export interface EscrowAgeRow {
  bucket: string;
  amount: number;
  count: number;
}

export interface EscrowSummary {
  totalHeld: number;
  heldCount: number;
  byState: EscrowStateRow[];
  byAge: EscrowAgeRow[];
}

export async function getEscrowSummary(db: Db, args: { now?: Date } = {}): Promise<EscrowSummary> {
  const now = args.now ?? new Date();
  const held: Prisma.EscrowHoldWhereInput = { state: { in: [...HELD_STATES] } };

  // age window: state_changed_at in (now-gtDays, now-lteDays]. Older = held longer.
  const ageWhere = (gtDays: number | null, lteDays: number | null): Prisma.EscrowHoldWhereInput => ({
    ...held,
    state_changed_at: {
      ...(gtDays !== null ? { gt: new Date(now.getTime() - gtDays * DAY_MS) } : {}),
      ...(lteDays !== null ? { lte: new Date(now.getTime() - lteDays * DAY_MS) } : {}),
    },
  });

  const [total, byStateGroups, b1, b2, b3, b4] = await Promise.all([
    db.escrowHold.aggregate({ where: held, _sum: { amount: true }, _count: { _all: true } }),
    db.escrowHold.groupBy({ by: ['state'], where: held, _sum: { amount: true }, _count: { _all: true } }),
    db.escrowHold.aggregate({ where: ageWhere(1, null), _sum: { amount: true }, _count: { _all: true } }),
    db.escrowHold.aggregate({ where: ageWhere(3, 1), _sum: { amount: true }, _count: { _all: true } }),
    db.escrowHold.aggregate({ where: ageWhere(7, 3), _sum: { amount: true }, _count: { _all: true } }),
    db.escrowHold.aggregate({ where: ageWhere(null, 7), _sum: { amount: true }, _count: { _all: true } }),
  ]);

  const num = (d: Prisma.Decimal | null): number => Number(d ?? 0);

  return {
    totalHeld: num(total._sum.amount),
    heldCount: total._count._all,
    byState: byStateGroups
      .map((g) => ({ state: g.state, amount: num(g._sum.amount), count: g._count._all }))
      .sort((a, b) => b.amount - a.amount),
    byAge: [
      { bucket: '< 1 day', amount: num(b1._sum.amount), count: b1._count._all },
      { bucket: '1–3 days', amount: num(b2._sum.amount), count: b2._count._all },
      { bucket: '3–7 days', amount: num(b3._sum.amount), count: b3._count._all },
      { bucket: '> 7 days', amount: num(b4._sum.amount), count: b4._count._all },
    ],
  };
}
