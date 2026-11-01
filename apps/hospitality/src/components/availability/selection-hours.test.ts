import { describe, expect, it } from "vitest";
import { resolveDay } from "@mbe/availability";
import { pickHoursSource } from "./selection-hours.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";

// The fixture's regular week runs Fridays only: every other weekday is closed.
const MONDAY = "2026-11-02";
const NEXT_FRIDAY = "2026-11-06";

function resolver(...rules: Parameters<typeof fixtureConfig>) {
  const config = fixtureConfig(...rules);
  return (date: string) => resolveDay({ timezone: FIXTURE_TIMEZONE, config }, date);
}

describe("pickHoursSource", () => {
  it("takes the first date that has a service, not a closed first date", () => {
    expect(pickHoursSource([MONDAY, FIXTURE_DATE], resolver())).toEqual({
      date: FIXTURE_DATE,
      differs: true,
    });
  });

  it("falls back to the first date when none is open", () => {
    expect(pickHoursSource([MONDAY, "2026-11-03"], resolver())).toEqual({
      date: MONDAY,
      differs: false,
    });
  });

  it("reports differing closing times between two open dates", () => {
    expect(pickHoursSource([FIXTURE_DATE, NEXT_FRIDAY], resolver(EARLY_DINNER))).toEqual({
      date: FIXTURE_DATE,
      differs: true,
    });
  });

  it("reports no difference when every date has the same hours", () => {
    expect(pickHoursSource([FIXTURE_DATE, NEXT_FRIDAY], resolver())).toEqual({
      date: FIXTURE_DATE,
      differs: false,
    });
  });

  it("has no source for an empty pick", () => {
    expect(pickHoursSource([], resolver())).toEqual({ date: null, differs: false });
  });
});
