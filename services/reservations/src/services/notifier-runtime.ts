import { JobScheduler } from "@mbe/jobs";
import type { JobType, JobPayloadMap } from "@mbe/jobs";
import { TwilioSmsAdapter } from "@mbe/notifications";
import type { SmsPort } from "@mbe/notifications";

/**
 * The slice of the real typed JobScheduler the reservations notifiers depend
 * on. Projected from JobScheduler with `Pick` so the jobType→payload
 * compile-time binding — `schedule<T>(jobType: T, payload: JobPayloadMap[T], …)`
 * — survives the injection seam. Notifiers depend on this instead of each
 * re-declaring a narrower, untyped `{ schedule(jobType: string, payload: unknown) }`
 * and casting back to the typed shape at the call site.
 */
export type NotifierScheduler = Pick<JobScheduler, "schedule" | "cancel">;

/**
 * Single owner of the reservations notifier infrastructure. Reads the env vars
 * the notifiers used to each re-read (Twilio, REDIS_URL) once and hands out a
 * TYPED scheduler whose Redis connection is opened lazily. Replaces the
 * per-notifier lazy-singleton wrappers that duplicated this construction ritual.
 */
export interface NotifierRuntime {
  /**
   * Redis URL — the single source for the scheduler AND the in-process worker.
   * Null when NODE_ENV=production and REDIS_URL is unset: production must
   * never silently fall back to redis://localhost:6379, since no Redis is
   * provisioned there (see #4172, tracked separately in #3763). Notification
   * job scheduling is degraded, not the whole service.
   */
  readonly redisUrl: string | null;
  /** Typed job scheduler; opens Redis on the first schedule/cancel, not before. */
  readonly scheduler: NotifierScheduler;
  /** Twilio-backed SMS port when configured, else null. */
  readonly smsAdapter: SmsPort | null;
}

/**
 * Constructs the notifier runtime. Reads env once; performs no I/O — the
 * JobScheduler (whose constructor opens a Redis connection) is deferred to the
 * first schedule/cancel call so buildApp() stays side-effect-free.
 */
export function createNotifierRuntime(): NotifierRuntime {
  const isProduction = process.env.NODE_ENV === "production";
  const envRedisUrl = process.env.REDIS_URL;

  if (isProduction && !envRedisUrl) {
    // No Redis is provisioned in production (#3763). Falling back to
    // redis://localhost:6379 here would silently schedule reminder/waitlist
    // jobs against a connection that never delivers them. Surface this
    // loudly and greppably instead — the service still boots and serves
    // reservations traffic in a degraded (no job scheduling) mode.
    console.error(
      "[ERROR] REDIS_URL is not set in production. Refusing to fall back to redis://localhost:6379 — " +
        "notification job scheduling (booking reminders, waitlist expiry, post-visit notifications) is disabled until REDIS_URL is configured (see #3763)."
    );
  }

  const redisUrl = envRedisUrl ?? (isProduction ? null : "redis://localhost:6379");

  const smsAdapter: SmsPort | null =
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
      ? new TwilioSmsAdapter({
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          client: require("twilio")(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          ) as never,
          fromNumber: process.env.TWILIO_FROM_NUMBER,
        })
      : null;

  // The JobScheduler constructor opens a Redis connection, so defer it to the
  // first schedule/cancel. This is the ONE place the notifier scheduler is
  // lazily connected — the wrappers that each did this are gone.
  let scheduler: JobScheduler | null = null;
  function connect(): JobScheduler {
    if (!redisUrl) {
      // Never connect to redis://localhost:6379 as a blind guess (#4172).
      throw new Error(
        "Cannot schedule/cancel notification jobs: REDIS_URL is not configured in production (see #3763)."
      );
    }
    if (!scheduler) scheduler = new JobScheduler({ redisUrl });
    return scheduler;
  }

  const lazyScheduler: NotifierScheduler = {
    // async so a synchronous throw from connect() (unconfigured REDIS_URL)
    // surfaces as a rejected promise, not an uncaught exception — callers
    // already await schedule()/cancel().
    async schedule<T extends JobType>(
      jobType: T,
      payload: JobPayloadMap[T],
      delayMs: number,
      jobId?: string
    ): Promise<string> {
      return connect().schedule(jobType, payload, delayMs, jobId);
    },
    async cancel(jobId: string): Promise<void> {
      return connect().cancel(jobId);
    },
  };

  return { redisUrl, scheduler: lazyScheduler, smsAdapter };
}
