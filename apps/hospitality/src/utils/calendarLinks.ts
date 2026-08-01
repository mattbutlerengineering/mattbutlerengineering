/**
 * Pure, client-side deep-link URL builders for "add to calendar" flows
 * (Google Calendar, Outlook web). No file generation, no network calls.
 */
import type { Reservation, PublicVenueConfig } from "@mbe/types";
import { formatIcsLocalDateTime } from "./ics.js";

export interface BuildCalendarLinkOptions {
  /** Guest-facing cancellation/manage-reservation link, included in the event description. */
  cancellationUrl?: string;
}

function buildEventTitle(venue: PublicVenueConfig): string {
  return `${venue.name} Reservation`;
}

function buildEventDescription(reservation: Reservation, cancellationUrl?: string): string {
  const partyLine = `Party of ${reservation.partySize}.`;
  return cancellationUrl ? `${partyLine} Cancel or modify: ${cancellationUrl}` : partyLine;
}

/**
 * Build a Google Calendar "add event" deep-link. `dates` uses Google's
 * venue-local wall-clock form (`YYYYMMDDTHHmmSS/YYYYMMDDTHHmmSS`, reusing
 * ics.ts's local-time formatter) paired with `ctz` so the event renders at
 * the correct time regardless of the guest's browser timezone.
 */
export function buildGoogleCalendarUrl(
  reservation: Reservation,
  venue: PublicVenueConfig,
  opts: BuildCalendarLinkOptions = {}
): string {
  const start = formatIcsLocalDateTime(reservation.startTime, venue.ianaTimezone);
  const end = formatIcsLocalDateTime(reservation.endTime, venue.ianaTimezone);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: buildEventTitle(venue),
    dates: `${start}/${end}`,
    details: buildEventDescription(reservation, opts.cancellationUrl),
    location: venue.name,
    ctz: venue.ianaTimezone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Zero-pad a non-negative integer to 2 digits. */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Format a UTC offset in minutes (east-positive) as ISO 8601 `±HH:MM`.
 */
function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/**
 * Format a UTC ISO instant as an ISO 8601 timestamp with an explicit UTC
 * offset (`YYYY-MM-DDTHH:mm:ss±HH:MM`) reflecting `timeZone`'s local
 * wall-clock time at that instant. Derives the offset by re-interpreting the
 * venue-local wall-clock digits (from ics.ts's formatter) as a UTC instant
 * and diffing against the real instant — no timezone library needed.
 */
function formatIsoWithOffset(isoInstant: string, timeZone: string): string {
  const local = formatIcsLocalDateTime(isoInstant, timeZone); // YYYYMMDDTHHMMSS
  const year = local.slice(0, 4);
  const month = local.slice(4, 6);
  const day = local.slice(6, 8);
  const hour = local.slice(9, 11);
  const minute = local.slice(11, 13);
  const second = local.slice(13, 15);
  const localAsUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  const offsetMinutes = Math.round((localAsUtcMs - new Date(isoInstant).getTime()) / 60_000);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${formatUtcOffset(offsetMinutes)}`;
}

/**
 * Build an Outlook web "compose event" deep-link. `startdt`/`enddt` use full
 * ISO 8601 with an explicit UTC offset so the event renders at the correct
 * local time regardless of the guest's browser timezone.
 */
export function buildOutlookCalendarUrl(
  reservation: Reservation,
  venue: PublicVenueConfig,
  opts: BuildCalendarLinkOptions = {}
): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: buildEventTitle(venue),
    startdt: formatIsoWithOffset(reservation.startTime, venue.ianaTimezone),
    enddt: formatIsoWithOffset(reservation.endTime, venue.ianaTimezone),
    body: buildEventDescription(reservation, opts.cancellationUrl),
    location: venue.name,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
