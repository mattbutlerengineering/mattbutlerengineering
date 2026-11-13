import type { AvailabilityConfig, Schedule } from "@mbe/types";

/**
 * A regular week that a later one replaced and that nothing reaches any more: it is
 * `kind: "regular"` but no longer the current week (`isRegular` false), and no assignment and no
 * `use_schedule` date rule covers a date from `serviceDate` on. It only describes the past, so no
 * schedule list, picker or count shows it. The record stays (History, Undo and past days read it).
 * `serviceDate` is the venue's current service date, not the calendar date: after midnight on an
 * overnight venue the previous night's week is still running.
 */
export function isSupersededRegularWeek(
  config: AvailabilityConfig,
  schedule: Schedule,
  serviceDate: string
): boolean {
  if (schedule.archivedAt || schedule.isRegular || schedule.kind !== "regular") return false;
  // An open end (`null`) runs on with no last day, so it always reaches the service date.
  const reaches = (endsOn: string | null | undefined) => endsOn == null || endsOn >= serviceDate;
  return (
    !config.assignments.some((a) => a.scheduleId === schedule.id && reaches(a.endsOn)) &&
    !config.dateRules.some(
      (r) => r.kind === "use_schedule" && r.useScheduleId === schedule.id && reaches(r.endsOn)
    )
  );
}

/**
 * The schedules a Manager can see: not archived and not a superseded regular week. Every schedule
 * list, picker and count goes through this one helper (#8688).
 */
export function visibleSchedules(config: AvailabilityConfig, serviceDate: string): Schedule[] {
  return config.schedules.filter(
    (s) => !s.archivedAt && !isSupersededRegularWeek(config, s, serviceDate)
  );
}
