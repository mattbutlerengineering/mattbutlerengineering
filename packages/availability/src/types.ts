/**
 * Engine vocabulary — the date and weekday terms every availability rule
 * speaks. Pure data; no I/O.
 *
 * See docs/features/venue-availability/architecture.md and ADR-029 (service day).
 */

import type { ScheduleService } from "@mbe/types";

/** Venue-local civil date "YYYY-MM-DD". Never an instant. */
export type ServiceDate = string;

/** A service as the engine resolves it for a day: a stored row, or one from special hours. */
export interface ResolvedService extends Pick<
  ScheduleService,
  "venueServiceId" | "opensAt" | "lastSeatingAt" | "closesAt" | "seating" | "bookingTypes"
> {
  /** `null` for a service from special hours. */
  scheduleServiceId: string | null;
  name: string;
}

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
