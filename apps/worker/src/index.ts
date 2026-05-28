import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vendoora background worker — escrow auto-release (Engineering_Spec §6.4).
 *
 * Periodically sweeps for escrow holds whose 24h post-delivery dispute window
 * has passed and transitions them HELD → RELEASING (the actual release logic is
 * the shared, tested @vendoora/domain code, run per-order in its own
 * transaction). "No dispute opened in the window → seller gets paid."
 *
 * Scheduler note (§5 production hardening): the Engineering_Spec targets BullMQ
 * repeatable jobs on Upstash Redis (retries, dead-letter queue, multiple
 * workers). Redis credentials aren't provisioned yet, so this runs a real
 * single-process polling loop instead. The job itself is real and identical;
 * only the scheduler swaps. When UPSTASH_REDIS_* lands, wrap runSweep() in a
 * BullMQ repeatable job — no change to the release logic.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env for local dev. In deployment, env vars are injected
// by the platform and this no-ops.
config({ path: resolve(__dirname, '../../../.env') });

const { prisma } = await import('@vendoora/db');
const { releaseAllEligibleEscrow } = await import('@vendoora/domain');

const INTERVAL_MS = Number(process.env.ESCROW_RELEASE_INTERVAL_MS ?? 5 * 60 * 1000);

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), worker: 'escrow-auto-release', message, ...extra };
  // Structured stdout logging; Better Stack ingestion is a P1 observability item.
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

let running = false;

async function runSweep(): Promise<void> {
  if (running) return; // never overlap ticks
  running = true;
  try {
    const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
    if (result.holdsReleased > 0) {
      log('released escrow', { ...result });
    }
  } catch (error) {
    log('sweep failed', { error: error instanceof Error ? error.message : String(error) });
  } finally {
    running = false;
  }
}

log('starting', { intervalMs: INTERVAL_MS });
await runSweep(); // run once on boot
const timer = setInterval(() => {
  void runSweep();
}, INTERVAL_MS);

async function shutdown(signal: string): Promise<void> {
  log('shutting down', { signal });
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
