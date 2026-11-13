import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig } from "@mbe/types";
import {
  buildCompareChanges,
  compareRows,
  compareServiceOptions,
  reapplyEdits,
  rowsRemovedSince,
  type CompareRow,
} from "./compare-changes.js";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";
import { saveRegularWeek, supersededWeekOf } from "./superseded-fixtures.js";

/** A Friday, the fixture regular week's one open weekday. */
const TODAY = "2026-10-30";

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
    const rows = compareRows(twoSchedules(), "vs-dinner", TODAY);
    expect(rows.map((r) => [r.scheduleName, r.closesAt])).toEqual([
      ["Weekend", 1380],
      ["Weeknight", 1320],
    ]);
  });

  it("offers only services that more than one schedule runs", () => {
    expect(compareServiceOptions(twoSchedules(), TODAY).map((o) => o.id)).toEqual(["vs-dinner"]);
  });
});

describe("Compare services after a regular-week save (#8688)", () => {
  it("has no row for the week the save replaced", () => {
    const config = saveRegularWeek(twoSchedules(), TODAY);
    const old = supersededWeekOf(config);
    const rows = compareRows(config, "vs-dinner", TODAY);
    const regular = config.schedules.find((s) => s.isRegular)!;
    expect(rows.map((r) => r.scheduleId)).not.toContain(old.id);
    // The new regular week and Weeknight, the two schedules the Manager can see.
    expect(rows.map((r) => r.scheduleId)).toEqual(["wk", regular.id]);
  });

  it("does not offer a service only the replaced week shares with the regular week", () => {
    // One schedule: after the save only the new regular week and the hidden one run Dinner.
    expect(compareServiceOptions(saveRegularWeek(fixtureConfig(), TODAY), TODAY)).toEqual([]);
  });

  it("cannot edit the replaced week: an edit to its row is dropped and named as removed", () => {
    const before = twoSchedules();
    const config = saveRegularWeek(before, TODAY);
    const oldRow = config.scheduleServices.find(
      (s) => s.scheduleId === supersededWeekOf(config).id && s.venueServiceId === "vs-dinner"
    )!;
    const edit: CompareRow = {
      scheduleServiceId: oldRow.id,
      scheduleId: oldRow.scheduleId,
      scheduleName: "Weekend",
      opensAt: oldRow.opensAt,
      lastSeatingAt: oldRow.lastSeatingAt,
      closesAt: 1400,
      seating: oldRow.seating,
      bookingTypes: oldRow.bookingTypes,
      different: false,
    };
    expect(reapplyEdits(before, config, [edit], TODAY)).toEqual({});
    expect(rowsRemovedSince(config, [edit], TODAY)).toEqual(["Weekend"]);
  });
});

describe("buildCompareChanges", () => {
  it("writes the rows that changed, in one save", () => {
    const config = twoSchedules();
    const rows: CompareRow[] = compareRows(config, "vs-dinner", TODAY).map((r) => ({
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
    const rows = compareRows(config, "vs-dinner", TODAY);
    expect(buildCompareChanges(config, rows).upsert.scheduleServices ?? []).toEqual([]);
    const edited = rows.map((r) => (r.scheduleId === "wk" ? { ...r, opensAt: 1050 } : r));
    expect(buildCompareChanges(config, edited).upsert.scheduleServices?.map((s) => s.id)).toEqual([
      "ss-dinner-wk",
    ]);
  });
});
