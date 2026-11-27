import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule, Schedule, ScheduleAssignment } from "@mbe/types";
import { WEEK_CHANGES_DAYS, weekChanges } from "./week-changes.js";

// 2026-12-07 is a Monday; the window runs Mon 12-07 .. Sun 12-13.
const FROM = "2026-12-07";

function rule(id: string, fields: Partial<DateRule> = {}): DateRule {
  return {
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: "2026-12-09",
    endsOn: "2026-12-09",
    window: null,
    ...fields,
  } as DateRule;
}

function schedule(id: string, fields: Partial<Schedule> = {}): Schedule {
  return { id, name: id, kind: "alternate", isRegular: false, archivedAt: null, ...fields };
}

function assignment(
  id: string,
  scheduleId: string,
  fields: Partial<ScheduleAssignment> = {}
): ScheduleAssignment {
  return {
    id,
    scheduleId,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startsOn: null,
    endsOn: null,
    precedence: 1,
    ...fields,
  };
}

function config(fields: Partial<AvailabilityConfig> = {}): AvailabilityConfig {
  return {
    schedules: [schedule("regular", { kind: "regular", isRegular: true })],
    venueServices: [],
    scheduleServices: [],
    assignments: [assignment("a-regular", "regular")],
    dateRules: [],
    ...fields,
  };
}

const rulesOnly = (dateRules: DateRule[]) => weekChanges(config({ dateRules }), FROM);

