import type { FastifyBaseLogger } from "fastify";
import { JobWorker, JOB_TYPES } from "@mbe/jobs";
import type { JobHandlerMap, ReminderPayload, WaitlistExpiryPayload } from "@mbe/jobs";
import type { BookingNotificationInput } from "@mbe/notifications";
import type { CommunicationPreference, Reservation, Venue } from "@mbe/types";
import { resolveChannel } from "./contact-policy.js";
import { runWithVenueContext } from "./venue-context-store.js";

/**
 * Minimal slice of NotificationDispatcher the reminder handlers depend on.
 * Kept narrow so tests can inject a fake without a Resend/Twilio client.
 */
export interface ReminderDispatcher {
  sendBookingReminder(
    input: BookingNotificationInput,
    preference: CommunicationPreference
  ): Promise<void>;
}

/**
 * Narrow logger shape the WAITLIST_EXPIRY legacy-payload fallback needs —
 * satisfied by `FastifyBaseLogger`, mirroring `RlsTripwireLogger`
 * (`./rls-context-mode.ts`).
 */
export interface JobWorkerLogger {
  warn(details: object, msg: string): void;
}

export interface ReservationJobHandlerDeps {
  /** Finder: load the reservation the reminder targets. */
  getReservation(id: string): Promise<Reservation | null>;
  /** Finder: load the venue for reminder content. */
  getVenue(id: string): Promise<Venue | null>;
  /** Dispatcher: sends the booking reminder over the guest's channel(s). */
  dispatcher: ReminderDispatcher;
  /** Signs a fresh manage-token so the reminder carries a working manage link. */
  generateManageToken(reservationId: string, guestEmail: string): string;
  /** Waitlist re-notify path — expires the entry and notifies the next guest. */
  handleWaitlistExpiry(input: { waitlistEntryId: string }): Promise<void>;
  /** Logs the WAITLIST_EXPIRY legacy-payload fallback (see handleWaitlistExpiryJob below). */
  logger: JobWorkerLogger;
}

/**
 * Composes the reservations JobHandlerMap from existing finder + dispatcher
 * logic. BOOKING_REMINDER and DAY_OF_REMINDER share the reminder-delivery
 * path (load reservation + venue → send via preference); WAITLIST_EXPIRY
 * reaches the existing handleExpiry re-notify-next-guest path. JobHandlerMap
 * is partial, so only the job types this service actually handles are
 * declared here — dispatchJob throws UnknownJobTypeError for any other job
 * type routed to this worker, so a mis-enqueued job still fails loudly.
 *
 * `deliverReminder` runs its whole body inside `runWithVenueContext(payload.venueId,
 * …)` (ADR-026 §3.3 item 7). This BullMQ consumer has no HTTP request, so
 * `getCurrentVenueId()` would otherwise be `null` and every RLS-scoped Prisma
 * query the two finders issue would silently return zero rows once
 * `FORCE ROW LEVEL SECURITY` lands — no error, no retry, no log line.
 * `ReminderPayload` (`@mbe/jobs`) already declares `venueId` required, so the
 * venue is in hand at dispatch; this is simply the same
 * `runWithVenueContext(venueId, …)` convention `../routes/deposits.ts` already
 * uses, applied to the job-worker call site. `handleWaitlistExpiryJob` closes
 * the other half of item 7 the same way, wrapping `deps.handleWaitlistExpiry`
 * whenever `payload.venueId` is present; see its own doc comment for the
 * legacy-payload fallback.
 */
