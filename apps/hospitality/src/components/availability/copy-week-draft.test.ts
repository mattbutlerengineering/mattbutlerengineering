import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay, validateConfig, type ResolvedDay } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import {
  buildCopySingleDates,
  copyWeekDraft,
  regularSameWeekdays,
  sameHoursAs,
  splitCopyTargets,
  thisWeekTargets,
} from "./copy-week-draft.js";
import { coveredDays, draftToConfig, effectiveDays } from "./quick-setup-draft.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  PARTY_CLOSURE,
  VENUE_CLOSURE,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

const ids = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe("sameHoursAs", () => {
  const source = resolveFixtureDay();
  const withService = (
    day: ResolvedDay,
    index: number,
    patch: Partial<ResolvedDay["services"][number]>
  ): ResolvedDay => ({
    ...day,
    services: day.services.map((s, i) => (i === index ? { ...s, ...patch } : s)),
  });

  it("is true for the same services, times and last seating", () => {
    expect(sameHoursAs(source, resolveFixtureDay())).toBe(true);
  });

  it("is false when a service's close, open or last seating differs", () => {
    expect(sameHoursAs(source, resolveFixtureDay(EARLY_DINNER))).toBe(false);
    expect(sameHoursAs(source, withService(source, 0, { opensAt: 700 }))).toBe(false);
    expect(sameHoursAs(source, withService(source, 1, { lastSeatingAt: 1200 }))).toBe(false);
  });

  it("is false when a service is missing, and true for two closed days", () => {
    expect(sameHoursAs(source, { ...source, services: source.services.slice(0, 1) })).toBe(false);
    expect(sameHoursAs({ ...source, services: [] }, { ...source, services: [] })).toBe(true);
  });

  it("does not depend on the order the services are listed in", () => {
    expect(sameHoursAs(source, { ...source, services: [...source.services].reverse() })).toBe(true);
  });

  it("ignores seating and booking types, which a copy carries over", () => {
    const other = withService(source, 0, {
      seating: { version: 1, interval: 30 },
      bookingTypes: ["phone"],
    });
    expect(sameHoursAs(source, other)).toBe(true);
  });
});

describe("thisWeekTargets", () => {
  // Tue Nov 10, 2026: the week is Mon Nov 9 to Sun Nov 15.
  it("lists the chosen weekdays within the Monday-to-Sunday week, in date order", () => {
    expect(thisWeekTargets({ date: "2026-11-10", weekdays: [4, 3], today: "2026-11-08" })).toEqual({
      dates: ["2026-11-11", "2026-11-12"],
      past: [],
    });
  });

  it("never includes the copied day's own weekday", () => {
    expect(
      thisWeekTargets({ date: "2026-11-10", weekdays: [2, 3], today: "2026-11-08" }).dates
    ).toEqual(["2026-11-11"]);
  });

  it("skips weekdays that are before today and names them", () => {
    expect(
      thisWeekTargets({ date: "2026-11-12", weekdays: [1, 2, 5], today: "2026-11-11" })
    ).toEqual({
      dates: ["2026-11-13"],
      past: [1, 2],
    });
  });

  it("keeps today itself", () => {
    expect(
      thisWeekTargets({ date: "2026-11-10", weekdays: [3], today: "2026-11-11" }).dates
    ).toEqual(["2026-11-11"]);
  });

  it("treats Sunday as the last day of the week, not the first", () => {
    // Sunday Nov 15 copied to Monday reaches Nov 9, not Nov 16.
    expect(
      thisWeekTargets({ date: "2026-11-15", weekdays: [1], today: "2026-11-01" }).dates
    ).toEqual(["2026-11-09"]);
    expect(
      thisWeekTargets({ date: "2026-11-09", weekdays: [0], today: "2026-11-01" }).dates
    ).toEqual(["2026-11-15"]);
  });
});

