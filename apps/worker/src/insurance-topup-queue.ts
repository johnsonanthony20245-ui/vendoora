import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { accrueInsuranceTopUp, type InsuranceTopUpResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * Production scheduler for the nightly insurance-fund top-up (Engineering_Spec
 * §7.5): a BullMQ repeatable job accrues `topup_rate` of the commission earned
 * since the last run to the fund. Like the escrow worker, BullMQ gives retries,
 * a dead-letter (failed) set, and cross-process locking — safe to run as multiple
 * replicas (only one holds the repeatable job).
 *
 * The accrual is windowed in @vendoora/domain (by insurance_fund.last_topup_at),
 * so the exact interval is not load-bearing — a missed or extra tick just changes
 * the window size, never the total accrued.
 */

export const INSURANCE_TOPUP_QUEUE_NAME = 'insurance-fund-topup';
const SCHEDULER_ID = 'insurance-fund-topup-every';
const JOB_NAME = 'accrue';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startInsuranceTopUpWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  log: Logger;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, log } = opts;

  const queue = new Queue(INSURANCE_TOPUP_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  // Idempotent on restart: updates the schedule rather than stacking duplicates.
  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  // Accrue once on boot so the first window isn't deferred a full interval.
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, InsuranceTopUpResult>(
    INSURANCE_TOPUP_QUEUE_NAME,
    async (): Promise<InsuranceTopUpResult> => {
      const result = await accrueInsuranceTopUp(prisma, { now: new Date() });
      if (result.contribution > 0) log('insurance fund topped up', { ...result });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: INSURANCE_TOPUP_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
