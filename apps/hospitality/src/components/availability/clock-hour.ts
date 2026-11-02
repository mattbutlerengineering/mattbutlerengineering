import { MINUTES_PER_DAY } from "@mbe/availability";
import type { VenueFormat } from "../../hooks/useVenueFormat.js";

/**
 * The hour on a 12-hour clock (1 to 12) of a service-day minute; past midnight wraps. A catalog
 * sentence that puts a time after a preposition takes it as `count`, so a locale can inflect by
 * hour with a plural: Spanish says "a la 1:00" but "a las 2:00" (docs/features/localization).
 */
export function clockHour(minute: number): number {
  return Math.floor((minute % MINUTES_PER_DAY) / 60) % 12 || 12;
}

/** The same for an instant, read on the venue's clock (never the machine's). */
export function clockHourOfInstant(at: string | number | Date, format: VenueFormat): number {
  const hour = Number.parseInt(format.formatInstant(at, { hour: "numeric", hourCycle: "h23" }), 10);
  return hour % 12 || 12;
}
