import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import {
  buildCompareChanges,
  compareRows,
  compareServiceOptions,
  type CompareRow,
} from "./compare-changes.js";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";

/** Two schedules that both run Dinner: the regular week (Fridays) and Weeknight (Mon-Thu). */
function twoSchedules(): AvailabilityConfig {
  const base = fixtureConfig();
  const dinner = base.scheduleServices.find((s) => s.venueServiceId === "vs-dinner")!;
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      { ...dinner, id: "ss-dinner-wk", scheduleId: "wk", closesAt: 1320, lastSeatingAt: 1260 },
    ],
    assignments: [
      ...base.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
    ],
  };
}

describe("compareRows", () => {
  it("lists one row per schedule that runs the service, with its hours", () => {
    const rows = compareRows(twoSchedules(), "vs-dinner");
    expect(rows.map((r) => [r.scheduleName, r.closesAt])).toEqual([
      ["Weekend", 1380],
      ["Weeknight", 1320],
    ]);
  });

  it("offers only services that more than one schedule runs", () => {
    expect(compareServiceOptions(twoSchedules()).map((o) => o.id)).toEqual(["vs-dinner"]);
  });
});

describe("buildCompareChanges", () => {
  it("writes the rows that changed, in one save", () => {
    const config = twoSchedules();
    const rows: CompareRow[] = compareRows(config, "vs-dinner").map((r) => ({
      ...r,
      closesAt: 1350,
      lastSeatingAt: 1290,
    }));
    const changes = buildCompareChanges(config, rows);
    expect(changes.upsert.scheduleServices?.map((s) => s.id).sort()).toEqual([
      "ss-dinner",
      "ss-dinner-wk",
    ]);
    const next = applyChanges(config, changes, "2026-10-25T00:00:00.000Z");
    const day = resolveDay({ timezone: FIXTURE_TIMEZONE, config: next }, "2026-10-26");
    expect(day.services[0]?.closesAt).toBe(1350);
  });

  it("leaves untouched rows out", () => {
    const config = twoSchedules();
    const rows = compareRows(config, "vs-dinner");
    expect(buildCompareChanges(config, rows).upsert.scheduleServices ?? []).toEqual([]);
    const edited = rows.map((r) => (r.scheduleId === "wk" ? { ...r, opensAt: 1050 } : r));
    expect(buildCompareChanges(config, edited).upsert.scheduleServices?.map((s) => s.id)).toEqual([
      "ss-dinner-wk",
    ]);
  });
});
