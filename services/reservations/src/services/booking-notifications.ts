import { JobScheduler, JOB_TYPES } from "@mbe/jobs";
import { ResendNotificationAdapter } from "@mbe/notifications";
import { Resend } from "resend";
import type { Reservation } from "@mbe/types";
import { venueService } from "./venue.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const MANAGE_BASE_URL = process.env.MANAGE_BASE_URL ?? "https://mattbutlerengineering.com";

// Lazy singletons — only instantiated when actually used
let _scheduler: JobScheduler | null = null;

function getScheduler(): JobScheduler {
  if (!_scheduler) {
    _scheduler = new JobScheduler({ redisUrl: REDIS_URL });
  }
  return _scheduler;
}

const resendClient = process.env.RESEND_API_KEY
  ? (new Resend(process.env.RESEND_API_KEY) as unknown as {
      emails: {
        send(payload: Record<string, unknown>): Promise<{ id: string }>;
      };
    })
  : null;

const notificationAdapter = new ResendNotificationAdapter({
  resend: resendClient,
  fromAddress: process.env.EMAIL_FROM ?? "reservations@mattbutlerengineering.com",
  manageBaseUrl: MANAGE_BASE_URL,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

function reminderJobId(jobType: string, reservationId: string): string {
  return `${jobType}:${reservationId}`;
}

function resolveChannel(
  guestEmail: string | null,
  guestPhone: string | null
): "email" | "sms" | "both" {
  if (guestEmail && guestPhone) return "both";
  if (guestPhone) return "sms";
  return "email";
}

/**
 * Send booking confirmation and schedule day-before + day-of reminder jobs.
 * Walk-ins (startTime in the past) skip reminders.
 */
export async function scheduleBookingNotifications(
  reservation: Reservation,
  manageToken: string
): Promise<void> {
  const { id, venueId, guestEmail, guestPhone, startTime } = reservation;

  // Send confirmation if we have venue + email
  if (guestEmail && venueId) {
    const venue = await venueService.getById(venueId);
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

  // Schedule reminders only for future bookings with a venue
  if (!venueId) return;

  const startMs = new Date(startTime).getTime();
  const now = Date.now();

  if (startMs <= now) {
    // Walk-in or past reservation — skip reminders
    return;
  }

  const scheduler = getScheduler();
  const channel = resolveChannel(guestEmail, guestPhone);

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

/**
 * Cancel pending reminder jobs for a reservation (on cancellation).
 */
export async function cancelBookingReminders(reservationId: string): Promise<void> {
  const scheduler = getScheduler();
  await Promise.allSettled([
    scheduler.cancel(reminderJobId(JOB_TYPES.BOOKING_REMINDER, reservationId)),
    scheduler.cancel(reminderJobId(JOB_TYPES.DAY_OF_REMINDER, reservationId)),
  ]);
}

/**
 * Cancel existing reminders and reschedule to new times (on rescheduling).
 */
export async function rescheduleBookingReminders(
  reservation: Reservation,
  manageToken: string
): Promise<void> {
  await cancelBookingReminders(reservation.id);
  await scheduleBookingNotifications(reservation, manageToken);
}
