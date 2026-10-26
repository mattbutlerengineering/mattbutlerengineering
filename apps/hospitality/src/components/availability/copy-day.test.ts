import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay, validateConfig } from "@mbe/availability";
import type { DateRule } from "@mbe/types";
import { seedServices } from "./draft-changes.js";
import { buildCopyDayChanges, copyDayDates, singleDateChangeCount } from "./copy-day.js";
import {
  EARLY_DINNER,
  FIXTURE_DATE,
  FIXTURE_TIMEZONE,
  fixtureConfig,
  resolveFixtureDay,
} from "./resolved-day-fixtures.js";

describe("copy a day", () => {
  const config = fixtureConfig(EARLY_DINNER);
  const services = seedServices(config, resolveFixtureDay(EARLY_DINNER), {
    kind: "date",
    date: FIXTURE_DATE,
  });

  it("lists the dates the chosen weekdays reach from the start to the end", () => {
    expect(copyDayDates({ weekdays: [6, 0], from: "2026-10-31", until: "2026-11-08" })).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-07",
      "2026-11-08",
    ]);
  });

  it("counts an open end a year out", () => {
    expect(copyDayDates({ weekdays: [6], from: "2026-10-31", until: null })).toHaveLength(53);
  });

  it("saves one repeating special-hours rule that carries the day's hours to those weekdays", () => {
    const changes = buildCopyDayChanges({
      config,
      services,
      weekdays: [6, 0],
      from: "2026-10-31",
      until: "2026-11-08",
      makeId: () => "copy-1",
    });
    const next = applyChanges(config, changes, "2026-10-25T00:00:00.000Z");
    expect(validateConfig(next)).toEqual([]);
    const at = (date: string) => resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, date);
    // Saturday and Sunday take the Friday's early dinner; the Saturday after the end does not.
    expect(at("2026-10-31").services.at(-1)?.closesAt).toBe(1320);
    expect(at("2026-11-01").services.at(-1)?.closesAt).toBe(1320);
    expect(at("2026-11-14").services).toEqual([]);
    // Friday keeps the regular week's closing.
    expect(at("2026-11-06").services.at(-1)?.closesAt).toBe(1380);
  });
});

describe("the discovery nudge", () => {
  const single = (id: string, date: string): DateRule => ({
    ...EARLY_DINNER,
    id,
    startsOn: date,
    endsOn: date,
  });

  it("counts single-date special hours on one weekday", () => {
    const config = fixtureConfig(
      single("a", "2026-10-02"),
      single("b", "2026-10-09"),
      single("c", "2026-10-16"),
      single("d", "2026-10-17")
    );
    expect(singleDateChangeCount(config, 5)).toBe(3);
    expect(singleDateChangeCount(config, 6)).toBe(1);
  });

  it("does not count ranges, repeats or closures", () => {
    const config = fixtureConfig(
      { ...single("a", "2026-10-02"), endsOn: "2026-10-09" },
      { ...single("b", "2026-10-09"), repeat: { version: 1, weekdays: [5] } },
      {
        id: "c",
        kind: "closure",
        targetKind: "venue",
        startsOn: "2026-10-16",
        endsOn: "2026-10-16",
      }
    );
    expect(singleDateChangeCount(config, 5)).toBe(0);
  });
});
