export interface IcalEventInput {
  reservationId: string;
  date: string;
  startTime: string;
  endTime: string;
  partySize: number;
  guestName: string | null;
  guestEmail: string | null;
  venueName: string;
  venueTimezone: string;
  sequence?: number;
}

export type IcalMethod = "REQUEST" | "CANCEL";

/**
 * Escapes characters with special meaning in RFC 5545 TEXT property values.
 * Prevents a guest-controlled value (name, venue name) from breaking out of
 * its property and injecting a new iCal line (e.g. a rogue METHOD:CANCEL).
 */
export function escapeIcalText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

const FORBIDDEN_ICAL_TOKEN_CHARS = /[\r\n;]/;

function assertSafeIcalToken(value: string, fieldName: string): void {
  if (FORBIDDEN_ICAL_TOKEN_CHARS.test(value)) {
    throw new Error(`Invalid ${fieldName}: must not contain CR, LF, or ";"`);
  }
}

export function generateBookingIcal(input: IcalEventInput, method: IcalMethod): string {
  assertSafeIcalToken(input.venueTimezone, "venueTimezone");
  if (input.guestEmail) assertSafeIcalToken(input.guestEmail, "guestEmail");

  const uid = `${input.reservationId}@mbe`;
  const sequence = input.sequence ?? 0;
  const now = formatIcalDate(new Date());

  const dtstart = toIcalDateTime(input.date, input.startTime, input.venueTimezone);
  const dtend = toIcalDateTime(input.date, input.endTime, input.venueTimezone);

  const venueName = escapeIcalText(input.venueName);
  const summary =
    method === "CANCEL" ? `CANCELLED: Reservation at ${venueName}` : `Reservation at ${venueName}`;

  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";

  const description =
    `Party of ${input.partySize}` +
    (input.guestName ? `\\nGuest: ${escapeIcalText(input.guestName)}` : "");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//MBE//Booking//EN`,
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `SEQUENCE:${sequence}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${input.venueTimezone}:${dtstart}`,
    `DTEND;TZID=${input.venueTimezone}:${dtend}`,
    `SUMMARY:${summary}`,
    `LOCATION:${venueName}`,
    `DESCRIPTION:${description}`,
    `STATUS:${status}`,
    ...(input.guestEmail
      ? [`ORGANIZER:mailto:noreply@mbe.dev`, `ATTENDEE:mailto:${input.guestEmail}`]
      : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

function toIcalDateTime(date: string, time: string, _timezone: string): string {
  const [year, month, day] = date.split("-");
  const [hour, minute] = time.split(":");
  return `${year}${month}${day}T${hour}${minute}00`;
}

function formatIcalDate(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
