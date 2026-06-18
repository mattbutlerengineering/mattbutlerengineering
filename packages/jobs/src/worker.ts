import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { JobType, JobPayloadMap } from "./job-types.js";
import { dispatchJob } from "./dispatch-job.js";

const DEFAULT_QUEUE_NAME = "mbe-notifications";

export type JobHandlerMap = {
  [K in JobType]: (payload: JobPayloadMap[K]) => Promise<void>;
};

export interface JobWorkerConfig {
  redisUrl: string;
  queueName?: string;
  handlers: JobHandlerMap;
}

export class JobWorker {
  private readonly worker: Worker;
  private readonly redis: Redis;

  constructor(config: JobWorkerConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.worker = new Worker(
      config.queueName ?? DEFAULT_QUEUE_NAME,
      (job) => dispatchJob(config.handlers, job),
      { connection: this.redis }
    );
  }

  /**
   * Gracefully close the worker and Redis connection.
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.redis.quit();
  }
}
