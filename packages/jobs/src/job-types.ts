export const DEFAULT_QUEUE_NAME = "mbe-notifications";

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 1000 },
} as const;

export const JOB_TYPES = {
  BOOKING_REMINDER: "booking-reminder",
  DAY_OF_REMINDER: "day-of-reminder",
  POST_VISIT_FOLLOWUP: "post-visit-followup",
  PRE_ARRIVAL_BRIEFING: "pre-arrival-briefing",
  LAPSED_GUEST_SCAN: "lapsed-guest-scan",
  WAITLIST_EXPIRY: "waitlist-expiry",
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

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
}

export interface PostVisitFollowupPayload {
  reservationId: string;
  guestId: string;
  guestEmail: string | null;
  guestPhone: string | null;
  venueId: string;
}

export interface PreArrivalBriefingPayload {
  reservationId: string;
  guestEmail: string;
  venueId: string;
}

export interface LapsedGuestScanPayload {
  venueId: string;
  lapsedAfterDays: number;
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

export type JobPayloadMap = {
  [JOB_TYPES.BOOKING_REMINDER]: ReminderPayload;
  [JOB_TYPES.DAY_OF_REMINDER]: ReminderPayload;
  [JOB_TYPES.POST_VISIT_FOLLOWUP]: PostVisitFollowupPayload;
  [JOB_TYPES.PRE_ARRIVAL_BRIEFING]: PreArrivalBriefingPayload;
  [JOB_TYPES.LAPSED_GUEST_SCAN]: LapsedGuestScanPayload;
  [JOB_TYPES.WAITLIST_EXPIRY]: WaitlistExpiryPayload;
};

export type JobHandlerMap = Partial<{
  [K in JobType]: (payload: JobPayloadMap[K]) => Promise<void>;
}>;
