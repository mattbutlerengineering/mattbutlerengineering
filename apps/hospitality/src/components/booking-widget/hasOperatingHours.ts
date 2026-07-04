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
export function hasOperatingHours(operatingHours: OperatingHours | null | undefined): boolean {
  if (!operatingHours) return false;
  return DAYS.some((day) => {
    const schedule = operatingHours[day];
    return schedule != null && schedule.closed !== true;
  });
}
