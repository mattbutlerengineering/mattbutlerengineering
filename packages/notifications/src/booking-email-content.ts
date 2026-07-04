import type { BookingNotificationInput } from "./port.js";
import { generateBookingIcal } from "./ical.js";
import { buildBookingEmail } from "./email-content.js";
import type { NotificationEventType } from "./email-content.js";

export type { NotificationEventType };

export interface BookingEmailContent {
  subject: string;
  html: string;
  ical?: string;
  icalMethod?: "REQUEST" | "CANCEL";
}

export function buildBookingEmailContent(
  input: BookingNotificationInput,
  event: NotificationEventType,
  manageBaseUrl: string
): BookingEmailContent {
  const { subject, html } = buildBookingEmail({ ...input, manageBaseUrl }, event);

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
      return { subject, html, ical, icalMethod: "REQUEST" };
    }

    case "reminder": {
      return { subject, html };
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
      return { subject, html, ical, icalMethod: "REQUEST" };
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
      return { subject, html, ical, icalMethod: "CANCEL" };
    }
  }
}
