import { describe, it, expect } from "vitest";
import type { DateRule } from "@mbe/types";
import { ownChangeDates, scopeDates } from "./scope-dates.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

const TODAY = "2026-10-28";

function dates(scope: Parameters<typeof scopeDates>[0]) {
  return scopeDates(scope, { config: fixtureConfig(), timezone: FIXTURE_TIMEZONE, today: TODAY });
}

describe("scopeDates", () => {
  it("this date only is one date", () => {
    expect(dates({ kind: "date", date: FIXTURE_DATE })).toEqual([FIXTURE_DATE]);
  });

  it("selected dates are exactly those dates", () => {
    expect(dates({ kind: "dates", dates: ["2026-10-30", "2026-11-02"] })).toEqual([
      "2026-10-30",
      "2026-11-02",
    ]);
  });

  it("every Friday from a date runs weekly up to the end date, inclusive", () => {
    const fridays = dates({ kind: "weekday", from: FIXTURE_DATE, until: "2026-12-25" });
    expect(fridays).toHaveLength(9);
    expect(fridays[0]).toBe("2026-10-30");
    expect(fridays.at(-1)).toBe("2026-12-25");
  });

  it("an open-ended weekday scope stops at the server's 366-day horizon", () => {
    const fridays = dates({ kind: "weekday", from: FIXTURE_DATE, until: null });
    expect(fridays).toHaveLength(53);
  });

  it("everywhere a schedule is used lists the future dates that schedule runs", () => {
    const run = dates({ kind: "schedule", scheduleId: "regular" });
    expect(run[0]).toBe("2026-10-30");
    expect(run).toHaveLength(52);
  });

  it("a schedule that runs nowhere has no dates", () => {
    expect(dates({ kind: "schedule", scheduleId: "unused" })).toEqual([]);
  });
});

describe("ownChangeDates", () => {
  const SERIES_SKIP: DateRule = {
    id: "skip-1",
    kind: "skip",
    targetKind: "venue",
    startsOn: FIXTURE_DATE,
    endsOn: FIXTURE_DATE,
    seriesId: EARLY_DINNER.id,
  };

  it("lists dates in scope that already have their own hours change", () => {
    const config = fixtureConfig(EARLY_DINNER);
    expect(ownChangeDates(config, [FIXTURE_DATE, "2026-11-06"], null)).toEqual([FIXTURE_DATE]);
  });

  it("does not count the rule being edited", () => {
    const config = fixtureConfig(EARLY_DINNER);
    expect(ownChangeDates(config, [FIXTURE_DATE], EARLY_DINNER.id)).toEqual([]);
  });

  it("does not count a date a skip row already excluded from the rule", () => {
    const config = fixtureConfig(EARLY_DINNER, SERIES_SKIP);
    expect(ownChangeDates(config, [FIXTURE_DATE], null)).toEqual([]);
  });

  it("counts repeating rules only on the weekdays they repeat", () => {
    const fridays: DateRule = {
      ...EARLY_DINNER,
      id: "r-fridays",
      startsOn: "2026-10-01",
      endsOn: null,
      repeat: { version: 1, weekdays: [5] },
    };
    const config = fixtureConfig(fridays);
    expect(ownChangeDates(config, ["2026-11-06", "2026-11-07"], null)).toEqual(["2026-11-06"]);
  });

  it("ignores closures: only hours changes are conflicts", () => {
    const closure: DateRule = { ...SERIES_SKIP, id: "c", kind: "closure", seriesId: undefined };
    expect(ownChangeDates(fixtureConfig(closure), [FIXTURE_DATE], null)).toEqual([]);
  });
});
