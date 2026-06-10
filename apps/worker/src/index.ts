import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import {
  releaseAllEligibleEscrow,
  expireStalePendingOrders,
  accrueInsuranceTopUp,
  sweepDisputeSlaBreaches,
  recomputeActiveBuyerTrustScores,
} from '@vendoora/domain';
import { trustRecomputeSince } from './trust-window';

/**
 * Vendoora background worker.
 *
 *   - escrow auto-release (Engineering_Spec §6.4): HELD → RELEASING once the
 *     24h post-delivery dispute window passes.
 *   - checkout expiry: abandoned PENDING_PAYMENT orders → EXPIRED (+ FAILED
 *     payment, audit, best-effort Stripe PI cancel).
 *   - insurance-fund top-up (§7.5): accrue 0.5% of recent order commission to
 *     the platform insurance fund, nightly.
 *   - dispute SLA sweep: flag + escalate open disputes past their sla_due_at.
 *   - buyer trust-score recompute (§5.1.12): refresh scores for recently-active
 *     buyers, nightly.
 *
 * Scheduler is chosen at boot:
 *   - REDIS_URL set   → five BullMQ repeatable jobs (retries, dead-letter set,
 *                       cross-process locking → safe to run multiple replicas).
 *   - REDIS_URL unset → poll loops driving the sweeps (run ONE replica). Escrow +
 *                       expiry + SLA share the short interval; the top-up + trust
 *                       recompute run daily.
 *
 * The job logic is the shared, tested @vendoora/domain code in both modes.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env') });

const { prisma } = await import('@vendoora/db');

function envInt(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? fallback);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

const ESCROW_INTERVAL_MS = envInt('ESCROW_RELEASE_INTERVAL_MS', 5 * 60 * 1000);
const EXPIRY_INTERVAL_MS = envInt('CHECKOUT_EXPIRY_INTERVAL_MS', 60 * 1000);
const EXPIRY_OLDER_THAN_MS = envInt('CHECKOUT_EXPIRY_OLDER_THAN_MS', 30 * 60 * 1000);
// Nightly insurance-fund top-up (§7.5). The accrual is windowed in the domain
// layer, so the interval isn't load-bearing — a missed/extra tick only changes
// the window size, never the total accrued.
const TOPUP_INTERVAL_MS = envInt('INSURANCE_TOPUP_INTERVAL_MS', 24 * 60 * 60 * 1000);
// Dispute SLA-breach sweep: how often to scan for open disputes past their SLA.
const SLA_SWEEP_INTERVAL_MS = envInt('DISPUTE_SLA_SWEEP_INTERVAL_MS', 5 * 60 * 1000);
// Nightly buyer trust-score recompute (§5.1.12) over recently-active buyers.
const TRUST_RECOMPUTE_INTERVAL_MS = envInt('TRUST_RECOMPUTE_INTERVAL_MS', 24 * 60 * 60 * 1000);

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), worker: 'vendoora-worker', message, ...extra };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// Worker-local Stripe cancel closure (see plan "Deviation from spec"). Built
// once; undefined when STRIPE_SECRET_KEY is absent (MoMo/Orange-only or dev),
// in which case the domain skips the cancel — no behavior change.
const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripeClient = stripeSecret ? new Stripe(stripeSecret, { typescript: true }) : null;
const cancelStripeIntent: ((pi: string) => Promise<void>) | undefined = stripeClient
  ? async (pi: string) => {
      await stripeClient.paymentIntents.cancel(pi);
    }
  : undefined;

const REDIS_URL = process.env.REDIS_URL;

let scheduler: { close: () => Promise<void> };
if (REDIS_URL) {
  const { startEscrowAutoReleaseWorker } = await import('./escrow-queue');
  const { startCheckoutExpiryWorker } = await import('./checkout-expiry-queue');
  const escrow = await startEscrowAutoReleaseWorker({
    redisUrl: REDIS_URL,
    intervalMs: ESCROW_INTERVAL_MS,
    log,
  });
  const expiry = await startCheckoutExpiryWorker({
    redisUrl: REDIS_URL,
    intervalMs: EXPIRY_INTERVAL_MS,
    olderThanMs: EXPIRY_OLDER_THAN_MS,
    log,
    ...(cancelStripeIntent ? { cancelStripeIntent } : {}),
  });
  const { startInsuranceTopUpWorker } = await import('./insurance-topup-queue');
  const topup = await startInsuranceTopUpWorker({
    redisUrl: REDIS_URL,
    intervalMs: TOPUP_INTERVAL_MS,
    log,
  });
  const { startDisputeSlaWorker } = await import('./dispute-sla-queue');
  const sla = await startDisputeSlaWorker({
    redisUrl: REDIS_URL,
    intervalMs: SLA_SWEEP_INTERVAL_MS,
    log,
  });
  const { startTrustScoreWorker } = await import('./trust-score-queue');
  const trust = await startTrustScoreWorker({
    redisUrl: REDIS_URL,
    intervalMs: TRUST_RECOMPUTE_INTERVAL_MS,
    log,
  });
  scheduler = {
    close: async () => {
      await Promise.allSettled([
        escrow.close(),
        expiry.close(),
        topup.close(),
        sla.close(),
        trust.close(),
      ]);
    },
  };
  log('starting', {
    mode: 'bullmq',
    escrowIntervalMs: ESCROW_INTERVAL_MS,
    expiryIntervalMs: EXPIRY_INTERVAL_MS,
    topupIntervalMs: TOPUP_INTERVAL_MS,
    slaSweepIntervalMs: SLA_SWEEP_INTERVAL_MS,
    trustRecomputeIntervalMs: TRUST_RECOMPUTE_INTERVAL_MS,
    stripeCancel: Boolean(cancelStripeIntent),
  });
} else {
  const { startPollLoop } = await import('./poll-loop');
  // Escrow + expiry share the short interval; the insurance top-up runs on its
  // own (daily) loop so it doesn't tick every few minutes.
  const mainLoop = startPollLoop({
    intervalMs: ESCROW_INTERVAL_MS,
    log,
    sweeps: [
      {
        name: 'escrow-auto-release',
        run: async () => {
          const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
          if (result.holdsReleased > 0) log('released escrow', { ...result });
        },
      },
      {
        name: 'checkout-expiry',
        run: async () => {
          const result = await expireStalePendingOrders(prisma, {
            now: new Date(),
            olderThanMs: EXPIRY_OLDER_THAN_MS,
            ...(cancelStripeIntent ? { cancelStripeIntent } : {}),
          });
          if (result.ordersExpired > 0) log('expired stale orders', { ...result });
        },
      },
      {
        name: 'dispute-sla-sweep',
        run: async () => {
          const result = await sweepDisputeSlaBreaches(prisma, { now: new Date() });
          if (result.escalated > 0) log('escalated SLA-breached disputes', { ...result });
        },
      },
    ],
  });
  // Daily loop: insurance top-up + buyer trust-score recompute.
  const dailyLoop = startPollLoop({
    intervalMs: TOPUP_INTERVAL_MS,
    log,
    sweeps: [
      {
        name: 'insurance-topup',
        run: async () => {
          const result = await accrueInsuranceTopUp(prisma, { now: new Date() });
          if (result.contribution > 0) log('insurance fund topped up', { ...result });
        },
      },
      {
        name: 'trust-score-recompute',
        run: async () => {
          const since = trustRecomputeSince(Date.now(), TRUST_RECOMPUTE_INTERVAL_MS);
          const result = await recomputeActiveBuyerTrustScores(prisma, { since });
          if (result.recomputed > 0) log('recomputed buyer trust scores', { recomputed: result.recomputed });
        },
      },
    ],
  });
  scheduler = {
    close: async () => {
      await Promise.allSettled([mainLoop.close(), dailyLoop.close()]);
    },
  };
  log('starting', {
    mode: 'poll-loop',
    intervalMs: ESCROW_INTERVAL_MS,
    topupIntervalMs: TOPUP_INTERVAL_MS,
    trustRecomputeIntervalMs: TRUST_RECOMPUTE_INTERVAL_MS,
    stripeCancel: Boolean(cancelStripeIntent),
  });
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down', { signal });
  await scheduler.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
