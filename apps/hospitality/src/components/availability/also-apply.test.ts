import { describe, expect, it } from "vitest";
import { applyChanges } from "@mbe/availability";
import type { AvailabilityConfig, AvailabilityConfigChanges } from "@mbe/types";
import {
  alsoApplyChangedSince,
  alsoApplyOptions,
  alsoApplyScheduleIds,
  buildAlsoApplyChanges,
  pruneAlsoApply,
} from "./also-apply.js";
import { fixtureConfig } from "./resolved-day-fixtures.js";
import { saveRegularWeek, supersededWeekOf } from "./superseded-fixtures.js";

/** A Friday, the fixture regular week's one open weekday. */
const TODAY = "2026-10-30";

/** The regular week ("Weekend", Fridays) plus Weeknight (Mon-Thu) and Summer (Sat-Sun), both with Dinner. */
function threeSchedules(): AvailabilityConfig {
  const base = fixtureConfig();
  const dinner = base.scheduleServices.find((s) => s.venueServiceId === "vs-dinner")!;
  const lunch = base.scheduleServices.find((s) => s.venueServiceId === "vs-lunch")!;
  return {
    ...base,
    schedules: [
      ...base.schedules,
      { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      { id: "su", name: "Summer", kind: "alternate", isRegular: false },
    ],
    scheduleServices: [
      ...base.scheduleServices,
      { ...dinner, id: "ss-dinner-wk", scheduleId: "wk", closesAt: 1320, lastSeatingAt: 1260 },
      { ...dinner, id: "ss-dinner-su", scheduleId: "su", closesAt: 1400, lastSeatingAt: 1300 },
      { ...lunch, id: "ss-lunch-su", scheduleId: "su", weekdays: [] },
    ],
    assignments: [
      ...base.assignments,
      { id: "as-wk", scheduleId: "wk", weekdays: [1, 2, 3, 4], precedence: 1 },
      { id: "as-su", scheduleId: "su", weekdays: [6, 0], precedence: 1 },
    ],
  };
}

/** What the editor saves for "regular" when Dinner closes at 11:30 PM. */
function dinnerEdit(config: AvailabilityConfig, closesAt = 1410): AvailabilityConfigChanges {
  const row = config.scheduleServices.find((s) => s.id === "ss-dinner")!;
  return { upsert: { scheduleServices: [{ ...row, closesAt, lastSeatingAt: 1330 }] }, remove: {} };
}

describe("alsoApplyOptions", () => {
  it("offers the other schedules that run a service whose times the edit changed", () => {
    const config = threeSchedules();
    expect(alsoApplyOptions(config, dinnerEdit(config), "regular", TODAY)).toEqual([
      {
        venueServiceId: "vs-dinner",
        serviceName: "Dinner",
        targets: [
          { scheduleId: "wk", scheduleName: "Weeknight" },
          { scheduleId: "su", scheduleName: "Summer" },
        ],
      },
    ]);
  });

  it("offers nothing for a service whose times did not change", () => {
    const config = threeSchedules();
    const row = config.scheduleServices.find((s) => s.id === "ss-dinner")!;
    const same = { upsert: { scheduleServices: [row] }, remove: {} };
    expect(alsoApplyOptions(config, same, "regular", TODAY)).toEqual([]);
  });

  it("offers nothing for a service no other schedule runs", () => {
    const config = threeSchedules();
    const lunch = config.scheduleServices.find((s) => s.id === "ss-lunch")!;
    const changes = { upsert: { scheduleServices: [{ ...lunch, closesAt: 960 }] }, remove: {} };
    // Summer runs Lunch too, so it is offered; Weeknight, which does not, is not.
    expect(
      alsoApplyOptions(config, changes, "regular", TODAY)[0]?.targets.map((t) => t.scheduleId)
    ).toEqual(["su"]);
  });

  it("offers nothing for a row the schedule did not have before", () => {
    const config = threeSchedules();
    const row = config.scheduleServices.find((s) => s.id === "ss-dinner")!;
    const added = {
      upsert: { scheduleServices: [{ ...row, id: "new-row", closesAt: 1 }] },
      remove: {},
    };
    expect(alsoApplyOptions(config, added, "regular", TODAY)).toEqual([]);
  });

  it("leaves out an archived schedule", () => {
    const config = threeSchedules();
    const archived = {
      ...config,
      schedules: config.schedules.map((s) =>
        s.id === "su" ? { ...s, archivedAt: "2026-01-01T00:00:00.000Z" } : s
      ),
    };
    const targets = alsoApplyOptions(archived, dinnerEdit(archived), "regular", TODAY)[0]?.targets;
    expect(targets?.map((t) => t.scheduleId)).toEqual(["wk"]);
  });

  it("leaves out the regular week a regular-week save replaced (#8688)", () => {
    const saved = saveRegularWeek(threeSchedules(), TODAY);
    const old = supersededWeekOf(saved);
    // Editing Summer's Dinner: Weeknight and the new regular week are offered, the hidden week is not.
    const row = saved.scheduleServices.find((s) => s.id === "ss-dinner-su")!;
    const edit = { upsert: { scheduleServices: [{ ...row, closesAt: 1410 }] }, remove: {} };
    const targets = alsoApplyOptions(saved, edit, "su", TODAY)[0]?.targets ?? [];
    expect(targets.map((t) => t.scheduleId)).not.toContain(old.id);
    expect(targets.map((t) => t.scheduleId)).toContain("wk");
    // A pick of the hidden week is dropped, so the save writes nothing into it.
    const changes = buildAlsoApplyChanges(saved, edit, "su", { "vs-dinner": [old.id] }, TODAY);
    expect(changes.upsert.scheduleServices?.map((s) => s.scheduleId)).toEqual(["su"]);
  });
});

describe("buildAlsoApplyChanges", () => {
  it("writes the edited times into each picked schedule's row and keeps the rest of it", () => {
    const config = threeSchedules();
    const changes = buildAlsoApplyChanges(
      config,
      dinnerEdit(config),
      "regular",
      {
        "vs-dinner": ["wk"],
      },
      TODAY
    );
    const rows = changes.upsert.scheduleServices ?? [];
    expect(rows.map((r) => r.id).sort()).toEqual(["ss-dinner", "ss-dinner-wk"]);
    const next = applyChanges(config, changes, "2026-10-25T00:00:00.000Z");
    const wk = next.scheduleServices.find((s) => s.id === "ss-dinner-wk")!;
    expect([wk.opensAt, wk.lastSeatingAt, wk.closesAt]).toEqual([1020, 1330, 1410]);
    expect(wk.weekdays).toEqual([]);
    // Summer was not picked.
    expect(next.scheduleServices.find((s) => s.id === "ss-dinner-su")!.closesAt).toBe(1400);
  });

  it("carries only the times the edit changed, so another opening time stays", () => {
    const config = threeSchedules();
    const later = {
      ...config,
      scheduleServices: config.scheduleServices.map((s) =>
        s.id === "ss-dinner-wk" ? { ...s, opensAt: 1000 } : s
      ),
    };
    const changes = buildAlsoApplyChanges(
      later,
      dinnerEdit(later),
      "regular",
      {
        "vs-dinner": ["wk"],
      },
      TODAY
    );
    const wk = changes.upsert.scheduleServices?.find((r) => r.id === "ss-dinner-wk");
    expect([wk?.opensAt, wk?.closesAt]).toEqual([1000, 1410]);
  });

  it("keeps the target's own seating and booking types", () => {
    const config = threeSchedules();
    const phoneOnly = {
      ...config,
      scheduleServices: config.scheduleServices.map((s) =>
        s.id === "ss-dinner-wk" ? { ...s, bookingTypes: ["phone" as const] } : s
      ),
    };
    const changes = buildAlsoApplyChanges(
      phoneOnly,
      dinnerEdit(phoneOnly),
      "regular",
      {
        "vs-dinner": ["wk"],
      },
      TODAY
    );
    const wk = changes.upsert.scheduleServices?.find((r) => r.id === "ss-dinner-wk");
    expect(wk?.bookingTypes).toEqual(["phone"]);
  });

  it("is the edit alone when nothing is picked, or a pick is no longer offered", () => {
    const config = threeSchedules();
    const edit = dinnerEdit(config);
    expect(buildAlsoApplyChanges(config, edit, "regular", {}, TODAY)).toEqual(edit);
    expect(
      buildAlsoApplyChanges(config, edit, "regular", { "vs-dinner": ["gone"] }, TODAY)
    ).toEqual(edit);
  });

  it("does not change its input", () => {
    const config = threeSchedules();
    const edit = dinnerEdit(config);
    const before = JSON.stringify(edit);
    buildAlsoApplyChanges(config, edit, "regular", { "vs-dinner": ["wk", "su"] }, TODAY);
    expect(JSON.stringify(edit)).toBe(before);
  });
});

describe("alsoApplyScheduleIds and pruneAlsoApply", () => {
  it("lists each picked schedule once, only while it is offered", () => {
    const config = threeSchedules();
    const options = alsoApplyOptions(config, dinnerEdit(config), "regular", TODAY);
    const picks = { "vs-dinner": ["wk", "gone"], "vs-lunch": ["wk"] };
    expect(alsoApplyScheduleIds(options, picks)).toEqual(["wk"]);
    expect(pruneAlsoApply(options, picks)).toEqual({ "vs-dinner": ["wk"] });
  });
});

describe("alsoApplyChangedSince", () => {
  const picks = { "vs-dinner": ["wk", "su"] };

  it("names a picked schedule whose row a colleague changed", () => {
    const before = threeSchedules();
    const after = {
      ...before,
      scheduleServices: before.scheduleServices.map((s) =>
        s.id === "ss-dinner-wk" ? { ...s, opensAt: 1000 } : s
      ),
    };
    expect(alsoApplyChangedSince(before, after, picks)).toEqual({
      changed: ["Weeknight"],
      removed: [],
    });
  });

  it("names a picked schedule that no longer runs the service or is gone", () => {
    const before = threeSchedules();
    const after = {
      ...before,
      schedules: before.schedules.filter((s) => s.id !== "su"),
      scheduleServices: before.scheduleServices.filter((s) => s.id !== "ss-dinner-wk"),
    };
    expect(alsoApplyChangedSince(before, after, picks)).toEqual({
      changed: [],
      removed: ["Weeknight", "Summer"],
    });
  });

  it("says nothing when the picked rows are as they were", () => {
    const config = threeSchedules();
    expect(alsoApplyChangedSince(config, config, picks)).toEqual({ changed: [], removed: [] });
  });
});
