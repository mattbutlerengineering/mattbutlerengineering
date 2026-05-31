import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { JOB_TYPES } from "./job-types.js";
import type { JobType, JobPayloadMap } from "./job-types.js";

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
      async (job) => {
        const jobType = job.name as JobType;
        switch (jobType) {
          case JOB_TYPES.BOOKING_REMINDER:
            await config.handlers[JOB_TYPES.BOOKING_REMINDER](
              job.data as JobPayloadMap[typeof JOB_TYPES.BOOKING_REMINDER]
            );
            break;
          case JOB_TYPES.DAY_OF_REMINDER:
            await config.handlers[JOB_TYPES.DAY_OF_REMINDER](
              job.data as JobPayloadMap[typeof JOB_TYPES.DAY_OF_REMINDER]
            );
            break;
          case JOB_TYPES.POST_VISIT_FOLLOWUP:
            await config.handlers[JOB_TYPES.POST_VISIT_FOLLOWUP](
              job.data as JobPayloadMap[typeof JOB_TYPES.POST_VISIT_FOLLOWUP]
            );
            break;
          case JOB_TYPES.PRE_ARRIVAL_BRIEFING:
            await config.handlers[JOB_TYPES.PRE_ARRIVAL_BRIEFING](
              job.data as JobPayloadMap[typeof JOB_TYPES.PRE_ARRIVAL_BRIEFING]
            );
            break;
          case JOB_TYPES.LAPSED_GUEST_SCAN:
            await config.handlers[JOB_TYPES.LAPSED_GUEST_SCAN](
              job.data as JobPayloadMap[typeof JOB_TYPES.LAPSED_GUEST_SCAN]
            );
            break;
          case JOB_TYPES.WAITLIST_EXPIRY:
            await config.handlers[JOB_TYPES.WAITLIST_EXPIRY](
              job.data as JobPayloadMap[typeof JOB_TYPES.WAITLIST_EXPIRY]
            );
            break;
        }
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
