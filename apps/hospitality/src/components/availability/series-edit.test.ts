import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import {
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  WEEKLY_CLOSURE,
  fixtureConfig,
} from "./resolved-day-fixtures.js";
import {
  coversDate,
  dateOverride,
  editSeriesDates,
  isSeries,
  nextOccurrence,
  restoreDate,
  skipDate,
  skipRows,
  skippedDates,
} from "./series-edit.js";

const NEXT_FRIDAY = "2026-11-06";
const NOW = "2026-10-01T00:00:00.000Z";

let counter = 0;
const makeId = () => `new-${++counter}`;

function resolved(config: AvailabilityConfig, date: string) {
  return resolveDay({ timezone: FIXTURE_TIMEZONE, config }, date);
}
const closuresOn = (config: AvailabilityConfig, date: string) => resolved(config, date).closures;

describe("isSeries", () => {
  it("is a repeating closure that is not itself an edit of another series", () => {
    expect(isSeries(WEEKLY_CLOSURE)).toBe(true);
    expect(isSeries({ ...WEEKLY_CLOSURE, repeat: undefined })).toBe(false);
    expect(isSeries({ ...WEEKLY_CLOSURE, seriesId: "other" })).toBe(false);
    expect(isSeries({ ...WEEKLY_CLOSURE, kind: "special_hours" } as DateRule)).toBe(false);
  });
});

describe("skipDate", () => {
  it("returns the slots for that date only, leaving the series on every other date", () => {
    const config = fixtureConfig(WEEKLY_CLOSURE);
    expect(closuresOn(config, FIXTURE_DATE)).toHaveLength(1);

    const after = applyChanges(config, skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId), NOW);

    expect(closuresOn(after, FIXTURE_DATE)).toHaveLength(0);
    expect(closuresOn(after, NEXT_FRIDAY)).toHaveLength(1);
    expect(after.dateRules.find((r) => r.id === WEEKLY_CLOSURE.id)).toEqual(WEEKLY_CLOSURE);
  });

  it("is a skip row pointing at the series, and lists as a skipped date", () => {
    const changes = skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId);
    const [row] = changes.upsert.dateRules ?? [];
    expect(row).toMatchObject({
      kind: "skip",
      seriesId: WEEKLY_CLOSURE.id,
      startsOn: FIXTURE_DATE,
      endsOn: FIXTURE_DATE,
    });
    const after = applyChanges(fixtureConfig(WEEKLY_CLOSURE), changes, NOW);
    expect(skippedDates(after.dateRules, WEEKLY_CLOSURE.id)).toEqual([FIXTURE_DATE]);
  });

  it("shows Skipped from: the series in Why this day", () => {
    const after = applyChanges(
      fixtureConfig(WEEKLY_CLOSURE),
      skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId),
      NOW
    );
    expect(
      resolved(after, FIXTURE_DATE).explanation.some((l) => l.label.startsWith("Skipped from: "))
    ).toBe(true);
  });
});

