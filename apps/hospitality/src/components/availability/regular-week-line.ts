import { decodeWeek, encodeWeek } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import { WEEK_DISPLAY_ORDER } from "./quick-setup-draft.js";

/**
 * The calendar's regular-week line (`ux.md` F-CAL), read from the saved rows through `decodeWeek`
 * and re-encoded, so a service's base hours and its different-hours sets come out the same way
 * the editors read them. Pure, no React. Weekdays are stored indexes (0 = Sunday), Monday first.
 */

export type HoursChangeKind = "later" | "earlier" | "different";

export interface HoursChange {
  readonly weekdays: readonly number[];
  readonly kind: HoursChangeKind;
}

export interface RegularWeekLineService {
  readonly venueServiceId: string;
  readonly name: string;
  /** Every weekday the service runs, Monday first. */
  readonly days: readonly number[];
  /** Where its hours differ from its base hours, in the order the engine stores the sets. */
  readonly changes: readonly HoursChange[];
}

export interface RegularWeekLine {
  readonly services: readonly RegularWeekLineService[];
  /** Every service runs the same days with the same hours: no Details disclosure. */
  readonly uniform: boolean;
}

const NONE: RegularWeekLine = { services: [], uniform: true };

/** A set's closing against the base's decides later or earlier; the same close with other hours is "different". */
function kindOf(base: { closesAt: number }, set: { closesAt: number }): HoursChangeKind {
  if (set.closesAt > base.closesAt) return "later";
  return set.closesAt < base.closesAt ? "earlier" : "different";
}

/**
 * The regular schedule in force on `today` (a service date): a dated Change regular week leaves the
 * old week running until its date, and Details (`regularWeekView`) already reads that one. With no
 * regular assignment in force today (a week that starts later, nothing yet) it is the one marked regular.
 */
function inForce(config: AvailabilityConfig, today: string) {
  const live = config.schedules.filter((s) => s.kind === "regular" && !s.archivedAt);
  const running = config.assignments
    .filter(
      (a) =>
        live.some((s) => s.id === a.scheduleId) &&
        (a.startsOn == null || a.startsOn <= today) &&
        (a.endsOn == null || a.endsOn >= today)
    )
    .sort((a, b) => b.precedence - a.precedence)[0];
  return (
    live.find((s) => s.id === running?.scheduleId) ??
    config.schedules.find((s) => s.isRegular && !s.archivedAt)
  );
}

export function regularWeekLine(config: AvailabilityConfig, today: string): RegularWeekLine {
  const schedule = inForce(config, today);
  if (!schedule) return NONE;
  const covered = [
    ...new Set(
      config.assignments.filter((a) => a.scheduleId === schedule.id).flatMap((a) => a.weekdays)
    ),
  ];
  const rows = config.scheduleServices.filter((r) => r.scheduleId === schedule.id);
  const names = new Map(config.venueServices.map((vs) => [vs.id, vs.name]));
  const canonical = encodeWeek(decodeWeek(rows, covered), covered);

  const services = canonical.flatMap((row): RegularWeekLineService[] => {
    const week = decodeWeek([row], covered)[0];
    const name = names.get(row.venueServiceId);
    if (!week || name === undefined) return [];
    return [
      {
        venueServiceId: row.venueServiceId,
        name,
        days: WEEK_DISPLAY_ORDER.filter((day) => week.days[day] !== null),
        changes: row.dayHours.sets.map((set) => ({
          weekdays: WEEK_DISPLAY_ORDER.filter((day) => set.weekdays.includes(day)),
          kind: kindOf(row, set),
        })),
      },
    ];
  });
  const first = services[0]?.days.join();
  const uniform = services.every((s) => s.changes.length === 0 && s.days.join() === first);
  return { services, uniform };
}