describe("weekChanges", () => {
  it("is a seven-day window by default", () => {
    expect(WEEK_CHANGES_DAYS).toBe(7);
  });

  it("returns nothing for a week with no changes", () => {
    expect(weekChanges(config(), FROM)).toEqual([]);
  });

  describe("date rules", () => {
    it("lists a one-day closure and its reopening the next day", () => {
      expect(rulesOnly([rule("c1")])).toEqual([
        { kind: "closure", ruleId: "c1", dates: ["2026-12-09"] },
        { kind: "reopen", ruleId: "c1", date: "2026-12-10" },
      ]);
    });

    it("lists a multi-day closure as one row with only its in-window dates", () => {
      const long = rule("c1", { startsOn: "2026-12-11", endsOn: "2026-12-20" });
      expect(rulesOnly([long])).toEqual([
        {
          kind: "closure",
          ruleId: "c1",
          dates: ["2026-12-11", "2026-12-12", "2026-12-13"],
        },
      ]);
    });

    it("lists special hours grouped by rule", () => {
      const special = rule("s1", {
        kind: "special_hours",
        startsOn: "2026-12-08",
        endsOn: "2026-12-09",
        payload: { version: 1, services: [] },
      } as Partial<DateRule>);
      expect(rulesOnly([special])).toEqual([
        { kind: "specialHours", ruleId: "s1", dates: ["2026-12-08", "2026-12-09"] },
      ]);
    });

    it("gives no row to a rule already in force the day before the window", () => {
      const ongoing = rule("c1", { startsOn: "2026-12-01", endsOn: "2026-12-20" });
      const special = rule("s1", {
        kind: "special_hours",
        startsOn: "2026-12-06",
        endsOn: "2026-12-08",
        payload: { version: 1, services: [] },
      } as Partial<DateRule>);
      expect(rulesOnly([ongoing, special])).toEqual([]);
    });

    it("yields only a reopen for an ongoing closure that ends inside the window", () => {
      const ongoing = rule("c1", { startsOn: "2026-12-01", endsOn: "2026-12-10" });
      expect(rulesOnly([ongoing])).toEqual([{ kind: "reopen", ruleId: "c1", date: "2026-12-11" }]);
    });

    it("puts the reopen on the first open day when another venue closure follows", () => {
      const first = rule("c1", { startsOn: "2026-12-01", endsOn: "2026-12-08" });
      const next = rule("c2", { startsOn: "2026-12-09", endsOn: "2026-12-09" });
      expect(rulesOnly([first, next])).toEqual([
        { kind: "closure", ruleId: "c2", dates: ["2026-12-09"] },
        { kind: "reopen", ruleId: "c1", date: "2026-12-10" },
        { kind: "reopen", ruleId: "c2", date: "2026-12-10" },
      ]);
    });

    it("gives no reopen to an open-ended closure or one reopening after the window", () => {
      const openEnded = rule("c1", { startsOn: "2026-12-12", endsOn: null });
      const lastDay = rule("c2", { startsOn: "2026-12-13", endsOn: "2026-12-13" });
      expect(rulesOnly([openEnded, lastDay])).toEqual([
        { kind: "closure", ruleId: "c1", dates: ["2026-12-12", "2026-12-13"] },
        { kind: "closure", ruleId: "c2", dates: ["2026-12-13"] },
      ]);
    });

    it("drops tonight and skip rules", () => {
      const tonight = rule("t1", {
        kind: "tonight",
        startsOn: "2026-12-08",
        payload: { version: 1, closeAt: 1200 },
      } as Partial<DateRule>);
      const skip = rule("k1", { kind: "skip", startsOn: "2026-12-08", seriesId: "nothing" });
      expect(rulesOnly([tonight, skip])).toEqual([]);
    });

    it("lists a use_schedule rule as a seasonal start via the rule", () => {
      const use = rule("u1", {
        kind: "use_schedule",
        useScheduleId: "patio",
        startsOn: "2026-12-10",
        endsOn: "2026-12-20",
      } as Partial<DateRule>);
      const cfg = config({ schedules: [schedule("patio")], dateRules: [use] });
      expect(weekChanges(cfg, FROM)).toEqual([
        {
          kind: "seasonalStarts",
          scheduleId: "patio",
          date: "2026-12-10",
          via: "rule",
          ruleId: "u1",
        },
      ]);
    });
  });

  describe("repeating rules", () => {
    const mondays: DateRule["repeat"] = { version: 1, weekdays: [1] };

    it("appears in the week of its first-ever occurrence", () => {
      // Starts Sunday 12-06 but first covers Monday 12-07.
      const series = rule("r1", { startsOn: "2026-12-06", endsOn: "2027-03-31", repeat: mondays });
      expect(rulesOnly([series])).toEqual([
        { kind: "closure", ruleId: "r1", dates: ["2026-12-07"] },
      ]);
    });

    it("does not appear in later weeks", () => {
      const series = rule("r1", { startsOn: "2026-11-30", endsOn: "2027-03-31", repeat: mondays });
      expect(rulesOnly([series])).toEqual([]);
    });

    it("respects a skip of its first occurrence", () => {
      const series = rule("r1", {
        startsOn: "2026-12-07",
        endsOn: "2027-03-31",
        repeat: { version: 1, weekdays: [1, 3] },
      });
      const skip = rule("k1", { kind: "skip", startsOn: "2026-12-07", seriesId: "r1" });
      expect(rulesOnly([series, skip])).toEqual([
        { kind: "closure", ruleId: "r1", dates: ["2026-12-09"] },
      ]);
    });

    it("lists a one-date edit as its own row in place of the series", () => {
      const series = rule("r1", { startsOn: "2026-11-30", endsOn: "2027-03-31", repeat: mondays });
      const edit = rule("e1", {
        kind: "special_hours",
        startsOn: "2026-12-07",
        endsOn: "2026-12-07",
        seriesId: "r1",
        payload: { version: 1, services: [] },
      } as Partial<DateRule>);
      expect(rulesOnly([series, edit])).toEqual([
        { kind: "specialHours", ruleId: "e1", dates: ["2026-12-07"] },
      ]);
    });

    it("gets no reopen when its range ends", () => {
      const series = rule("r1", { startsOn: "2026-12-07", endsOn: "2026-12-07", repeat: mondays });
      expect(rulesOnly([series])).toEqual([
        { kind: "closure", ruleId: "r1", dates: ["2026-12-07"] },
      ]);
    });
  });

  describe("schedule assignments", () => {
    it("lists a dated regular schedule as regular hours", () => {
      const cfg = config({
        assignments: [assignment("a-regular", "regular", { startsOn: "2026-12-10" })],
      });
      expect(weekChanges(cfg, FROM)).toEqual([
        { kind: "regularHours", scheduleId: "regular", date: "2026-12-10" },
      ]);
    });

    it("lists an alternate or holiday schedule's start and end", () => {
      const cfg = config({
        schedules: [schedule("winter"), schedule("xmas", { kind: "holiday" })],
        assignments: [
          assignment("a1", "winter", { startsOn: "2026-12-08", endsOn: "2026-12-10" }),
          assignment("a2", "xmas", { startsOn: "2026-11-01", endsOn: "2026-12-12" }),
        ],
      });
      expect(weekChanges(cfg, FROM)).toEqual([
        { kind: "seasonalStarts", scheduleId: "winter", date: "2026-12-08", via: "assignment" },
        { kind: "seasonalEnds", scheduleId: "winter", date: "2026-12-11" },
        { kind: "seasonalEnds", scheduleId: "xmas", date: "2026-12-13" },
      ]);
    });

    it("ignores archived schedules, missing schedules and starts outside the window", () => {
      const cfg = config({
        schedules: [schedule("old", { archivedAt: "2026-11-01" }), schedule("later")],
        assignments: [
          assignment("a1", "old", { startsOn: "2026-12-08", endsOn: "2026-12-09" }),
          assignment("a2", "gone", { startsOn: "2026-12-08" }),
          assignment("a3", "later", { startsOn: "2026-12-14", endsOn: "2026-12-30" }),
          assignment("a4", "later", { startsOn: "2026-12-06" }),
        ],
      });
      expect(weekChanges(cfg, FROM)).toEqual([]);
    });
  });

  describe("window and order", () => {
    it("includes day 7 and excludes day 8", () => {
      const day7 = rule("c7", { startsOn: "2026-12-13", endsOn: "2026-12-13" });
      const day8 = rule("c8", { startsOn: "2026-12-14", endsOn: "2026-12-14" });
      expect(rulesOnly([day7, day8])).toEqual([
        { kind: "closure", ruleId: "c7", dates: ["2026-12-13"] },
      ]);
    });

    it("honours a custom window length", () => {
      const day3 = rule("c3", { startsOn: "2026-12-09", endsOn: "2026-12-20" });
      expect(weekChanges(config({ dateRules: [day3] }), FROM, 2)).toEqual([]);
    });

    it("sorts by first date, then by a fixed kind rank", () => {
      const cfg = config({
        schedules: [schedule("winter")],
        assignments: [assignment("a1", "winter", { startsOn: "2026-12-08" })],
        dateRules: [
          rule("s1", {
            kind: "special_hours",
            startsOn: "2026-12-08",
            endsOn: "2026-12-08",
            payload: { version: 1, services: [] },
          } as Partial<DateRule>),
          rule("c1", { startsOn: "2026-12-08", endsOn: "2026-12-08" }),
          rule("c0", { startsOn: "2026-12-07", endsOn: "2026-12-07" }),
        ],
      });
      expect(weekChanges(cfg, FROM).map((c) => c.kind)).toEqual([
        "closure",
        "closure",
        "specialHours",
        "seasonalStarts",
        "reopen",
        "reopen",
      ]);
    });

    it("does not mutate its input", () => {
      const cfg = config({ dateRules: [rule("c1")] });
      const before = structuredClone(cfg);
      weekChanges(cfg, FROM);
      expect(cfg).toEqual(before);
    });
  });
});
