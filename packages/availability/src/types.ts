/**
 * Engine vocabulary — the date and weekday terms every availability rule
 * speaks. Pure data; no I/O.
 *
 * See docs/features/venue-availability/architecture.md and ADR-029 (service day).
 */

/** Venue-local civil date "YYYY-MM-DD". Never an instant. */
export type ServiceDate = string;

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export const MINUTES_PER_DAY = 1440;