describe("buildCopySingleDates", () => {
  const config = fixtureConfig();
  const source = resolveFixtureDay();

  it("writes one single-date special-hours rule per date, with no repeat and no range", () => {
    const changes = buildCopySingleDates({
      config,
      source,
      date: FIXTURE_DATE,
      dates: ["2026-10-31", "2026-11-01"],
      makeId: ids(),
    });
    const rules = changes.upsert.dateRules ?? [];
    expect(rules.map((r) => [r.kind, r.startsOn, r.endsOn])).toEqual([
      ["special_hours", "2026-10-31", "2026-10-31"],
      ["special_hours", "2026-11-01", "2026-11-01"],
    ]);
    expect(rules.every((r) => r.repeat == null && r.seriesId == null)).toBe(true);
    expect(changes.remove).toEqual({});
  });

  it("carries the copied day's hours, so the dates resolve like it", () => {
    const early = fixtureConfig(EARLY_DINNER);
    const changes = buildCopySingleDates({
      config: early,
      source: resolveDay({ timezone: FIXTURE_TIMEZONE, config: early }, FIXTURE_DATE),
      date: FIXTURE_DATE,
      dates: ["2026-10-31"],
      makeId: ids(),
    });
    const next = applyChanges(early, changes, "2026-10-25T00:00:00.000Z");
    expect(validateConfig(next)).toEqual([]);
    const at = resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, "2026-10-31");
    expect(at.services.at(-1)?.closesAt).toBe(1320);
  });

  it("replaces a date's own one-off rule in place: no second rule for that date", () => {
    const own: DateRule = {
      ...EARLY_DINNER,
      id: "own",
      startsOn: "2026-10-31",
      endsOn: "2026-10-31",
    };
    const withOwn = fixtureConfig(own);
    const changes = buildCopySingleDates({
      config: withOwn,
      source,
      date: FIXTURE_DATE,
      dates: ["2026-10-31"],
      makeId: ids(),
    });
    const next = applyChanges(withOwn, changes, "2026-10-25T00:00:00.000Z");
    expect(next.dateRules.filter((r) => r.startsOn === "2026-10-31")).toHaveLength(1);
    expect(next.dateRules.find((r) => r.id === "own")?.kind).toBe("special_hours");
    expect(
      resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, "2026-10-31").services.at(-1)
        ?.closesAt
    ).toBe(1380);
  });
});

describe("regularSameWeekdays", () => {
  const config = fixtureConfig();
  it("names the chosen weekdays whose regular hours already equal the copied day's", () => {
    // The fixture's regular week is Friday only: Friday equals itself, Saturday is closed.
    expect(
      regularSameWeekdays(config, FIXTURE_TIMEZONE, resolveFixtureDay(), [5, 6], FIXTURE_DATE)
    ).toEqual([5]);
    expect(
      regularSameWeekdays(config, FIXTURE_TIMEZONE, resolveFixtureDay(), [6, 0], FIXTURE_DATE)
    ).toEqual([]);
  });
});

describe("regularSameWeekdays against a named schedule", () => {
  // A named schedule with higher precedence runs on Saturday with the same hours as Friday.
  const base = fixtureConfig();
  const config = {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "summer", name: "Summer", kind: "alternate" as const, isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      ...base.scheduleServices.map((r) => ({ ...r, id: `${r.id}-summer`, scheduleId: "summer" })),
    ],
    assignments: [
      ...base.assignments,
      { id: "as-summer", scheduleId: "summer", weekdays: [6], precedence: 5 },
    ],
  };

  it("compares with the regular week only, which is closed on Saturday", () => {
    expect(
      regularSameWeekdays(config, FIXTURE_TIMEZONE, resolveFixtureDay(), [6], FIXTURE_DATE)
    ).toEqual([]);
  });
});

