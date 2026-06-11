import { JobScheduler, JOB_TYPES } from "@mbe/jobs";
import { ResendNotificationAdapter } from "@mbe/notifications";
import type { NotificationPort } from "@mbe/notifications";
import { Resend } from "resend";
import type { Reservation, Venue } from "@mbe/types";
import { venueService } from "./venue.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MANAGE_BASE_URL = process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com";

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function reminderJobId(jobType: string, reservationId: string): string {
  return `${jobType}:${reservationId}`;
}

function resolveChannel(
  guestEmail: string | null,
  guestPhone: string | null,
  communicationPreference: string | null = null
): "email" | "sms" | "both" {
  if (communicationPreference === "email") return "email";
  if (communicationPreference === "sms") return "sms";
  if (communicationPreference === "both") return "both";
  // Fall back to data availability
  if (guestEmail && guestPhone) return "both";
  if (guestPhone) return "sms";
  return "email";
}

// ─── BookingNotifier factory ─────────────────────────────────────────────────

export interface BookingNotifierDeps {
  notificationAdapter: NotificationPort;
  scheduler: { schedule(...args: unknown[]): Promise<unknown>; cancel(id: string): Promise<void> };
  getVenue: (venueId: string) => Promise<Venue | null>;
}

export interface BookingNotifier {
  scheduleBookingNotifications(reservation: Reservation, manageToken: string): Promise<void>;
  cancelBookingReminders(reservationId: string): Promise<void>;
  rescheduleBookingReminders(reservation: Reservation, manageToken: string): Promise<void>;
}

export function createBookingNotifier(deps: BookingNotifierDeps): BookingNotifier {
  const { notificationAdapter, scheduler, getVenue } = deps;

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

    const communicationPreference = (reservation as unknown as Record<string, unknown>)
      .communicationPreference as string | null | undefined;
    const channel = resolveChannel(guestEmail, guestPhone, communicationPreference ?? null);

    const dayBeforeDelay = startMs - now - DAY_MS;
    if (dayBeforeDelay > 0) {
      await scheduler.schedule(
        JOB_TYPES.BOOKING_REMINDER,
        { reservationId: id, guestEmail, guestPhone: guestPhone ?? null, venueId, channel },
        dayBeforeDelay
      );
    }

    const dayOfDelay = startMs - now - TWO_HOURS_MS;
    if (dayOfDelay > 0) {
      await scheduler.schedule(
        JOB_TYPES.DAY_OF_REMINDER,
        { reservationId: id, guestEmail, guestPhone: guestPhone ?? null, venueId, channel },
        dayOfDelay
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

  return { scheduleBookingNotifications, cancelBookingReminders, rescheduleBookingReminders };
}

// ─── Default notifier (env-backed deps, constructed per app instance) ────────

/**
 * Creates the production BookingNotifier backed by Resend + BullMQ.
 * Dep construction is deferred to first use: JobScheduler opens a Redis
 * connection in its constructor, and buildApp() must stay side-effect-free
 * for tests that don't inject a stub.
 */
export function createDefaultBookingNotifier(): BookingNotifier {
  let notifier: BookingNotifier | null = null;

  function getNotifier(): BookingNotifier {
    if (!notifier) {
      const resendClient = process.env.RESEND_API_KEY
        ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
            emails: {
              send(payload: Record<string, unknown>): Promise<{ id: string }>;
            };
          })
        : null;

      const notificationAdapter: NotificationPort = new ResendNotificationAdapter({
        resend: resendClient,
        fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
        manageBaseUrl: MANAGE_BASE_URL,
      });

      notifier = createBookingNotifier({
        notificationAdapter,
        scheduler: new JobScheduler({ redisUrl: REDIS_URL }),
        getVenue: (venueId) => venueService.getById(venueId),
      });
    }
    return notifier;
  }

  return {
    scheduleBookingNotifications: (reservation, manageToken) =>
      getNotifier().scheduleBookingNotifications(reservation, manageToken),
    cancelBookingReminders: (reservationId) => getNotifier().cancelBookingReminders(reservationId),
    rescheduleBookingReminders: (reservation, manageToken) =>
      getNotifier().rescheduleBookingReminders(reservation, manageToken),
  };
}
