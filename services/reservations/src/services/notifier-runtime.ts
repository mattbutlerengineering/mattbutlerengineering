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
  /** Redis URL — the single source for the scheduler AND the in-process worker. */
  readonly redisUrl: string;
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
  const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

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
    if (!scheduler) scheduler = new JobScheduler({ redisUrl });
    return scheduler;
  }

  const lazyScheduler: NotifierScheduler = {
    schedule<T extends JobType>(
      jobType: T,
      payload: JobPayloadMap[T],
      delayMs: number,
      jobId?: string
    ): Promise<string> {
      return connect().schedule(jobType, payload, delayMs, jobId);
    },
    cancel(jobId: string): Promise<void> {
      return connect().cancel(jobId);
    },
  };

  return { redisUrl, scheduler: lazyScheduler, smsAdapter };
}
