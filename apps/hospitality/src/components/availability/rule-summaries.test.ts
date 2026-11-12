import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import {
  EARLY_DINNER,
  SKIP_WEEKLY,
  TONIGHT_CLOSE,
  VENUE_CLOSURE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";
import { scheduleUsage, upcomingRules } from "./rule-summaries.js";

type Assignment = AvailabilityConfig["assignments"][number];

/** The fixture venue plus a "Summer" schedule assigned (or pointed at by rules) as given. */
function withSummer(
  assignments: readonly Partial<Assignment>[],
  rules: readonly DateRule[] = []
): AvailabilityConfig {
  const base = fixtureConfig(...rules);
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      ...base.scheduleServices.map((s) => ({ ...s, id: `${s.id}-summer`, scheduleId: "summer" })),
    ],
    assignments: [
      ...base.assignments,
      ...assignments.map((a, i) => ({
        id: `as-summer-${i}`,
        scheduleId: "summer",
        weekdays: [1, 2, 3, 4],
        precedence: i + 1,
        ...a,
      })),
    ],
  };
}

function useScheduleOn(id: string, date: string, useScheduleId: string): DateRule {
  return {
    id,
    kind: "use_schedule",
    targetKind: "venue",
    startsOn: date,
    endsOn: date,
    useScheduleId,
  };
}
const useSummerOn = (id: string, date: string) => useScheduleOn(id, date, "summer");

describe("scheduleUsage", () => {
  it("is unused when no assignment and no Use schedule rule points at the schedule (Not used yet)", () => {
    expect(scheduleUsage(withSummer([]), "summer")).toEqual({ kind: "unused" });
  });

  it("counts the Use schedule rules when only rules point at the schedule", () => {
    const config = withSummer(
      [],
      [useSummerOn("u1", "2026-12-24"), useSummerOn("u2", "2026-12-25"), VENUE_CLOSURE]
    );
    expect(scheduleUsage(config, "summer")).toEqual({ kind: "rules", count: 2 });
  });

  it("leaves out Use schedule rules that point at another schedule", () => {
    const other = useScheduleOn("u-other", "2026-12-24", "regular");
    expect(scheduleUsage(withSummer([], [other]), "summer")).toEqual({ kind: "unused" });
  });

  it("gives the weekdays alone for an assignment with no dates", () => {
    expect(scheduleUsage(withSummer([{}]), "summer")).toEqual({
      kind: "periods",
      periods: [{ weekdays: [1, 2, 3, 4], startsOn: null, endsOn: null }],
    });
  });

  it("gives both ends of a range", () => {
    const config = withSummer([
      { startsOn: "2026-06-01", endsOn: "2026-09-15", weekdays: [0, 1, 2, 3, 4, 5, 6] },
    ]);
    expect(scheduleUsage(config, "summer")).toEqual({
      kind: "periods",
      periods: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], startsOn: "2026-06-01", endsOn: "2026-09-15" }],
    });
  });

  it("gives only the start of an open-ended assignment (from)", () => {
    expect(scheduleUsage(withSummer([{ startsOn: "2026-06-01" }]), "summer")).toEqual({
      kind: "periods",
      periods: [{ weekdays: [1, 2, 3, 4], startsOn: "2026-06-01", endsOn: null }],
    });
  });

  it("gives only the end of an assignment with no start (until)", () => {
    expect(scheduleUsage(withSummer([{ endsOn: "2026-09-15" }]), "summer")).toEqual({
      kind: "periods",
      periods: [{ weekdays: [1, 2, 3, 4], startsOn: null, endsOn: "2026-09-15" }],
    });
  });

  it("lists every assignment in config order, and assignments win over rules", () => {
    const config = withSummer(
      [{ startsOn: "2026-06-01", endsOn: "2026-09-15" }, { weekdays: [6] }],
      [useSummerOn("u1", "2026-12-24")]
    );
    expect(scheduleUsage(config, "summer")).toEqual({
      kind: "periods",
      periods: [
        { weekdays: [1, 2, 3, 4], startsOn: "2026-06-01", endsOn: "2026-09-15" },
        { weekdays: [6], startsOn: null, endsOn: null },
      ],
    });
  });

  it("reads only the schedule asked about", () => {
    expect(scheduleUsage(withSummer([{}]), "regular")).toEqual({
      kind: "periods",
      periods: [{ weekdays: [5], startsOn: null, endsOn: null }],
    });
  });
});

describe("upcomingRules", () => {
  const TODAY = "2026-11-07";
  const closure = (id: string, startsOn: string, endsOn: string | null = startsOn): DateRule => ({
    ...VENUE_CLOSURE,
    id,
    startsOn,
    endsOn,
  });
  const ids = (rules: readonly DateRule[]) => rules.map((r) => r.id);

  it("keeps closures and special hours, leaving out every other kind", () => {
    const rules = [
      closure("r-closure", "2026-12-24"),
      { ...EARLY_DINNER, startsOn: "2026-12-25", endsOn: "2026-12-25" },
      { ...SKIP_WEEKLY, startsOn: "2026-12-26", endsOn: "2026-12-26" },
      { ...TONIGHT_CLOSE, startsOn: "2026-12-27", endsOn: "2026-12-27" },
      useSummerOn("r-use", "2026-12-28"),
    ];
    expect(ids(upcomingRules(rules, TODAY))).toEqual(["r-closure", "r-special"]);
  });

  it("leaves out rules that have finished, and keeps one that ends today or never ends", () => {
    const rules = [
      closure("r-past", "2026-10-01", "2026-10-02"),
      closure("r-ends-today", "2026-11-01", TODAY),
      closure("r-open-ended", "2026-01-01", null),
    ];
    expect(ids(upcomingRules(rules, TODAY))).toEqual(["r-open-ended", "r-ends-today"]);
  });

  it("sorts by start date, then by id", () => {
    const rules = [
      closure("r-b", "2026-12-24"),
      closure("r-late", "2026-12-31"),
      closure("r-a", "2026-12-24"),
    ];
    expect(ids(upcomingRules(rules, TODAY))).toEqual(["r-a", "r-b", "r-late"]);
  });

  it("returns a new list and leaves the one it was given in order", () => {
    const rules = [closure("r-2", "2026-12-25"), closure("r-1", "2026-12-24")];
    const upcoming = upcomingRules(rules, TODAY);
    expect(ids(upcoming)).toEqual(["r-1", "r-2"]);
    expect(ids(rules)).toEqual(["r-2", "r-1"]);
  });
});
