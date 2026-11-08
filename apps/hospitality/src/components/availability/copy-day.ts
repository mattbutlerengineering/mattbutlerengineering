import { weekdayIndexOf } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";

/** The discovery nudge that suggests making a weekday's one-off changes the regular hours. */

/** How many times the venue changed this weekday for a single date (the nudge fires at three). */
export function singleDateChangeCount(config: AvailabilityConfig, weekday: number): number {
  return config.dateRules.filter(
    (r) =>
      r.kind === "special_hours" &&
      r.targetKind === "venue" &&
      r.endsOn === r.startsOn &&
      r.repeat == null &&
      r.window == null &&
      r.seriesId == null &&
      weekdayIndexOf(r.startsOn) === weekday
  ).length;
}

export const NUDGE_THRESHOLD = 3;
