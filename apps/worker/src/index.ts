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
 * DEPLOYMENT: run as a SINGLE replica until the BullMQ migration. The overlap
 * guard below is in-process only; two replicas would duplicate sweeps. (Correct
 * but wasteful — the state-guarded HELD→RELEASING write means no double-release,
 * just redundant DB work.) Set replicas=1 / no autoscaling for this service.
 *
 * Scheduler note (§5 production hardening): the Engineering_Spec targets BullMQ
 * repeatable jobs on Upstash Redis (retries, dead-letter queue, multiple
 * workers). Redis credentials aren't provisioned yet, so this runs a real
 * single-process polling loop instead. The job itself is real and identical;
 * only the scheduler swaps. When UPSTASH_REDIS_* lands, wrap sweepOnce() in a
 * BullMQ repeatable job — no change to the release logic.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// Load the repo-root .env for local dev. In deployment, env vars are injected
// by the platform and this no-ops.
config({ path: resolve(__dirname, '../../../.env') });

const { prisma } = await import('@vendoora/db');
const { releaseAllEligibleEscrow } = await import('@vendoora/domain');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const rawInterval = Number(process.env.ESCROW_RELEASE_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
const INTERVAL_MS =
  Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : DEFAULT_INTERVAL_MS;

function log(message: string, extra?: Record<string, unknown>): void {
  const line = { ts: new Date().toISOString(), worker: 'escrow-auto-release', message, ...extra };
  // Structured stdout logging; Better Stack ingestion is a P1 observability item.
  process.stdout.write(`${JSON.stringify(line)}\n`);
}

// In-flight sweep promise doubles as the overlap guard AND the drain handle for
// graceful shutdown.
let activeSweep: Promise<void> | null = null;

function sweepOnce(): Promise<void> {
  if (activeSweep) return activeSweep; // never overlap ticks
  activeSweep = (async () => {
    try {
      const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
      if (result.holdsReleased > 0) {
        log('released escrow', { ...result });
      }
    } catch (error) {
      log('sweep failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      activeSweep = null;
    }
  })();
  return activeSweep;
}

log('starting', { intervalMs: INTERVAL_MS });
await sweepOnce(); // run once on boot
const timer = setInterval(() => {
  void sweepOnce();
}, INTERVAL_MS);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutting down', { signal });
  clearInterval(timer);
  // Let an in-flight sweep finish so we don't yank the DB connection mid-tick.
  if (activeSweep) {
    try {
      await activeSweep;
    } catch {
      /* already logged inside sweepOnce */
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
