import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { sweepDisputeSlaBreaches, type DisputeSlaSweepResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * Production scheduler for the dispute SLA-breach sweep: a BullMQ repeatable job
 * that flags + escalates open disputes past their `sla_due_at`. Like the escrow
 * worker, BullMQ gives retries, a dead-letter (failed) set, and cross-process
 * locking — safe to run as multiple replicas. The sweep is idempotent (a flagged
 * dispute leaves the selection), so an extra tick is a no-op.
 */

export const DISPUTE_SLA_QUEUE_NAME = 'dispute-sla-sweep';
const SCHEDULER_ID = 'dispute-sla-sweep-every';
const JOB_NAME = 'sweep';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startDisputeSlaWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  log: Logger;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, log } = opts;

  const queue = new Queue(DISPUTE_SLA_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  // Idempotent on restart: updates the schedule rather than stacking duplicates.
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  // Sweep once on boot so a freshly-breached dispute isn't stuck until the first tick.
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, DisputeSlaSweepResult>(
    DISPUTE_SLA_QUEUE_NAME,
    async (): Promise<DisputeSlaSweepResult> => {
      const result = await sweepDisputeSlaBreaches(prisma, { now: new Date() });
      if (result.escalated > 0) log('escalated SLA-breached disputes', { ...result });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: DISPUTE_SLA_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
