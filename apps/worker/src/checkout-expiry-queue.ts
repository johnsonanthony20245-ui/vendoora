import { Queue, Worker } from 'bullmq';
import { prisma } from '@vendoora/db';
import { expireStalePendingOrders, type ExpirySweepResult } from '@vendoora/domain';
import type { SchedulerHandle } from './poll-loop';
import { connectionFromUrl } from './redis-connection';

/**
 * Production scheduler for stale-checkout expiry. Mirrors escrow-queue.ts:
 * a repeatable BullMQ job sweeps every intervalMs and the Worker runs the
 * shared, tested expireStalePendingOrders. Independent queue → independent
 * DLQ, concurrency, and (tighter) interval than escrow.
 */

export const CHECKOUT_EXPIRY_QUEUE_NAME = 'checkout-expiry';
const SCHEDULER_ID = 'checkout-expiry-every';
const JOB_NAME = 'expire';

type Logger = (message: string, extra?: Record<string, unknown>) => void;

export async function startCheckoutExpiryWorker(opts: {
  redisUrl: string;
  intervalMs: number;
  olderThanMs: number;
  log: Logger;
  cancelStripeIntent?: (pi: string) => Promise<void>;
}): Promise<SchedulerHandle> {
  const { redisUrl, intervalMs, olderThanMs, log, cancelStripeIntent } = opts;

  const queue = new Queue(CHECKOUT_EXPIRY_QUEUE_NAME, { connection: connectionFromUrl(redisUrl) });

  await queue.upsertJobScheduler(SCHEDULER_ID, { every: intervalMs }, { name: JOB_NAME });
  await queue.add(JOB_NAME, {}, { removeOnComplete: true, removeOnFail: 100 });

  const worker = new Worker<unknown, ExpirySweepResult>(
    CHECKOUT_EXPIRY_QUEUE_NAME,
    async (): Promise<ExpirySweepResult> => {
      const result = await expireStalePendingOrders(prisma, {
        now: new Date(),
        olderThanMs,
        ...(cancelStripeIntent ? { cancelStripeIntent } : {}),
      });
      if (result.ordersExpired > 0) log('expired stale orders', { ...result });
      return result;
    },
    { connection: connectionFromUrl(redisUrl), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log('job failed', { jobId: job?.id ?? null, error: err.message });
  });

  log('bullmq worker started', { queue: CHECKOUT_EXPIRY_QUEUE_NAME, intervalMs });

  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
