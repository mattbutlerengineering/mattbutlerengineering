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

export function generateBookingIcal(input: IcalEventInput, method: IcalMethod): string {
  const uid = `${input.reservationId}@mbe`;
  const sequence = input.sequence ?? 0;
  const now = formatIcalDate(new Date());

  const dtstart = toIcalDateTime(input.date, input.startTime, input.venueTimezone);
  const dtend = toIcalDateTime(input.date, input.endTime, input.venueTimezone);

  const summary =
    method === "CANCEL"
      ? `CANCELLED: Reservation at ${input.venueName}`
      : `Reservation at ${input.venueName}`;

  const status = method === "CANCEL" ? "CANCELLED" : "CONFIRMED";

  const description =
    `Party of ${input.partySize}` + (input.guestName ? `\\nGuest: ${input.guestName}` : "");

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
    `LOCATION:${input.venueName}`,
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
