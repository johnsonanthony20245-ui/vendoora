import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { recomputeActiveBuyerTrustScores, type BatchTrustScoreResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';
import { trustRecomputeSince } from './trust-window';

/**
 * Nightly buyer trust-score recompute (Engineering_Spec §5.1.12): a BullMQ
 * repeatable job that recomputes the score for every buyer with order/dispute
 * activity in the trailing window. Like the other workers, BullMQ gives retries,
 * a dead-letter set, and cross-process locking. recomputeBuyerTrustScore is
 * idempotent, so the overlap margin (window > interval) just re-derives the same
 * score for a buyer seen on two consecutive runs. The window math (incl. the
 * downtime-gap tradeoff) lives in trust-window.ts, shared with the poll-loop.
 */

export const TRUST_RECOMPUTE_QUEUE_NAME = 'trust-score-recompute';
const SCHEDULER_ID = 'trust-score-recompute-every';
const JOB_NAME = 'recompute';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startTrustScoreWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  log: Logger;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, log } = opts;

  const queue = new Queue(TRUST_RECOMPUTE_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, BatchTrustScoreResult>(
    TRUST_RECOMPUTE_QUEUE_NAME,
    async (): Promise<BatchTrustScoreResult> => {
      const since = trustRecomputeSince(Date.now(), intervalMs);
      const result = await recomputeActiveBuyerTrustScores(prisma, { since });
      if (result.recomputed > 0) log('recomputed buyer trust scores', { recomputed: result.recomputed });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: TRUST_RECOMPUTE_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
