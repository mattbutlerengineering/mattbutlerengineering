import type { FastifyBaseLogger } from "fastify";
import { JobWorker, JOB_TYPES } from "@mbe/jobs";
import type { JobHandlerMap, JobType, ReminderPayload } from "@mbe/jobs";
import type { BookingNotificationInput } from "@mbe/notifications";
import type { CommunicationPreference, Reservation, Venue } from "@mbe/types";

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
}

/**
 * Builds a handler that throws for a job type with no wired delivery. These
 * types are never enqueued today; a throwing handler makes a mis-enqueued job
 * fail loudly (retried then failed) rather than silently vanishing in Redis —
 * the exact failure mode #3078 removes for the load-bearing types.
 */
function unwired(jobType: JobType): (payload: unknown) => Promise<void> {
  return () => Promise.reject(new Error(`No delivery handler registered for job type "${jobType}"`));
}

/**
 * Composes the reservations JobHandlerMap from existing finder + dispatcher
 * logic. BOOKING_REMINDER and DAY_OF_REMINDER share the reminder-delivery
 * path (load reservation + venue → send via preference); WAITLIST_EXPIRY
 * reaches the existing handleExpiry re-notify-next-guest path.
 */
export function createReservationJobHandlers(deps: ReservationJobHandlerDeps): JobHandlerMap {
  async function deliverReminder(payload: ReminderPayload): Promise<void> {
    const reservation = await deps.getReservation(payload.reservationId);
    if (!reservation) return;

    const venue = await deps.getVenue(payload.venueId);
    // No email or missing venue → nothing deliverable; return (no retry).
    if (!reservation.guestEmail || !venue) return;

    const preference =
      (reservation.guest?.communicationPreference as CommunicationPreference | null) ?? "email_only";

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
  }

  return {
    [JOB_TYPES.BOOKING_REMINDER]: deliverReminder,
    [JOB_TYPES.DAY_OF_REMINDER]: deliverReminder,
    [JOB_TYPES.WAITLIST_EXPIRY]: (payload) =>
      deps.handleWaitlistExpiry({ waitlistEntryId: payload.waitlistEntryId }),
    [JOB_TYPES.POST_VISIT_FOLLOWUP]: unwired(JOB_TYPES.POST_VISIT_FOLLOWUP),
    [JOB_TYPES.PRE_ARRIVAL_BRIEFING]: unwired(JOB_TYPES.PRE_ARRIVAL_BRIEFING),
    [JOB_TYPES.LAPSED_GUEST_SCAN]: unwired(JOB_TYPES.LAPSED_GUEST_SCAN),
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
