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
      // Defer the connection to the first command so constructing a JobScheduler
      // is side-effect-free. Without this, ioredis connects eagerly and (with
      // maxRetriesPerRequest: null) retries forever, so merely building app
      // wiring — e.g. createDefaultWaitlistNotifier() in reservations — opens a
      // background ECONNREFUSED loop in tests/CI where no Redis is present.
      lazyConnect: true,
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
   * Make sure a runnable job exists under `jobId`, for a caller that knows the
   * work is still owed (the closure outcome sweeper). BullMQ treats an id held
   * in ANY state, including retained failed / completed jobs, as a duplicate,
   * so a plain `schedule` would silently do nothing. Here:
   *  - no job → add it (`added`);
   *  - failed or completed → remove it and add it again under the same id
   *    (`requeued`), so replicas still dedupe on that id;
   *  - waiting / delayed / active / etc. → leave it (`live`).
   */
  async requeue<T extends JobType>(
    jobType: T,
    payload: JobPayloadMap[T],
    jobId: string
  ): Promise<"added" | "requeued" | "live"> {
    const existing = await this.queue.getJob(jobId);
    if (!existing) {
      await this.schedule(jobType, payload, 0, jobId);
      return "added";
    }
    const state = await existing.getState();
    if (state !== "failed" && state !== "completed") return "live";
    await existing.remove();
    await this.schedule(jobType, payload, 0, jobId);
    return "requeued";
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
   * Never throws: resolves `true` when a job was removed, `false` when there
   * was none (or it could not be removed, e.g. it is locked while running).
   * @param jobId The job ID to cancel.
   */
  async cancel(jobId: string): Promise<boolean> {
    try {
      return (await this.queue.remove(jobId)) === 1;
    } catch {
      // Job may already be processed or not exist — nothing was removed
      return false;
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
