import { Worker } from "bullmq";
import { Redis } from "ioredis";
import type { JobType, JobPayloadMap } from "./job-types.js";

const DEFAULT_QUEUE_NAME = "mbe-notifications";

export interface NotificationHandlerInput<T extends JobType = JobType> {
  jobType: T;
  payload: JobPayloadMap[T];
}

export interface JobHandlers {
  onNotification: (input: NotificationHandlerInput) => Promise<void>;
}

export interface JobWorkerConfig {
  redisUrl: string;
  queueName?: string;
  handlers: JobHandlers;
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
      async (job) => {
        const jobType = job.name as JobType;
        await config.handlers.onNotification({
          jobType,
          payload: job.data as JobPayloadMap[typeof jobType],
        });
      },
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
