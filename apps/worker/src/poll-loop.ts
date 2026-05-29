import { prisma } from '@vendoora/db';
import { releaseAllEligibleEscrow } from '@vendoora/domain';

/**
 * Fallback scheduler: a single-process polling loop used when REDIS_URL is not
 * configured. The overlap guard (in-flight promise) doubles as the shutdown
 * drain handle so we never yank the DB connection mid-sweep. Run as a SINGLE
 * replica in this mode — it has no cross-process locking (BullMQ mode does).
 */

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export interface SchedulerHandle {
  close: () => Promise<void>;
}

export function startPollLoop(opts: { intervalMs: number; log: Logger }): SchedulerHandle {
  const { intervalMs, log } = opts;
  let activeSweep: Promise<void> | null = null;

  function sweepOnce(): Promise<void> {
    if (activeSweep) return activeSweep; // never overlap ticks
    activeSweep = (async () => {
      try {
        const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
        if (result.holdsReleased > 0) log('released escrow', { ...result });
      } catch (error) {
        log('sweep failed', { error: error instanceof Error ? error.message : String(error) });
      } finally {
        activeSweep = null;
      }
    })();
    return activeSweep;
  }

  void sweepOnce(); // run once on boot
  const timer = setInterval(() => void sweepOnce(), intervalMs);

  return {
    close: async () => {
      clearInterval(timer);
      if (activeSweep) {
        try {
          await activeSweep;
        } catch {
          /* already logged inside sweepOnce */
        }
      }
    },
  };
}
