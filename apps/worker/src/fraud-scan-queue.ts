import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { runFraudScan, type FraudScanResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * `fraud-detection-scan` (Engineering_Spec §5.1.11): a BullMQ repeatable job that
 * runs the trust-case auto-creation rules over recent activity and opens a
 * TrustCase per tripping subject. Idempotent in the domain layer (an open
 * auto-created case for the same subject+signal is skipped), so an extra tick is
 * a no-op. Like the other workers, BullMQ gives retries, a dead-letter set, and
 * cross-process locking.
 */

export const FRAUD_SCAN_QUEUE_NAME = 'fraud-detection-scan';
const SCHEDULER_ID = 'fraud-detection-scan-every';
const JOB_NAME = 'scan';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startFraudScanWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  log: Logger;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, log } = opts;

  const queue = new Queue(FRAUD_SCAN_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, FraudScanResult>(
    FRAUD_SCAN_QUEUE_NAME,
    async (): Promise<FraudScanResult> => {
      const result = await runFraudScan(prisma, { now: new Date() });
      if (result.created.length > 0) {
        log('opened trust cases', {
          count: result.created.length,
          signals: result.created.map((c) => c.signal),
        });
      }
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: FRAUD_SCAN_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
