import { type Prisma, type PrismaClient } from '@vendoora/db';

/**
 * Platform insurance fund (Engineering_Spec §7.5).
 *
 * The fund refunds the buyer when T&S resolves a dispute as INSURANCE_PAYOUT
 * (in-transit damage / lost package, no party at fault). The seller is still paid
 * in full from escrow via the normal release path — this module only moves money
 * OUT of the fund TO the buyer, transactionally and within the §7.5 limits.
 *
 * The fund balance + caps live in PlatformConfig (key/value). Every paid claim
 * decrements the balance, writes an InsurancePayout ledger row (which backs the
 * per-buyer / per-seller annual caps), and writes an audit row.
 */

type Db = PrismaClient;

const BALANCE_KEY = 'insurance_fund.balance';
const MAX_PER_INCIDENT_KEY = 'insurance_fund.max_per_incident';
const MAX_PER_BUYER_YEAR_KEY = 'insurance_fund.max_per_buyer_year';
const MAX_PER_SELLER_YEAR_INCIDENTS_KEY = 'insurance_fund.max_per_seller_year_incidents';

/** §7.5 defaults, applied when a config key is absent. */
const DEFAULTS = {
  maxPerIncident: 500,
  maxPerBuyerYear: 2000,
  maxPerSellerYearIncidents: 10,
} as const;

const YEAR_MS = 365 * 24 * 3600 * 1000;

export type InsuranceClaimReason =
  | 'invalid_amount'
  | 'over_per_incident_cap'
  | 'over_buyer_year_cap'
  | 'over_seller_year_limit'
  | 'insufficient_fund';

export type InsuranceClaimResult =
  | { ok: true; payoutId: string; balanceAfter: number }
  | { ok: false; reason: InsuranceClaimReason };

export interface PayInsuranceClaimArgs {
  orderId: string;
  disputeId?: string | null;
  escrowHoldId?: string | null;
  buyerUserId: string;
  sellerUserId?: string | null;
  /** Claim amount in major currency units (e.g. dollars). */
  amount: number;
  currency?: string;
  actorUserId?: string | null;
  now?: Date;
}

type TxClient = Prisma.TransactionClient;

/**
 * Read a numeric PlatformConfig value. An ABSENT key falls back to the §7.5
 * default; a PRESENT-but-unparseable value throws rather than silently failing
 * open to a (possibly more permissive) default — caps are fraud controls.
 * Tolerates the value being stored as a JSON number or a decimal string.
 */
async function numConfig(tx: TxClient, key: string, fallback: number): Promise<number> {
  const row = await tx.platformConfig.findUnique({ where: { key }, select: { value: true } });
  if (row == null) return fallback;
  const n = Number(row.value);
  if (!Number.isFinite(n)) {
    throw new Error(`PlatformConfig "${key}" is not a finite number: ${JSON.stringify(row.value)}`);
  }
  return n;
}

/**
 * Pay an insurance claim to the buyer from the platform fund.
 *
 * Money is reasoned about in integer cents to avoid float drift. The fund balance
 * config row is SELECT … FOR UPDATE locked for the transaction, so two parallel
 * claims serialize and the fund can never be overdrawn. Caps are checked in
 * precedence order; the first violated cap is the returned reason.
 */
