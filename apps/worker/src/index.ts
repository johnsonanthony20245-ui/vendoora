import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vendoora background worker — escrow auto-release (Engineering_Spec §6.4).
 *
 * Sweeps for escrow holds whose 24h post-delivery dispute window has passed and
 * transitions them HELD → RELEASING (the release logic is the shared, tested
 * @vendoora/domain code, run per-order in its own transaction).
 * "No dispute opened in the window → seller gets paid."
 *
 * Scheduler is chosen at boot:
 *   - REDIS_URL set  → real BullMQ repeatable job (retries, dead-letter set,
 *                      cross-process locking → safe to run multiple replicas).
 *   - REDIS_URL unset → single-process polling loop fallback (run ONE replica).
 *
 * The job logic is identical in both modes; only the scheduler swaps.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env for local dev. In deployment, env vars are injected
// by the platform and this no-ops.
config({ path: resolve(__dirname, '../../../.env') });

const { prisma } = await import('@vendoora/db');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const rawInterval = Number(process.env.ESCROW_RELEASE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
const INTERVAL_MS =
  Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : DEFAULT_INTERVAL_MS;

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), worker: 'escrow-auto-release', message, ...extra };
  // Structured stdout logging; Better Stack ingestion is a P1 observability item.
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

const REDIS_URL = process.env.REDIS_URL;

let scheduler: { close: () => Promise<void> };
if (REDIS_URL) {
  const { startEscrowAutoReleaseWorker } = await import('./escrow-queue');
  scheduler = await startEscrowAutoReleaseWorker({ redisUrl: REDIS_URL, intervalMs: INTERVAL_MS, log });
  log('starting', { mode: 'bullmq', intervalMs: INTERVAL_MS });
} else {
  const { startPollLoop } = await import('./poll-loop');
  scheduler = startPollLoop({ intervalMs: INTERVAL_MS, log });
  log('starting', { mode: 'poll-loop', intervalMs: INTERVAL_MS });
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
