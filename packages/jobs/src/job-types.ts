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

export interface ReminderPayload {
  reservationId: string;
  guestPhone: string | null;
  guestEmail: string | null;
  venueId: string;
  channel: "sms" | "email" | "both";
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
  // The WAITLIST_EXPIRY handler derives the venue and next-in-line guest from
  // expireEntry(waitlistEntryId), so only the entry id is required. These stay
  // declared (optional) for forward-compatible payload enrichment; nothing
  // enqueues or reads them today.
  guestPhone?: string | null;
  guestEmail?: string | null;
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
