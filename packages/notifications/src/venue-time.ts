/**
 * Single owner of venue-local booking time.
 *
 * Reservations carry their start/end as ISO UTC instants (`toReservation`
 * serializes `row.startTime.toISOString()`); every renderer (email, iCal, SMS)
 * needs the venue-local wall clock instead. This module is the only place that
 * conversion happens.
 *
 * A bare "HH:MM" is accepted as an already-local wall time and passed through,
 * so hand-built inputs keep working.
 */

const LOCAL_TIME = /^(\d{2}):(\d{2})$/;

export interface VenueLocalTime {
  /** Venue-local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Venue-local 24h wall time, "HH:MM". */
  time: string;
  /** Guest-facing 12h time, e.g. "7:00 PM". */
  display: string;
  /** Floating iCal local datetime, "YYYYMMDDTHHMMSS". */
  icalLocal: string;
  /** UTC iCal datetime, "YYYYMMDDTHHMMSSZ"; null when input was a bare HH:MM. */
  icalUtc: string | null;
}

function formatDisplay(hour: number, minute: number): string {
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function build(date: string, hour: number, minute: number, icalUtc: string | null): VenueLocalTime {
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return {
    date,
    time: `${hh}:${mm}`,
    display: formatDisplay(hour, minute),
    icalLocal: `${date.replace(/-/g, "")}T${hh}${mm}00`,
    icalUtc,
  };
}

/**
 * Converts a reservation time to venue-local values.
 * @param value ISO UTC instant (or bare "HH:MM" local wall time)
 * @param timezone IANA timezone of the venue
 * @param fallbackDate date to pair with a bare "HH:MM"
 */
export function toVenueLocalTime(
  value: string,
  timezone: string,
  fallbackDate: string
): VenueLocalTime {
  const bare = LOCAL_TIME.exec(value);
  if (bare) return build(fallbackDate, Number(bare[1]), Number(bare[2]), null);

  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`Invalid booking time: ${value}`);
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);
  const part = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const utc = instant
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  return build(date, Number(part("hour")), Number(part("minute")), utc);
}

/**
 * RFC 5545 SEQUENCE derived from the reservation's `updatedAt` (epoch seconds).
 * Every confirm/modify/cancel follows a write that bumps `updatedAt`, so the
 * value increases across the booking's lifetime without a stored counter.
 * Epoch seconds fit a signed 32-bit int until 2038. Two writes inside the same
 * second share a value; that is the accepted resolution of this scheme.
 */
export function calendarSequence(updatedAt: string): number {
  const ms = new Date(updatedAt).getTime();
  if (Number.isNaN(ms)) throw new Error(`Invalid updatedAt: ${updatedAt}`);
  return Math.floor(ms / 1000);
}
