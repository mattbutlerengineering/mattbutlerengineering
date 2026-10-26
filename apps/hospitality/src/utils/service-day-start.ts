import { MINUTES_PER_DAY, addDays, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { venueWallTimeToInstant } from "./venue-wall-time.js";

/**
 * The civil date a staff-picked `HH:MM` falls on for service day `serviceDate` (ADR-029). A time
 * the day's own services are open at stays on `serviceDate`; a time only a past-midnight service
 * reaches (00:30 of a 17:00-02:00 service) is on the next calendar date. With no config or an
 * unplaceable time it stays on `serviceDate`, and the server remains the guard.
 */
export function serviceDayCalendarDate(
  config: AvailabilityConfig | null | undefined,
  timeZone: string,
  serviceDate: string,
  hhmm: string
): string {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!config || !match) return serviceDate;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  // The planned day (closures and Tonight changes stripped), as the engine's `judge` owns it.
  const planned: AvailabilityConfig = {
    ...config,
    dateRules: config.dateRules.filter((r) => r.kind !== "closure" && r.kind !== "tonight"),
  };
  const { services } = resolveDay({ timezone: timeZone, config: planned }, serviceDate);
  const isOpen = (at: number): boolean => services.some((s) => s.opensAt <= at && at < s.closesAt);
  return !isOpen(minute) && isOpen(minute + MINUTES_PER_DAY)
    ? addDays(serviceDate, 1)
    : serviceDate;
}

/** The instant a staff-picked `HH:MM` on service day `serviceDate` starts, on the venue clock. */
export function serviceDayStartInstant(
  config: AvailabilityConfig | null | undefined,
  timeZone: string,
  serviceDate: string,
  hhmm: string
): Date {
  const calendarDate = serviceDayCalendarDate(config, timeZone, serviceDate, hhmm);
  return venueWallTimeToInstant(calendarDate, hhmm, timeZone);
}
