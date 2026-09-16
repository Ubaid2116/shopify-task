import { Queue, Worker, Job, JobsOptions } from "bullmq";
import { redis } from "./redis";

const QUEUE_NAME = "storeboost";

export type ScanJobData = {
  type: "scan";
  shopId: string;
  shopDomain: string;
};

export type OptimizeJobData = {
  type: "optimize";
  shopId: string;
  imageId: string;
};

export type BulkOptimizeJobData = {
  type: "bulk-optimize";
  shopId: string;
  imageIds: string[];
};

export type QueueJobData = ScanJobData | OptimizeJobData | BulkOptimizeJobData;

const defaultJobOptions: Partial<JobsOptions> = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export function createQueue(): Queue<QueueJobData> {
  return new Queue<QueueJobData>(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions,
  });
}

export function createWorker(
  processor: (job: Job<QueueJobData>) => Promise<void>,
): Worker<QueueJobData> {
  return new Worker<QueueJobData>(QUEUE_NAME, processor, {
    connection: redis.duplicate(),
    concurrency: 2,
    limiter: {
      max: 5,
      duration: 1000,
    },
  });
}
