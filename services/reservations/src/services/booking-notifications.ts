import { JOB_TYPES } from "@mbe/jobs";
import type { ReminderPayload } from "@mbe/jobs";
import type { NotificationDispatcher } from "@mbe/notifications";
import type { CommunicationPreference } from "@mbe/types";
import type { Reservation, Venue } from "@mbe/types";
import type { FastifyBaseLogger } from "fastify";
import { venueService } from "./venue.js";
import type { NotifierRuntime, NotifierScheduler } from "./notifier-runtime.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function reminderJobId(jobType: string, reservationId: string): string {
  return `${jobType}:${reservationId}`;
}

export interface ResolveChannelInput {
  email: string | null;
  phone: string | null;
  communicationPreference: CommunicationPreference | null;
}

export function resolveChannel(input: ResolveChannelInput): "email" | "sms" | "both" {
  const { email, phone, communicationPreference } = input;
  if (communicationPreference === "email_only") return "email";
  if (communicationPreference === "sms_only") return "sms";
  if (communicationPreference === "both") return "both";
  if (communicationPreference === "transactional_only") return "email";
  // Fall back to data availability
  if (email && phone) return "both";
  if (phone) return "sms";
  return "email";
}

// ─── BookingNotifier factory ─────────────────────────────────────────────────

/**
 * Who triggered a cancellation. Guest self-service and staff/venue-side
 * cancels both notify the guest identically today; the distinction is carried
 * for observability and future user/system-specific handling.
 */
export type CancelInitiator = "guest" | "staff";

export interface BookingNotifierDeps {
  notificationAdapter: NotificationDispatcher;
  scheduler: NotifierScheduler;
  getVenue: (venueId: string) => Promise<Venue | null>;
  logger?: FastifyBaseLogger;
}

export interface BookingNotifier {
  scheduleBookingNotifications(reservation: Reservation, manageToken: string): Promise<void>;
  cancelBookingReminders(reservationId: string): Promise<void>;
  rescheduleBookingReminders(reservation: Reservation, manageToken: string): Promise<void>;
  cancelBookingNotifications(
    reservation: Reservation,
    manageToken: string,
    initiator: CancelInitiator
  ): Promise<void>;
}

export function createBookingNotifier(deps: BookingNotifierDeps): BookingNotifier {
  const { notificationAdapter, scheduler, getVenue, logger } = deps;

  async function scheduleBookingNotifications(
    reservation: Reservation,
    manageToken: string
  ): Promise<void> {
    const { id, venueId, guestEmail, guestPhone, startTime } = reservation;

    if (guestEmail && venueId) {
      const venue = await getVenue(venueId);
      if (venue) {
        await notificationAdapter.sendBookingConfirmation({
          reservationId: id,
          date: reservation.date,
          startTime,
          endTime: reservation.endTime,
          partySize: reservation.partySize,
          guestName: reservation.guestName,
          guestEmail,
          guestPhone: guestPhone ?? null,
          specialRequests: reservation.notes ?? null,
          venueName: venue.name,
          venueTimezone: venue.ianaTimezone,
          venueAddress: null,
          manageToken,
        });
      }
    }

    if (!venueId) return;

    const startMs = new Date(startTime).getTime();
    const now = Date.now();

    if (startMs <= now) return;

    const channel = resolveChannel({
      email: guestEmail,
      phone: guestPhone,
      communicationPreference:
        (reservation.guest?.communicationPreference as CommunicationPreference | null) ?? null,
    });

    const reminderPayload: ReminderPayload = {
      reservationId: id,
      guestEmail,
      guestPhone: guestPhone ?? null,
      venueId,
      channel,
    };

    const dayBeforeDelay = startMs - now - DAY_MS;
    if (dayBeforeDelay > 0) {
      await scheduler.schedule(
        JOB_TYPES.BOOKING_REMINDER,
        reminderPayload,
        dayBeforeDelay,
        reminderJobId(JOB_TYPES.BOOKING_REMINDER, id)
      );
    }

    const dayOfDelay = startMs - now - TWO_HOURS_MS;
    if (dayOfDelay > 0) {
      await scheduler.schedule(
        JOB_TYPES.DAY_OF_REMINDER,
        reminderPayload,
        dayOfDelay,
        reminderJobId(JOB_TYPES.DAY_OF_REMINDER, id)
      );
    }
  }

  async function cancelBookingReminders(reservationId: string): Promise<void> {
    await Promise.allSettled([
      scheduler.cancel(reminderJobId(JOB_TYPES.BOOKING_REMINDER, reservationId)),
      scheduler.cancel(reminderJobId(JOB_TYPES.DAY_OF_REMINDER, reservationId)),
    ]);
  }

  async function rescheduleBookingReminders(
    reservation: Reservation,
    manageToken: string
  ): Promise<void> {
    await cancelBookingReminders(reservation.id);
    await scheduleBookingNotifications(reservation, manageToken);
  }

  /**
   * Owns the full "cancel this booking's notifications" intent: tears down the
   * scheduled reminder jobs AND dispatches the guest-facing cancellation
   * email/SMS. The dispatcher is a collaborator nested behind the notifier, so
   * cancellation callers cross a single seam. Best-effort on dispatch — a
   * failed send is logged but never rethrown, because the reservation cancel
   * that triggered this has already committed.
   */
  async function cancelBookingNotifications(
    reservation: Reservation,
    manageToken: string,
    initiator: CancelInitiator
  ): Promise<void> {
    await cancelBookingReminders(reservation.id);

    const venue = reservation.venueId ? await getVenue(reservation.venueId) : null;
    if (!reservation.guestEmail || !venue) return;

    const preference =
      (reservation.guest?.communicationPreference as CommunicationPreference | null) ??
      "email_only";
    try {
      await notificationAdapter.sendBookingCancelled(
        {
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
          manageToken,
        },
        preference
      );
    } catch (err) {
      logger?.error(
        { err, reservationId: reservation.id, initiator },
        "Failed to send booking cancelled notification"
      );
    }
  }

  return {
    scheduleBookingNotifications,
    cancelBookingReminders,
    rescheduleBookingReminders,
    cancelBookingNotifications,
  };
}

// ─── Default notifier (env-backed deps, constructed per app instance) ────────

/**
 * Creates the production BookingNotifier from the shared NotifierRuntime.
 * Accepts the already-constructed NotificationDispatcher (so the Resend client
 * is constructed exactly once in notifications.ts / createNotificationPort) and
 * the runtime's typed, lazily-connected scheduler — buildApp() stays
 * side-effect-free because the runtime defers the Redis connection to first use.
 */
export function createDefaultBookingNotifier(
  notificationAdapter: NotificationDispatcher,
  runtime: NotifierRuntime,
  logger?: FastifyBaseLogger
): BookingNotifier {
  return createBookingNotifier({
    notificationAdapter,
    scheduler: runtime.scheduler,
    getVenue: (venueId) => venueService.getById(venueId),
    logger,
  });
}
