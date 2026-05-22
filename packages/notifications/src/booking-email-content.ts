import type { BookingNotificationInput } from "./port.js";
import { generateBookingIcal } from "./ical.js";

export type NotificationEventType = "confirmation" | "reminder" | "modified" | "cancelled";

export interface BookingEmailContent {
  subject: string;
  html: string;
  ical?: string;
  icalMethod?: "REQUEST" | "CANCEL";
}

function manageUrl(manageBaseUrl: string, token: string): string {
  return `${manageBaseUrl}?token=${token}`;
}

function buildConfirmationHtml(input: BookingNotificationInput, manageBaseUrl: string): string {
  return [
    `<h1>Your reservation is confirmed</h1>`,
    `<p><strong>${input.venueName}</strong></p>`,
    `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
    input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
    `<p><a href="${manageUrl(manageBaseUrl, input.manageToken)}">Modify or Cancel</a></p>`,
  ].join("\n");
}

function buildReminderHtml(input: BookingNotificationInput, manageBaseUrl: string): string {
  return [
    `<h1>Your reservation is tomorrow</h1>`,
    `<p><strong>${input.venueName}</strong></p>`,
    `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
    input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
    `<p><a href="${manageUrl(manageBaseUrl, input.manageToken)}">Modify or Cancel</a></p>`,
  ].join("\n");
}

function buildModifiedHtml(input: BookingNotificationInput, manageBaseUrl: string): string {
  return [
    `<h1>Your reservation has been updated</h1>`,
    `<p><strong>${input.venueName}</strong></p>`,
    `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
    input.venueAddress ? `<p>${input.venueAddress}</p>` : "",
    `<p><a href="${manageUrl(manageBaseUrl, input.manageToken)}">Modify or Cancel</a></p>`,
  ].join("\n");
}

function buildCancelledHtml(input: BookingNotificationInput): string {
  return [
    `<h1>Your reservation has been cancelled</h1>`,
    `<p><strong>${input.venueName}</strong></p>`,
    `<p>${input.date} at ${input.startTime} — Party of ${input.partySize}</p>`,
  ].join("\n");
}

export function buildBookingEmailContent(
  input: BookingNotificationInput,
  event: NotificationEventType,
  manageBaseUrl: string
): BookingEmailContent {
  switch (event) {
    case "confirmation": {
      const ical = generateBookingIcal(
        {
          reservationId: input.reservationId,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          partySize: input.partySize,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          venueName: input.venueName,
          venueTimezone: input.venueTimezone,
          sequence: input.sequence ?? 0,
        },
        "REQUEST"
      );
      return {
        subject: `Reservation Confirmed — ${input.venueName}`,
        html: buildConfirmationHtml(input, manageBaseUrl),
        ical,
        icalMethod: "REQUEST",
      };
    }

    case "reminder": {
      return {
        subject: `Reminder: Reservation at ${input.venueName}`,
        html: buildReminderHtml(input, manageBaseUrl),
      };
    }

    case "modified": {
      const ical = generateBookingIcal(
        {
          reservationId: input.reservationId,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          partySize: input.partySize,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          venueName: input.venueName,
          venueTimezone: input.venueTimezone,
          sequence: input.sequence ?? 1,
        },
        "REQUEST"
      );
      return {
        subject: `Updated: Reservation at ${input.venueName}`,
        html: buildModifiedHtml(input, manageBaseUrl),
        ical,
        icalMethod: "REQUEST",
      };
    }

    case "cancelled": {
      const ical = generateBookingIcal(
        {
          reservationId: input.reservationId,
          date: input.date,
          startTime: input.startTime,
          endTime: input.endTime,
          partySize: input.partySize,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          venueName: input.venueName,
          venueTimezone: input.venueTimezone,
          sequence: input.sequence ?? 0,
        },
        "CANCEL"
      );
      return {
        subject: `Cancelled: Reservation at ${input.venueName}`,
        html: buildCancelledHtml(input),
        ical,
        icalMethod: "CANCEL",
      };
    }
  }
}
