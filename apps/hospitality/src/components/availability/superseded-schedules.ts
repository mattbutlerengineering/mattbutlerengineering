import type { AvailabilityConfig, Schedule } from "@mbe/types";

/**
 * A regular week that a later one replaced and that nothing reaches any more: it is
 * `kind: "regular"` but no longer the current week (`isRegular` false), no assignment covers a
 * date from `serviceDate` on, and no date rule points at it. It only describes the past, so the
 * Schedules list does not show it. The record stays (History, Undo and past days read it).
 * `serviceDate` is the venue's current service date, not the calendar date: after midnight on an
 * overnight venue the previous night's week is still running.
 */
export function isSupersededRegularWeek(
  config: AvailabilityConfig,
  schedule: Schedule,
  serviceDate: string
): boolean {
  if (schedule.archivedAt || schedule.isRegular || schedule.kind !== "regular") return false;
  return (
    !config.assignments.some(
      (a) => a.scheduleId === schedule.id && (a.endsOn == null || a.endsOn >= serviceDate)
    ) && !config.dateRules.some((r) => r.kind === "use_schedule" && r.useScheduleId === schedule.id)
  );
}

/** The schedules a Manager can see: not archived and not a superseded regular week. */
export function visibleSchedules(config: AvailabilityConfig, serviceDate: string): Schedule[] {
  return config.schedules.filter(
    (s) => !s.archivedAt && !isSupersededRegularWeek(config, s, serviceDate)
  );
}
