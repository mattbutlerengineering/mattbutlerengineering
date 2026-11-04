import type {
  AvailabilityConfig,
  AvailabilityConfigChanges,
  ScheduleAssignment,
  ScheduleService,
} from "@mbe/types";
import { encodeWeek, hoursOn, type ServiceHours } from "./service-days.js";

/**
 * Migrated day-named schedules (ADR-031). Before the migration emitted one regular week, a venue
 * whose weekdays differed was backfilled as a regular schedule plus one alternate schedule per
 * group of weekdays, named "<days> hours" ("Thu–Fri hours"). `collapseDayNamedSchedules` folds
 * those into the regular week so the venue reads as one regular week.
 */

/** Stored stable data, so not localised: Monday-first abbreviations. */
const WEEKDAY_ABBREVIATIONS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * "Thu–Fri", "Sat", "Mon, Wed": a contiguous Monday-first run joins with an en
 * dash (two or more days), gaps are comma-separated. Takes stored indexes (0 = Sunday).
 */
export function weekdayRangeLabel(storedDays: readonly number[]): string {
  const positions = storedDays.map((d) => (d + 6) % 7).sort((a, b) => a - b);
  const runs = positions.reduce<number[][]>((acc, p) => {
    const last = acc[acc.length - 1];
    return last && last[last.length - 1] === p - 1
      ? [...acc.slice(0, -1), [...last, p]]
      : [...acc, [p]];
  }, []);
  return runs
    .map((run) => {
      const first = WEEKDAY_ABBREVIATIONS[run[0]!];
      return run.length === 1 ? first : `${first}–${WEEKDAY_ABBREVIATIONS[run[run.length - 1]!]}`;
    })
    .join(", ");
}

const WEEKDAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

const isUndated = (a: ScheduleAssignment): boolean => a.startsOn == null && a.endsOn == null;

/**
 * The changes that fold collapsible schedules into the regular one, or `null` when none qualifies
 * or folding would change what any weekday resolves to.
 *
 * A schedule is collapsible only when it is live, undated, `kind: "alternate"`, named exactly
 * `weekdayRangeLabel(days) + " hours"` over its assignments' days, and no `use_schedule` rule
 * points at it. A Manager-made schedule with another name stays a schedule. The folded schedules'
 * assignments are removed, the schedules archived, and the regular schedule's rows are replaced
 * by the week the folded days resolve to, over the union of the days either assignment covered.
 *
 * Refusals (`null`): no live regular schedule, or one without a single undated assignment; two
 * undated assignments tying on a weekday; a service twice on one weekday of one schedule; and
 * another live assignment covering a weekday at a precedence the collapse would reorder it past.
 * `newId` names the rows of a service only the folded schedules ran.
 */
export function collapseDayNamedSchedules(
  config: AvailabilityConfig,
  newId: () => string
): AvailabilityConfigChanges | null {
  const live = config.schedules.filter((s) => !s.archivedAt);
  const regular = live.find((s) => s.isRegular);
  if (!regular) return null;

  const regularAssignments = config.assignments.filter((a) => a.scheduleId === regular.id);
  const regularAssignment = regularAssignments[0];
  if (regularAssignments.length !== 1 || !regularAssignment || !isUndated(regularAssignment)) {
    return null;
  }

  const referenced = new Set(
    config.dateRules.flatMap((r) => (r.kind === "use_schedule" ? [r.useScheduleId] : []))
  );
  const folded = live.filter((s) => {
    if (s.isRegular || s.kind !== "alternate" || referenced.has(s.id)) return false;
    const assignments = config.assignments.filter((a) => a.scheduleId === s.id);
    if (assignments.length === 0 || !assignments.every(isUndated)) return false;
    const days = assignments.flatMap((a) => a.weekdays);
    return s.name === `${weekdayRangeLabel(days)} hours`;
  });
  if (folded.length === 0) return null;

  const foldedIds = new Set(folded.map((s) => s.id));
  const foldedAssignments = config.assignments.filter((a) => foldedIds.has(a.scheduleId));
  const participants = [regularAssignment, ...foldedAssignments];
  const liveIds = new Set(live.map((s) => s.id));
  const others = config.assignments.filter(
    (a) => liveIds.has(a.scheduleId) && !participants.includes(a)
  );
  const rowsOf = (scheduleId: string) =>
    config.scheduleServices.filter((r) => r.scheduleId === scheduleId);
  const regularRows = rowsOf(regular.id);

  // Each service's hours per weekday as the venue resolves them today.
  const week = new Map<string, (ServiceHours | null)[]>();
  for (const row of regularRows) {
    week.set(row.venueServiceId, new Array<ServiceHours | null>(7).fill(null));
  }
  for (const day of WEEKDAYS_OF_WEEK) {
    const covering = participants.filter((a) => a.weekdays.includes(day));
    if (covering.length === 0) continue;
    const before = Math.max(...covering.map((a) => a.precedence));
    const winners = covering.filter((a) => a.precedence === before);
    const winner = winners[0];
    if (winners.length !== 1 || !winner) return null;

    // After the collapse the regular assignment covers the day at its own precedence; a third
    // assignment between the two precedences would change sides.
    const after = regularAssignment.precedence;
    if (before !== after) {
      const [low, high] = [Math.min(before, after), Math.max(before, after)];
      const reordered = others.some(
        (a) => a.weekdays.includes(day) && a.precedence >= low && a.precedence <= high
      );
      if (reordered) return null;
    }

    const seen = new Set<string>();
    for (const row of rowsOf(winner.scheduleId)) {
      const hours = hoursOn(row, day);
      if (!hours) continue;
      if (seen.has(row.venueServiceId)) return null;
      seen.add(row.venueServiceId);
      const days = week.get(row.venueServiceId) ?? new Array<ServiceHours | null>(7).fill(null);
      week.set(
        row.venueServiceId,
        days.map((h, d) => (d === day ? hours : h))
      );
    }
  }

  const weekdays = [...new Set(participants.flatMap((a) => a.weekdays))].sort((a, b) => a - b);
  const reusable = new Map<string, string>();
  for (const row of regularRows) {
    if (!reusable.has(row.venueServiceId)) reusable.set(row.venueServiceId, row.id);
  }
  const encoded: ScheduleService[] = encodeWeek(
    [...week].map(([venueServiceId, days]) => ({ venueServiceId, days })),
    weekdays
  ).map((row) => ({
    id: reusable.get(row.venueServiceId) ?? newId(),
    scheduleId: regular.id,
    ...row,
  }));
  const kept = new Set(encoded.map((r) => r.id));

  return {
    upsert: {
      scheduleServices: encoded,
      assignments: [{ ...regularAssignment, weekdays }],
    },
    remove: {
      scheduleServices: regularRows.filter((r) => !kept.has(r.id)).map((r) => r.id),
      assignments: foldedAssignments.map((a) => a.id),
      schedules: folded.map((s) => s.id),
    },
  };
}
