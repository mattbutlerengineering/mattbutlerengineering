import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { DEFAULT_QUEUE_NAME, DEFAULT_JOB_OPTIONS } from "./job-types.js";
import type { JobType, JobPayloadMap } from "./job-types.js";

export interface JobSchedulerConfig {
  redisUrl: string;
  queueName?: string;
}

export class JobScheduler {
  private readonly queue: Queue;
  private readonly redis: Redis;

  constructor(config: JobSchedulerConfig) {
    this.redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue(config.queueName ?? DEFAULT_QUEUE_NAME, {
      connection: this.redis,
    });
  }

  /**
   * Schedule a one-time delayed job.
   * @param jobType  The type of job to run.
   * @param payload  Typed payload for the job.
   * @param delayMs  Milliseconds to delay before processing (0 = immediate).
   * @returns The created job ID.
   */
  async schedule<T extends JobType>(
    jobType: T,
    payload: JobPayloadMap[T],
    delayMs: number,
    jobId?: string
  ): Promise<string> {
    const job = await this.queue.add(jobType, payload, {
      delay: delayMs,
      ...DEFAULT_JOB_OPTIONS,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
      ...(jobId !== undefined ? { jobId } : {}),
    });
    return job.id as string;
  }

  /**
   * Schedule a recurring cron job.
   * @param jobType        The type of job to run.
   * @param payload        Typed payload for the job.
   * @param cronExpression Cron expression (e.g. "0 9 * * *").
   */
  async scheduleCron<T extends JobType>(
    jobType: T,
    payload: JobPayloadMap[T],
    cronExpression: string
  ): Promise<void> {
    const schedulerId = `${jobType}:cron`;
    await this.queue.upsertJobScheduler(
      schedulerId,
      {
        pattern: cronExpression,
      },
      {
        name: jobType,
        data: payload,
        opts: { ...DEFAULT_JOB_OPTIONS },
      }
    );
  }

  /**
   * Cancel a scheduled job by its job ID.
   * Silently succeeds if the job does not exist.
   * @param jobId The job ID to cancel.
   */
  async cancel(jobId: string): Promise<void> {
    try {
      await this.queue.remove(jobId);
    } catch {
      // Job may already be processed or not exist — treat as success
    }
  }

  /**
   * Gracefully close BullMQ queue and Redis connections.
   */
  async close(): Promise<void> {
    await this.queue.close();
    await this.redis.quit();
  }
}
