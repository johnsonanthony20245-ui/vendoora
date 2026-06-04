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
const REPLENISH_THRESHOLD_KEY = 'insurance_fund.replenish_threshold';
const TOPUP_RATE_KEY = 'insurance_fund.topup_rate';
const LAST_TOPUP_KEY = 'insurance_fund.last_topup_at';

/** §7.5 defaults, applied when a config key is absent. */
const DEFAULTS = {
  maxPerIncident: 500,
  maxPerBuyerYear: 2000,
  maxPerSellerYearIncidents: 10,
  replenishThreshold: 2000,
  topupRate: 0.005,
} as const;

const YEAR_MS = 365 * 24 * 3600 * 1000;

export type InsuranceClaimReason =
  | 'invalid_amount'
  | 'over_per_incident_cap'
  | 'over_buyer_year_cap'
  | 'over_seller_year_limit'
  | 'insufficient_fund';

export type InsuranceClaimResult =
  | { ok: true; payoutId: string; balanceAfter: number; lowBalance: boolean }
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
 * Pay an insurance claim to the buyer from the platform fund (standalone).
 * Wraps payInsuranceClaimTx in its own transaction.
 */
export async function payInsuranceClaim(
  db: Db,
  args: PayInsuranceClaimArgs,
): Promise<InsuranceClaimResult> {
  return db.$transaction((tx) => payInsuranceClaimTx(tx, args));
}

/**
 * Transaction-scoped insurance payout, using a caller-provided transaction client
 * so the fund debit composes ATOMICALLY inside a larger flow (e.g. dispute
 * resolution). Prisma can't nest interactive transactions, so the dispute path
 * calls THIS with its own `tx`; standalone callers use payInsuranceClaim above.
 *
 * Money is reasoned about in integer cents to avoid float drift. The balance
 * config row is SELECT … FOR UPDATE locked, so two parallel claims serialize and
 * the fund can never be overdrawn. Caps are checked in precedence order; the first
 * violated cap is the returned reason. No state mutates on any rejection.
 */
export async function payInsuranceClaimTx(
  tx: TxClient,
  args: PayInsuranceClaimArgs,
): Promise<InsuranceClaimResult> {
  const now = args.now ?? new Date();
  const currency = args.currency ?? 'USD';
  const amountCents = Math.round(args.amount * 100);

  if (!Number.isFinite(args.amount) || amountCents <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

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
  const replenishThresholdCents = Math.round(
    (await numConfig(tx, REPLENISH_THRESHOLD_KEY, DEFAULTS.replenishThreshold)) * 100,
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

  const newBalanceCents = balanceCents - amountCents;
  const newBalance = newBalanceCents / 100;
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

  // §7.5 replenishment trigger: when this payout drops the fund below the
  // threshold, raise a one-time Finance-Admin alert (audited; there's no
  // notification surface yet). `crossedBelow` guards against re-alerting on every
  // subsequent payout once the fund is already low.
  const lowBalance = newBalanceCents < replenishThresholdCents;
  const crossedBelow = balanceCents >= replenishThresholdCents && lowBalance;
  if (crossedBelow) {
    await tx.auditLog.create({
      data: {
        ...(args.actorUserId
          ? { actor_user_id: args.actorUserId, actor_system: false }
          : { actor_system: true }),
        action: 'insurance.fund.low_balance',
        resource_type: 'insurance_payout',
        resource_id: payout.id,
        after_state: {
          balance_after: newBalance.toFixed(2),
          threshold: (replenishThresholdCents / 100).toFixed(2),
          currency,
        } satisfies Prisma.InputJsonValue,
      },
    });
  }

  return { ok: true, payoutId: payout.id, balanceAfter: newBalance, lowBalance };
}

export interface InsuranceTopUpResult {
  /** Commission earned in the accrual window (major units). */
  commissionTotal: number;
  /** Amount added to the fund (topup_rate × commissionTotal). */
  contribution: number;
  balanceAfter: number;
}

/**
 * Nightly insurance-fund top-up (§7.5): allocate `topup_rate` (default 0.5%) of
 * the commission from orders paid since the previous run to the fund. Windowed by
 * `insurance_fund.last_topup_at` so each run only counts new commission, then the
 * marker is advanced to `now`. Batching the contribution (vs per-order) avoids
 * serializing every order finalization on the single fund-balance row.
 *
 * Pass `since` to override the window start (otherwise the stored marker is used,
 * defaulting to the epoch on the very first run). Money is reasoned in integer
 * cents; the balance is stored as a fixed-2dp string.
 */
export async function accrueInsuranceTopUp(
  db: Db,
  args: { now?: Date; since?: Date } = {},
): Promise<InsuranceTopUpResult> {
  const at = args.now ?? new Date();

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM platform_config WHERE key = ${BALANCE_KEY} FOR UPDATE`;

    const balanceRow = await tx.platformConfig.findUnique({
      where: { key: BALANCE_KEY },
      select: { value: true },
    });
    if (balanceRow == null) {
      throw new Error('insurance_fund.balance config row is missing; cannot top up');
    }
    const balance = Number(balanceRow.value);
    if (!Number.isFinite(balance)) {
      throw new Error(`insurance_fund.balance is not a finite number: ${JSON.stringify(balanceRow.value)}`);
    }
    const balanceCents = Math.round(balance * 100);
    const rate = await numConfig(tx, TOPUP_RATE_KEY, DEFAULTS.topupRate);

    let windowStart: Date;
    if (args.since) {
      windowStart = args.since;
    } else {
      const lastRow = await tx.platformConfig.findUnique({
        where: { key: LAST_TOPUP_KEY },
        select: { value: true },
      });
      windowStart = lastRow ? new Date(String(lastRow.value)) : new Date(0);
      if (Number.isNaN(windowStart.getTime())) windowStart = new Date(0);
    }

    const agg = await tx.orderItem.aggregate({
      where: { order: { paid_at: { gt: windowStart, lte: at } } },
      _sum: { commission_amount: true },
    });
    const commissionCents = Math.round(Number(agg._sum.commission_amount ?? 0) * 100);
    const contributionCents = Math.round(commissionCents * rate);
    const newBalanceCents = balanceCents + contributionCents;
    const balanceAfter = newBalanceCents / 100;

    await tx.platformConfig.update({
      where: { key: BALANCE_KEY },
      data: { value: balanceAfter.toFixed(2) },
    });
    await tx.platformConfig.upsert({
      where: { key: LAST_TOPUP_KEY },
      update: { value: at.toISOString() },
      create: { key: LAST_TOPUP_KEY, value: at.toISOString(), category: 'insurance' },
    });

    if (contributionCents > 0) {
      await tx.auditLog.create({
        data: {
          actor_system: true,
          action: 'insurance.fund.topup',
          resource_type: 'insurance_fund',
          resource_id: BALANCE_KEY,
          after_state: {
            commission_total: (commissionCents / 100).toFixed(2),
            contribution: (contributionCents / 100).toFixed(2),
            balance_after: balanceAfter.toFixed(2),
            rate,
          } satisfies Prisma.InputJsonValue,
        },
      });
    }

    return {
      commissionTotal: commissionCents / 100,
      contribution: contributionCents / 100,
      balanceAfter,
    };
  });
}