export async function payInsuranceClaim(
  db: Db,
  args: PayInsuranceClaimArgs,
): Promise<InsuranceClaimResult> {
  const now = args.now ?? new Date();
  const currency = args.currency ?? 'USD';
  const amountCents = Math.round(args.amount * 100);

  if (!Number.isFinite(args.amount) || amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  return db.$transaction(async (tx) => {
    // Serialize concurrent claims on the single fund-balance row. The raw query's
    // result is intentionally discarded — we only need the row lock, which is held
    // to transaction end. If the row is absent the lock matches nothing, so we
    // assert its existence below rather than let the serialization silently no-op.
    await tx.$queryRaw`SELECT id FROM platform_config WHERE key = ${BALANCE_KEY} FOR UPDATE`;

    const balanceRow = await tx.platformConfig.findUnique({
      where: { key: BALANCE_KEY },
      select: { value: true },
    });
    if (balanceRow == null) {
      throw new Error('insurance_fund.balance config row is missing; cannot pay a claim');
    }
    const balance = Number(balanceRow.value);
    if (!Number.isFinite(balance)) {
      throw new Error(`insurance_fund.balance is not a finite number: ${JSON.stringify(balanceRow.value)}`);
    }
    const balanceCents = Math.round(balance * 100);
    const maxPerIncidentCents = Math.round(
      (await numConfig(tx, MAX_PER_INCIDENT_KEY, DEFAULTS.maxPerIncident)) * 100,
    );
    const maxPerBuyerYearCents = Math.round(
      (await numConfig(tx, MAX_PER_BUYER_YEAR_KEY, DEFAULTS.maxPerBuyerYear)) * 100,
    );
    const maxPerSellerYearIncidents = Math.round(
      await numConfig(tx, MAX_PER_SELLER_YEAR_INCIDENTS_KEY, DEFAULTS.maxPerSellerYearIncidents),
    );

    if (amountCents > maxPerIncidentCents) {
      return { ok: false, reason: 'over_per_incident_cap' };
    }

    // "Per year" = a rolling 365-day window (leap years ignored — fine for a cap).
    const since = new Date(now.getTime() - YEAR_MS);

    const buyerAgg = await tx.insurancePayout.aggregate({
      where: { buyer_user_id: args.buyerUserId, created_at: { gte: since } },
      _sum: { amount: true },
    });
    const buyerYearCents = Math.round(Number(buyerAgg._sum.amount ?? 0) * 100);
    if (buyerYearCents + amountCents > maxPerBuyerYearCents) {
      return { ok: false, reason: 'over_buyer_year_cap' };
    }

    if (args.sellerUserId) {
      const sellerCount = await tx.insurancePayout.count({
        where: { seller_user_id: args.sellerUserId, created_at: { gte: since } },
      });
      if (sellerCount + 1 > maxPerSellerYearIncidents) {
        return { ok: false, reason: 'over_seller_year_limit' };
      }
    }

    if (amountCents > balanceCents) {
      return { ok: false, reason: 'insufficient_fund' };
    }

    const newBalance = (balanceCents - amountCents) / 100;
    const amount = amountCents / 100;

    // Store the money-of-record balance as a fixed-2dp STRING, not a JSON float —
    // so no future writer (e.g. the nightly 0.5% top-up) can drift the cents.
    await tx.platformConfig.update({
      where: { key: BALANCE_KEY },
      data: { value: newBalance.toFixed(2) },
    });

    const payout = await tx.insurancePayout.create({
      data: {
        order_id: args.orderId,
        dispute_id: args.disputeId ?? null,
        escrow_hold_id: args.escrowHoldId ?? null,
        buyer_user_id: args.buyerUserId,
        seller_user_id: args.sellerUserId ?? null,
        amount,
        currency,
        balance_after: newBalance,
        created_by_user_id: args.actorUserId ?? null,
        created_at: now,
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        ...(args.actorUserId
          ? { actor_user_id: args.actorUserId, actor_system: false }
          : { actor_system: true }),
        action: 'insurance.payout',
        resource_type: 'insurance_payout',
        resource_id: payout.id,
        after_state: {
          amount: amount.toFixed(2),
          currency,
          balance_after: newBalance.toFixed(2),
          order_id: args.orderId,
          buyer_user_id: args.buyerUserId,
        } satisfies Prisma.InputJsonValue,
        metadata: {
          dispute_id: args.disputeId ?? null,
          seller_user_id: args.sellerUserId ?? null,
        } satisfies Prisma.InputJsonValue,
      },
    });

    return { ok: true, payoutId: payout.id, balanceAfter: newBalance };
  });
}
