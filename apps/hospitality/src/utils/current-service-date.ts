import { MINUTES_PER_DAY, addDays, localDateTimeOf, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

/**
 * The service day "tonight" means right now (ADR-029), mirroring the server's
 * `currentServiceDate`: today's civil date when one of its services is open, else yesterday's
 * when its service runs past midnight and is still open, else today's. At 00:30 Friday in a
 * 17:00-02:00 venue it is still Thursday. The calendar date (`venueDate`) is wrong here.
 */
export function currentServiceDate(
  config: AvailabilityConfig,
  timeZone: string,
  now: Date
): string {
  const local = localDateTimeOf(now, timeZone);
  const isOpen = (date: string, minute: number): boolean =>
    resolveDay({ timezone: timeZone, config }, date).services.some(
      (s) => s.opensAt <= minute && minute < s.closesAt
    );
  if (isOpen(local.date, local.minute)) return local.date;
  const yesterday = addDays(local.date, -1);
  return isOpen(yesterday, local.minute + MINUTES_PER_DAY) ? yesterday : local.date;
}
