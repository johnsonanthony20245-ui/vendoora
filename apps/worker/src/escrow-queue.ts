import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { releaseAllEligibleEscrow, type ReleaseSweepResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * Production scheduler (Engineering_Spec §6.4): BullMQ repeatable job on Redis.
 * A job scheduler enqueues a "sweep" every intervalMs; the Worker processes it
 * by calling the shared, tested releaseAllEligibleEscrow. BullMQ gives retries,
 * a dead-letter (failed) set, and cross-process locking — so unlike the poll
 * loop this is safe to run as multiple replicas.
 *
 * We pass connection *options* (not an ioredis instance) so BullMQ manages its
 * own connections with its bundled ioredis — avoiding a second ioredis copy and
 * the cross-version type clash that comes with sharing instances.
 */

export const ESCROW_QUEUE_NAME = 'escrow-auto-release';
const SCHEDULER_ID = 'escrow-auto-release-every';
const JOB_NAME = 'sweep';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startEscrowAutoReleaseWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  log: Logger;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, log } = opts;

  // Fresh options object per consumer → BullMQ opens separate connections for
  // the queue and the (blocking) worker.
  const queue = new Queue(ESCROW_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  // Idempotent: re-running on restart updates the schedule rather than piling
  // up duplicate schedulers.
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  // Sweep once on boot so a freshly-due hold isn't stuck until the first tick.
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, ReleaseSweepResult>(
    ESCROW_QUEUE_NAME,
    async (): Promise<ReleaseSweepResult> => {
      const result = await releaseAllEligibleEscrow(prisma, { now: new Date() });
      if (result.holdsReleased > 0) log('released escrow', { ...result });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: ESCROW_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
