export const DEFAULT_QUEUE_NAME = "mbe-notifications";

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
} as const;

export const JOB_TYPES = {
  BOOKING_REMINDER: "booking-reminder",
  CLOSURE_NOTICE: "closure-notice",
  DAY_OF_REMINDER: "day-of-reminder",
  POST_VISIT_FOLLOWUP: "post-visit-followup",
  WAITLIST_EXPIRY: "waitlist-expiry",
  CLOSURE_REFUND: "closure-refund",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

/**
 * Retry policy for one job type. A refund owes a guest money and must ride out
 * a multi-minute Stripe incident: 8 attempts backing off 5s, 10s, ... 320s
 * (~10.5 minutes in all). Permanent Stripe errors skip the wait entirely
 * (ClosureRefundPermanentError). Everything else keeps the default.
 */
const CLOSURE_REFUND_JOB_OPTIONS = {
  attempts: 8,
  backoff: { type: "exponential" as const, delay: 5000 },
} as const;

export function jobOptionsFor(
  jobType: JobType
): typeof DEFAULT_JOB_OPTIONS | typeof CLOSURE_REFUND_JOB_OPTIONS {
  return jobType === JOB_TYPES.CLOSURE_REFUND ? CLOSURE_REFUND_JOB_OPTIONS : DEFAULT_JOB_OPTIONS;
}

// JobHandlerMap (below) is `Partial<{ [K in JobType]: ... }>`, not an
// exhaustive mapped type. Adding a new entry to JOB_TYPES does NOT require
// every service's handler factory to add a stub for it — a service registers
// handlers only for the job types it actually processes. dispatchJob throws
// UnknownJobTypeError for a known JobType with no registered handler, so a
// mis-enqueued job still fails loudly (retried, then failed) instead of
// silently vanishing.

export interface ReminderPayload {
  reservationId: string;
  venueId: string;
  /**
   * Channels already delivered by an earlier attempt of this job. Written back
   * via JobContext.updateData before a retry so a delivered channel is never
   * re-sent.
   */
  deliveredChannels?: ("email" | "sms")[];
}

/** Per-attempt context handed to a job handler. */
export interface JobContext {
  /** Persist a patch of new job data (shallow-merged over the current payload) for the retry. */
  updateData(patch: object): Promise<void>;
  /**
   * True when a failure now will not be retried (the last of the job's
   * attempts, or a job whose attempt count is unknown). A handler that must
   * record a terminal failure does so only when this is set.
   */
  isFinalAttempt: boolean;
}

export interface PostVisitFollowupPayload {
  reservationId: string;
  guestId: string;
  guestEmail: string | null;
  guestPhone: string | null;
  venueId: string;
}

export interface WaitlistExpiryPayload {
  waitlistEntryId: string;
  // guestPhone/guestEmail stay declared (optional) for forward-compatible
  // payload enrichment; nothing enqueues or reads them today.
  guestPhone?: string | null;
  guestEmail?: string | null;
  // Populated at enqueue time (services/reservations' waitlist-notifier.ts —
  // notifyTableReady, this job's one enqueue site) so the handler can run
  // inside runWithVenueContext(venueId, ...) instead of deriving the venue
  // from an RLS-protected read with no context (ADR-026 §3.3 item 7). Stays
  // optional rather than required: a job enqueued before this fix shipped is
  // already sitting in Redis without it, and BullMQ never re-serializes a
  // payload once queued. The handler (services/reservations'
  // job-worker.ts) falls back to its pre-fix behavior, with a warning log,
  // for any payload missing it. Safe to make required (and delete that
  // fallback) once one WAITLIST_EXPIRY TTL (FIVE_MINUTES_MS,
  // waitlist-notifier.ts) has elapsed post-deploy — every legacy job will
  // have drained by then.
  venueId?: string;
}

/**
 * One guest's closure notice (docs/features/venue-availability/architecture.md
 * § Jobs). The job id is `closure-notice_<outcomeId>[_reopened]` (BullMQ rejects `:` in custom ids), so a replayed
 * enqueue is a no-op while the job is queued.
 */
export interface ClosureNoticePayload {
  outcomeId: string;
  venueId: string;
  /** `reopened` is the opt-in "we've reopened" notice; default is the closure notice. */
  variant?: "closure" | "reopened";
  /** The booking starts within 6 hours: SMS and email wherever the guest has them. */
  urgent?: boolean;
}

/** Refunds the deposit behind one `ClosureOutcome` (services/closure-refund.ts). */
export interface ClosureRefundPayload {
  outcomeId: string;
  venueId: string;
}

export type JobPayloadMap = {
  [JOB_TYPES.CLOSURE_NOTICE]: ClosureNoticePayload;
  [JOB_TYPES.BOOKING_REMINDER]: ReminderPayload;
  [JOB_TYPES.DAY_OF_REMINDER]: ReminderPayload;
  [JOB_TYPES.POST_VISIT_FOLLOWUP]: PostVisitFollowupPayload;
  [JOB_TYPES.WAITLIST_EXPIRY]: WaitlistExpiryPayload;
  [JOB_TYPES.CLOSURE_REFUND]: ClosureRefundPayload;
};

export type JobHandlerMap = Partial<{
  [K in JobType]: (payload: JobPayloadMap[K], ctx: JobContext) => Promise<void>;
}>;
