/**
 * Fallback scheduler: a single-process polling loop used when REDIS_URL is not
 * configured. Drives an arbitrary set of named sweeps, each with its own
 * overlap guard (a slow sweep can't block another's tick) that doubles as the
 * shutdown drain handle. Run as a SINGLE replica in this mode — it has no
 * cross-process locking (BullMQ mode does).
 */

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export interface SchedulerHandle {
  close: () => Promise<void>;
}

export interface Sweep {
  name: string;
  run: () => Promise<unknown>;
}

export function startPollLoop(opts: {
  intervalMs: number;
  log: Logger;
  sweeps: Sweep[];
}): SchedulerHandle {
  const { intervalMs, log, sweeps } = opts;
  const active = new Map<string, Promise<void>>();

  function sweepOnce(sweep: Sweep): Promise<void> {
    const inflight = active.get(sweep.name);
    if (inflight) return inflight; // never overlap this sweep's ticks
    const p = (async () => {
      try {
        await sweep.run();
      } catch (error) {
        log('sweep failed', {
          sweep: sweep.name,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        active.delete(sweep.name);
      }
    })();
    active.set(sweep.name, p);
    return p;
  }

  function tick(): void {
    for (const sweep of sweeps) void sweepOnce(sweep);
  }

  tick(); // run all once on boot
  const timer = setInterval(tick, intervalMs);

  return {
    close: async () => {
      clearInterval(timer);
      await Promise.allSettled([...active.values()]);
    },
  };
}
