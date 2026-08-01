/**
 * Pure, client-side RFC 5545 (.ics) calendar file builder for reservation
 * confirmations. No side effects, no global state.
 *
 * Scope note: this builder omits the IANA VTIMEZONE block. Most calendar
 * clients (Google, Apple, Outlook) resolve well-known TZIDs (e.g.
 * "America/New_York") without one; a full VTIMEZONE block is unnecessary
 * for the common case this feature targets.
 */
import type { Reservation, PublicVenueConfig } from "@mbe/types";

const MAX_LINE_OCTETS = 75;
const CRLF = "\r\n";

// TextEncoder/TextDecoder (not Buffer) — this module runs in the browser.
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

export interface BuildReservationIcsOptions {
  /** Guest-facing cancellation/manage-reservation link, included in DESCRIPTION. */
  cancellationUrl?: string;
  /** Clock used for DTSTAMP. Defaults to `new Date()`. Pass explicitly for deterministic output. */
  now?: Date;
  /** Calendar UID. Defaults to `${reservation.id}@mattbutlerengineering.com`. */
  uid?: string;
}

/**
 * Escape RFC 5545 TEXT value special characters: backslash, semicolon,
 * comma, and newlines. Backslash must be escaped first so subsequent
 * escapes are not double-escaped.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** True if `byte` is a UTF-8 continuation byte (10xxxxxx). */
function isContinuationByte(byte: number): boolean {
  return (byte & 0xc0) === 0x80;
}

/**
 * Fold a single logical content line per RFC 5545 §3.1: split into
 * <=75-octet physical lines joined by CRLF + a single leading space,
 * never splitting a multi-byte UTF-8 codepoint across the boundary.
 */
function foldLine(line: string): string {
  const bytes = textEncoder.encode(line);
  if (bytes.length <= MAX_LINE_OCTETS) {
    return line;
  }

  const segments: string[] = [];
  let start = 0;
  let limit = MAX_LINE_OCTETS;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end > start && end < bytes.length && isContinuationByte(bytes[end] as number)) {
      end -= 1;
    }
    segments.push(textDecoder.decode(bytes.subarray(start, end)));
    start = end;
    // Continuation lines carry a 1-octet leading space, so they get 1 fewer content octet.
    limit = MAX_LINE_OCTETS - 1;
  }
  return segments.join(CRLF + " ");
}

function formatIcsUtcTimestamp(date: Date): string {
  const iso = date.toISOString(); // e.g. 2026-01-10T12:00:00.000Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z`;
}

/**
 * Convert a UTC ISO instant to `YYYYMMDDTHHMMSS` in the given IANA
 * timezone's local wall-clock time (no trailing Z — paired with a
 * DTSTART/DTEND `TZID` param).
 */
function formatIcsLocalDateTime(isoInstant: string, timeZone: string): string {
  const date = new Date(isoInstant);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

function buildDescription(reservation: Reservation, cancellationUrl?: string): string {
  const partyLine = `Party of ${reservation.partySize}.`;
  return cancellationUrl ? `${partyLine} Cancel or modify: ${cancellationUrl}` : partyLine;
}

/**
 * Build an RFC 5545 VCALENDAR/VEVENT .ics string for a reservation.
 * Pure function — deterministic for a given `now`/`uid`.
 */
export function buildReservationIcs(
  reservation: Reservation,
  venue: PublicVenueConfig,
  opts: BuildReservationIcsOptions = {}
): string {
  const now = opts.now ?? new Date();
  const uid = opts.uid ?? `${reservation.id}@mattbutlerengineering.com`;
  const tzid = venue.ianaTimezone;

  const properties = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//mattbutlerengineering//hospitality//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${formatIcsUtcTimestamp(now)}`,
    `DTSTART;TZID=${tzid}:${formatIcsLocalDateTime(reservation.startTime, tzid)}`,
    `DTEND;TZID=${tzid}:${formatIcsLocalDateTime(reservation.endTime, tzid)}`,
    `SUMMARY:${escapeIcsText(`${venue.name} Reservation`)}`,
    `DESCRIPTION:${escapeIcsText(buildDescription(reservation, opts.cancellationUrl))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return properties.map(foldLine).join(CRLF);
}
