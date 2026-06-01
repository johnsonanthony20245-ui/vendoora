import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import { releaseAllEligibleEscrow, expireStalePendingOrders } from '@vendoora/domain';

/**
 * Vendoora background worker.
 *
 *   - escrow auto-release (Engineering_Spec §6.4): HELD → RELEASING once the
 *     24h post-delivery dispute window passes.
 *   - checkout expiry: abandoned PENDING_PAYMENT orders → EXPIRED (+ FAILED
 *     payment, audit, best-effort Stripe PI cancel).
 *
 * Scheduler is chosen at boot:
 *   - REDIS_URL set   → two BullMQ repeatable jobs (retries, dead-letter set,
 *                       cross-process locking → safe to run multiple replicas).
 *   - REDIS_URL unset → single-process poll loop driving both sweeps (run ONE
 *                       replica). Both sweeps share the escrow interval here.
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
  scheduler = {
    close: async () => {
      await Promise.allSettled([escrow.close(), expiry.close()]);
    },
  };
  log('starting', {
    mode: 'bullmq',
    escrowIntervalMs: ESCROW_INTERVAL_MS,
    expiryIntervalMs: EXPIRY_INTERVAL_MS,
    stripeCancel: Boolean(cancelStripeIntent),
  });
} else {
  const { startPollLoop } = await import('./poll-loop');
  scheduler = startPollLoop({
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
    ],
  });
  log('starting', {
    mode: 'poll-loop',
    intervalMs: ESCROW_INTERVAL_MS,
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