describe("editSeriesDates", () => {
  const SERIES: DateRule = { ...WEEKLY_CLOSURE, repeat: { version: 1, weekdays: [5] } };

  it("this and following ends the series the day before and starts a new one on that date", () => {
    const config = fixtureConfig(SERIES);
    const changes = editSeriesDates(
      config,
      SERIES,
      "following",
      NEXT_FRIDAY,
      { weekdays: [5], endsOn: "2026-11-20" },
      makeId
    );
    const after = applyChanges(config, changes, NOW);

    expect(after.dateRules.find((r) => r.id === SERIES.id)?.endsOn).toBe("2026-11-05");
    const created = after.dateRules.find((r) => r.id !== SERIES.id);
    expect(created).toMatchObject({ kind: "closure", startsOn: NEXT_FRIDAY, endsOn: "2026-11-20" });
    expect(closuresOn(after, FIXTURE_DATE)).toHaveLength(1);
    expect(closuresOn(after, NEXT_FRIDAY)).toHaveLength(1);
    expect(closuresOn(after, "2026-11-27")).toHaveLength(0);
  });

  it("this and following moves later skips onto the new series", () => {
    const early = skipDate(SERIES, FIXTURE_DATE, makeId).upsert.dateRules![0]!;
    const late = skipDate(SERIES, "2026-11-13", makeId).upsert.dateRules![0]!;
    const config = fixtureConfig(SERIES, early, late);
    const changes = editSeriesDates(
      config,
      SERIES,
      "following",
      NEXT_FRIDAY,
      { weekdays: [5], endsOn: null },
      makeId
    );
    const after = applyChanges(config, changes, NOW);

    const created = after.dateRules.find((r) => r.kind === "closure" && r.id !== SERIES.id)!;
    expect(after.dateRules.find((r) => r.id === late.id)?.seriesId).toBe(created.id);
    expect(after.dateRules.find((r) => r.id === early.id)?.seriesId).toBe(SERIES.id);
    expect(closuresOn(after, "2026-11-13")).toHaveLength(0);
    expect(closuresOn(after, FIXTURE_DATE)).toHaveLength(0);
    expect(closuresOn(after, "2026-11-20")).toHaveLength(1);
  });

  it("this and following from the first date is the same as all dates", () => {
    const config = fixtureConfig(SERIES);
    const changes = editSeriesDates(
      config,
      SERIES,
      "following",
      SERIES.startsOn,
      { weekdays: [5], endsOn: "2026-11-30" },
      makeId
    );
    const after = applyChanges(config, changes, NOW);
    expect(after.dateRules).toHaveLength(1);
    expect(after.dateRules[0]).toMatchObject({ id: SERIES.id, endsOn: "2026-11-30" });
  });

  it("all dates changes the weekdays and end of the one series", () => {
    const config = fixtureConfig(SERIES);
    const changes = editSeriesDates(
      config,
      SERIES,
      "all",
      FIXTURE_DATE,
      { weekdays: [4], endsOn: "2026-12-31" },
      makeId
    );
    const after = applyChanges(config, changes, NOW);
    expect(after.dateRules).toHaveLength(1);
    expect(after.dateRules[0]!.repeat?.weekdays).toEqual([4]);
    expect(closuresOn(after, FIXTURE_DATE)).toHaveLength(0);
    expect(closuresOn(after, "2026-10-29")).toHaveLength(1);
  });
});

describe("nextOccurrence", () => {
  it("is the first covered date on or after the given day", () => {
    expect(coversDate(WEEKLY_CLOSURE, FIXTURE_DATE)).toBe(true);
    expect(coversDate(WEEKLY_CLOSURE, "2026-10-31")).toBe(false);
    expect(nextOccurrence(WEEKLY_CLOSURE, "2026-10-31")).toBe(NEXT_FRIDAY);
    expect(nextOccurrence(WEEKLY_CLOSURE, "2026-09-01")).toBe("2026-10-02");
  });
});

describe("restoreDate", () => {
  it("removes the skip row so the series closes the date again", () => {
    const skip = skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId).upsert.dateRules![0]!;
    const config = { ...fixtureConfig(), dateRules: [WEEKLY_CLOSURE, skip] };
    const changes = restoreDate(skip);
    expect(changes).toEqual({ upsert: {}, remove: { dateRules: [skip.id] } });

    const after = applyChanges(config, changes, NOW);
    expect(skippedDates(after.dateRules, WEEKLY_CLOSURE.id)).toEqual([]);
    expect(closuresOn(after, FIXTURE_DATE)).toHaveLength(1);
  });
});

describe("skipRows", () => {
  it("lists a series' skip rows in date order", () => {
    const a = skipDate(WEEKLY_CLOSURE, NEXT_FRIDAY, makeId).upsert.dateRules![0]!;
    const b = skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId).upsert.dateRules![0]!;
    expect(skipRows([WEEKLY_CLOSURE, a, b], WEEKLY_CLOSURE.id)).toEqual([b, a]);
  });
});

describe("dateOverride", () => {
  it("finds the skip or one-date edit that already replaces the series on a date", () => {
    const skip = skipDate(WEEKLY_CLOSURE, FIXTURE_DATE, makeId).upsert.dateRules![0]!;
    const rules = [WEEKLY_CLOSURE, skip];
    expect(dateOverride(rules, WEEKLY_CLOSURE.id, FIXTURE_DATE)).toBe(skip);
    expect(dateOverride(rules, WEEKLY_CLOSURE.id, NEXT_FRIDAY)).toBeUndefined();
  });
});