describe("splitCopyTargets", () => {
  const source = resolveFixtureDay();
  const split = (config = fixtureConfig(), dates = ["2026-10-31", "2026-11-01"]) =>
    splitCopyTargets(config, FIXTURE_TIMEZONE, source, dates);

  it("puts dates with other hours under changed", () => {
    expect(split()).toEqual({ changed: ["2026-10-31", "2026-11-01"], same: [], closed: [] });
  });

  it("names dates that already have the hours as same", () => {
    const own: DateRule = {
      ...EARLY_DINNER,
      id: "own",
      startsOn: "2026-11-01",
      endsOn: "2026-11-01",
    };
    const early = fixtureConfig(EARLY_DINNER, own);
    const earlySource = resolveDay({ timezone: FIXTURE_TIMEZONE, config: early }, FIXTURE_DATE);
    const result = splitCopyTargets(early, FIXTURE_TIMEZONE, earlySource, [
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(result.same).toEqual(["2026-11-01"]);
    expect(result.changed).toEqual(["2026-10-31"]);
  });

  it("names a date under a whole-day venue closure as closed, not as changed", () => {
    const shut: DateRule = {
      ...VENUE_CLOSURE,
      id: "shut",
      startsOn: "2026-10-31",
      endsOn: "2026-10-31",
    };
    expect(split(fixtureConfig(shut))).toEqual({
      changed: ["2026-11-01"],
      same: [],
      closed: ["2026-10-31"],
    });
  });

  it("does not call a date closed for a part-day closure or a regular-week day off", () => {
    const party: DateRule = {
      ...PARTY_CLOSURE,
      id: "p",
      startsOn: "2026-10-31",
      endsOn: "2026-10-31",
    };
    expect(split(fixtureConfig(party)).closed).toEqual([]);
    // Sunday is not in the fixture's regular week at all.
    expect(split().closed).toEqual([]);
  });
});

describe("copyWeekDraft", () => {
  const config = fixtureConfig();
  const source = resolveFixtureDay();

  it("gives the chosen weekdays the copied day's services", () => {
    const draft = copyWeekDraft(config, source, FIXTURE_DATE, [6, 0], ids());
    expect(coveredDays(draft).sort()).toEqual([0, 5, 6]);
    for (const service of draft.services) {
      expect([...effectiveDays(draft, service)].sort()).toEqual([0, 5, 6]);
    }
    expect(draft.services.map((s) => s.name)).toEqual(["Lunch", "Dinner"]);
  });

  it("carries a day's own hours as a different-hours block", () => {
    const early = fixtureConfig(EARLY_DINNER);
    const day = resolveDay({ timezone: FIXTURE_TIMEZONE, config: early }, FIXTURE_DATE);
    const draft = copyWeekDraft(early, day, FIXTURE_DATE, [6], ids());
    const dinner = draft.services.find((s) => s.name === "Dinner");
    // Friday keeps the regular 11 PM close; Saturday takes the copied day's 10 PM.
    expect(dinner?.closes).toBe("23:00");
    expect(dinner?.blocks.map((b) => [b.days, b.closes])).toEqual([[[6], "22:00"]]);
  });

  it("takes a service away from a weekday the copied day does not run it on", () => {
    const lunchless: ResolvedDay = { ...source, services: source.services.slice(1) };
    const draft = copyWeekDraft(config, lunchless, FIXTURE_DATE, [5], ids());
    const lunch = draft.services.find((s) => s.name === "Lunch");
    expect(lunch).toBeUndefined();
  });

  it("round-trips through draftToConfig to the same week", () => {
    const draft = copyWeekDraft(config, source, FIXTURE_DATE, [6], ids());
    const next = draftToConfig(draft, ids(), { regularScheduleId: "regular" });
    const at = (date: string) => resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, date);
    expect(at("2026-10-31").services.map((s) => [s.opensAt, s.closesAt])).toEqual(
      source.services.map((s) => [s.opensAt, s.closesAt])
    );
    expect(at("2026-10-30").services).toHaveLength(2);
    expect(at("2026-11-02").services).toEqual([]);
  });
});
