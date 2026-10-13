import type { BookingNotificationInput } from "./port.js";
import { generateBookingIcal } from "./ical.js";
import type { IcalMethod } from "./ical.js";
import { buildBookingEmail } from "./email-content.js";
import type { NotificationEventType } from "./email-content.js";
import { calendarSequence } from "./venue-time.js";

export type { NotificationEventType };

export interface BookingEmailContent {
  subject: string;
  html: string;
  ical?: string;
  icalMethod?: "REQUEST" | "CANCEL";
}

/**
 * The one place a booking's calendar SEQUENCE is decided, for every event:
 * an explicit override, else derived from the reservation's `updatedAt`
 * (monotonic across confirm → modify → cancel), else 0.
 */
function sequenceFor(input: BookingNotificationInput): number {
  if (input.sequence !== undefined) return input.sequence;
  return input.updatedAt ? calendarSequence(input.updatedAt) : 0;
}

function icalFor(input: BookingNotificationInput, method: IcalMethod): string {
  return generateBookingIcal(
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
      sequence: sequenceFor(input),
    },
    method
  );
}

export function buildBookingEmailContent(
  input: BookingNotificationInput,
  event: NotificationEventType,
  manageBaseUrl: string
): BookingEmailContent {
  const { subject, html } = buildBookingEmail({ ...input, manageBaseUrl }, event);

  switch (event) {
    case "confirmation":
    case "modified":
      return { subject, html, ical: icalFor(input, "REQUEST"), icalMethod: "REQUEST" };
    case "cancelled":
      return { subject, html, ical: icalFor(input, "CANCEL"), icalMethod: "CANCEL" };
    case "reminder":
      return { subject, html };
  }
}
