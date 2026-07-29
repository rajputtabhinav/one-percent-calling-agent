import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { createBullConnection } from '../redis';
import { logger } from '../lib/logger';

const QUEUE_NAME = 'postcall';
let queue: Queue | null = null;
let worker: Worker | null = null;

// BullMQ bundles its own ioredis; the instances are runtime-compatible but the
// nominal types diverge between copies — bridge via ConnectionOptions.
const bullConnection = (): ConnectionOptions =>
  createBullConnection() as unknown as ConnectionOptions;

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, { connection: bullConnection() });
  }
  return queue;
}

export async function enqueuePostCall(callId: string): Promise<void> {
  await getQueue().add(
    'postcall',
    { callId },
    {
      jobId: `postcall:${callId}`,
      delay: 1500,
      attempts: 2,
      backoff: { type: 'exponential', delay: 8000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  );
}

export function startWorkers(): void {
  if (worker) return;
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { runPostCall } = await import('./postcall');
      await runPostCall(job.data.callId as string);
    },
    { connection: bullConnection(), concurrency: 2 },
  );
  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err: err.message }, 'postcall job failed'),
  );
  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'postcall job done'));
}

export async function stopJobs(): Promise<void> {
  await worker?.close();
  await queue?.close();
  worker = null;
  queue = null;
}
