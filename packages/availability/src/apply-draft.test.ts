import type { AvailabilityConfig } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { applyChanges, applyDraft } from "./apply-draft.js";

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [],
  assignments: [{ id: "as", scheduleId: "regular", weekdays: [1], precedence: 0 }],
  dateRules: [],
};
const NOW = "2026-11-01T00:00:00.000Z";
const NONE = { upsert: {}, remove: {} };

describe("applyDraft", () => {
  it("replaces an upserted row, adds a new one, and leaves the input untouched", () => {
    const before = structuredClone(CONFIG);
    const next = applyChanges(
      CONFIG,
      {
        upsert: {
          assignments: [{ id: "as", scheduleId: "regular", weekdays: [1, 2], precedence: 0 }],
          dateRules: [{ id: "c", kind: "closure", targetKind: "venue", startsOn: "2026-12-24" }],
        },
        remove: {},
      },
      NOW
    );
    expect(next.assignments[0]?.weekdays).toEqual([1, 2]);
    expect(next.dateRules.map((r) => r.id)).toEqual(["c"]);
    expect(CONFIG).toEqual(before);
  });

  it("archives a removed schedule and drops a removed assignment", () => {
    const next = applyChanges(
      CONFIG,
      { upsert: {}, remove: { schedules: ["regular"], assignments: ["as"] } },
      NOW
    );
    expect(next.schedules[0]?.archivedAt).toBe(NOW);
    expect(next.assignments).toEqual([]);
  });

  it("keeps the snapshot's timezone and swaps only the config", () => {
    const snap = applyDraft({ timezone: "America/Los_Angeles", config: CONFIG }, NONE, NOW);
    expect(snap).toEqual({ timezone: "America/Los_Angeles", config: CONFIG });
    expect(snap.config).not.toBe(CONFIG);
  });
});