export function createReservationJobHandlers(deps: ReservationJobHandlerDeps): JobHandlerMap {
  async function deliverReminder(payload: ReminderPayload): Promise<void> {
    return runWithVenueContext(payload.venueId, async () => {
      const reservation = await deps.getReservation(payload.reservationId);
      if (!reservation) return;

      const venue = await deps.getVenue(payload.venueId);
      // No email or missing venue → nothing deliverable; return (no retry).
      if (!reservation.guestEmail || !venue) return;

      const preference = resolveChannel(
        reservation.guest?.communicationPreference as CommunicationPreference | null
      );

      const input: BookingNotificationInput = {
        reservationId: reservation.id,
        date: reservation.date,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
        partySize: reservation.partySize,
        guestName: reservation.guestName,
        guestEmail: reservation.guestEmail,
        guestPhone: reservation.guestPhone ?? null,
        specialRequests: reservation.notes ?? null,
        venueName: venue.name,
        venueTimezone: venue.ianaTimezone,
        venueAddress: null,
        manageToken: deps.generateManageToken(reservation.id, reservation.guestEmail),
      };

      // Dispatcher failures propagate so BullMQ retries per the queue policy.
      await deps.dispatcher.sendBookingReminder(input, preference);
    });
  }

  /**
   * WAITLIST_EXPIRY runs inside `runWithVenueContext(payload.venueId, …)`
   * exactly like `deliverReminder` above, closing the other half of ADR-026
   * §3.3 item 7. `payload.venueId` is populated at the job's one enqueue
   * site (`waitlist-notifier.ts`'s `notifyTableReady`) — see
   * `WaitlistExpiryPayload` (`@mbe/jobs`) for why it stays optional rather
   * than required: a job enqueued before this fix shipped is already
   * sitting in Redis without it, and BullMQ never re-serializes a payload
   * once queued. For that legacy case, fall back to the pre-fix behavior
   * (no venue context) and log a warning naming the job and entry id,
   * rather than inventing a cross-venue lookup — safe to delete once one
   * WAITLIST_EXPIRY TTL (FIVE_MINUTES_MS, waitlist-notifier.ts) has elapsed
   * post-deploy.
   */
  async function handleWaitlistExpiryJob(payload: WaitlistExpiryPayload): Promise<void> {
    if (payload.venueId) {
      return runWithVenueContext(payload.venueId, () =>
        deps.handleWaitlistExpiry({ waitlistEntryId: payload.waitlistEntryId })
      );
    }

    deps.logger.warn(
      { jobType: JOB_TYPES.WAITLIST_EXPIRY, waitlistEntryId: payload.waitlistEntryId },
      "WAITLIST_EXPIRY job has no venueId (legacy payload enqueued before the venue-context fix) — running without RLS venue context"
    );
    return deps.handleWaitlistExpiry({ waitlistEntryId: payload.waitlistEntryId });
  }

  return {
    [JOB_TYPES.BOOKING_REMINDER]: deliverReminder,
    [JOB_TYPES.DAY_OF_REMINDER]: deliverReminder,
    [JOB_TYPES.WAITLIST_EXPIRY]: handleWaitlistExpiryJob,
  };
}

export interface ReservationJobWorkerConfig {
  redisUrl: string;
  handlers: JobHandlerMap;
  queueName?: string;
}

export interface ReservationJobRuntime {
  /** Constructs and starts the in-process worker (begins consuming jobs). */
  start(log: FastifyBaseLogger): void;
  /** Gracefully closes the worker and its Redis connection. */
  stop(): Promise<void>;
}

/**
 * Wraps @mbe/jobs' JobWorker with a start/stop lifecycle so worker
 * construction (which opens the Redis consumer) is deferred out of buildApp,
 * keeping app construction side-effect-free. Mirrors createLapsedGuestMonitor's
 * onReady/onClose wiring.
 */
export function createReservationJobWorker(
  config: ReservationJobWorkerConfig
): ReservationJobRuntime {
  let worker: JobWorker | null = null;

  return {
    start(log: FastifyBaseLogger): void {
      if (worker) return;
      worker = new JobWorker({
        redisUrl: config.redisUrl,
        handlers: config.handlers,
        ...(config.queueName !== undefined ? { queueName: config.queueName } : {}),
      });
      log.info("reservations job worker started");
    },

    async stop(): Promise<void> {
      if (!worker) return;
      await worker.close();
      worker = null;
    },
  };
}
