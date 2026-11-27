import type { OperatingHours } from "@mbe/types";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/**
 * Returns true when a venue has at least one day of operating hours
 * configured (present and not marked closed).
 *
 * Used to distinguish "this venue hasn't set up hours yet" from "hours are
 * set but every slot on the requested date is booked" — both currently
 * surface as an empty slot list, but they need different guidance.
 */
/** `Date#getUTCDay()` order: index 0 is Sunday. */
const DAYS_FROM_SUNDAY = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

/**
 * True when the venue's weekly hours mark the weekday of `date` (a
 * venue-local `YYYY-MM-DD`) closed. A calendar date's weekday is zone-free,
 * so it is read at UTC midnight of the date itself. A day with no schedule
 * entry is not treated as closed: only an explicit `closed: true` is.
 */
export function isWeeklyClosedDay(
  operatingHours: OperatingHours | null | undefined,
  date: string
): boolean {
  if (!operatingHours) return false;
  // A malformed date yields NaN, which indexes to undefined.
  const day = DAYS_FROM_SUNDAY[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return day !== undefined && operatingHours[day]?.closed === true;
}

export function hasOperatingHours(operatingHours: OperatingHours | null | undefined): boolean {
  if (!operatingHours) return false;
  return DAYS.some((day) => {
    const schedule = operatingHours[day];
    return schedule != null && schedule.closed !== true;
  });
}
