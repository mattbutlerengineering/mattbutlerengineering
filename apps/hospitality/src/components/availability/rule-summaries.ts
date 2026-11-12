import type { AvailabilityConfig, DateRule } from "@mbe/types";

/**
 * Where a rule applies, as facts with no text (availability-hub architecture.md, "Shared rule
 * summaries"): the Availability hub's rows, the Seasonal hours list and the Venue Setup tree read
 * the same answer here and word it themselves. Pure: plain data in, plain data out.
 */

/** One assignment of a schedule: its weekdays (0 = Sunday), and the dates it runs between, if any. */
export interface ScheduleUsagePeriod {
  readonly weekdays: readonly number[];
  /** `YYYY-MM-DD`; `null` when the assignment has no start. */
  readonly startsOn: string | null;
  /** `YYYY-MM-DD`; `null` when the assignment has no end. */
  readonly endsOn: string | null;
}

/**
 * Where a schedule applies: the assignments that put it on the week, in config order; failing
 * those, how many Use schedule rules point at it; failing those, nowhere yet.
 */
export type ScheduleUsage =
  | { readonly kind: "unused" }
  | { readonly kind: "rules"; readonly count: number }
  | { readonly kind: "periods"; readonly periods: readonly ScheduleUsagePeriod[] };

export function scheduleUsage(config: AvailabilityConfig, scheduleId: string): ScheduleUsage {
  const uses = config.assignments.filter((a) => a.scheduleId === scheduleId);
  if (uses.length === 0) {
    const count = config.dateRules.filter(
      (r) => r.kind === "use_schedule" && r.useScheduleId === scheduleId
    ).length;
    return count > 0 ? { kind: "rules", count } : { kind: "unused" };
  }
  return {
    kind: "periods",
    periods: uses.map((a) => ({
      weekdays: a.weekdays,
      startsOn: a.startsOn || null,
      endsOn: a.endsOn || null,
    })),
  };
}

/** Closures and special hours that have not finished by `today` (`YYYY-MM-DD`), soonest first. */
export function upcomingRules(rules: readonly DateRule[], today: string): DateRule[] {
  return rules
    .filter((r) => r.kind === "closure" || r.kind === "special_hours")
    .filter((r) => r.endsOn == null || r.endsOn >= today)
    .sort((a, b) =>
      a.startsOn === b.startsOn ? a.id.localeCompare(b.id) : a.startsOn < b.startsOn ? -1 : 1
    );
}
