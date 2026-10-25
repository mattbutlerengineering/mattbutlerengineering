import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import {
  affectedRange,
  applyChanges,
  diffConfig,
  inverseOf,
  referenceIssues,
  resolveScopeConflicts,
} from "./availability-config-plan.js";

const NOW = "2026-10-25T12:00:00.000Z";

const BASE: AvailabilityConfig = {
  schedules: [{ id: "sch-1", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "ss-1",
      scheduleId: "sch-1",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1260,
      closesAt: 1320,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as-1", scheduleId: "sch-1", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const special = (id: string, startsOn: string, endsOn: string | null, opts = {}): DateRule => ({
  id,
  kind: "special_hours",
  targetKind: "venue",
  startsOn,
  endsOn,
  payload: {
    version: 1,
    services: [
      {
        venueServiceId: "vs-dinner",
        opensAt: 1080,
        lastSeatingAt: 1200,
        closesAt: 1260,
        seating: { version: 1, interval: 15 },
        bookingTypes: ["online", "phone"],
      },
    ],
  },
  ...opts,
});

describe("applyChanges", () => {
  it("replaces an upserted row by id and appends a new one", () => {
    const next = applyChanges(
      BASE,
      {
        upsert: {
          scheduleServices: [{ ...BASE.scheduleServices[0]!, closesAt: 1350 }],
          dateRules: [special("dr-1", "2026-11-06", "2026-11-06")],
        },
        remove: {},
      },
      NOW
    );

    expect(next.scheduleServices).toEqual([{ ...BASE.scheduleServices[0], closesAt: 1350 }]);
    expect(next.dateRules.map((r) => r.id)).toEqual(["dr-1"]);
    expect(BASE.dateRules).toEqual([]);
  });

  it("archives a removed schedule or venue service and drops the other removed rows", () => {
    const next = applyChanges(
      BASE,
      {
        upsert: {},
        remove: { venueServices: ["vs-dinner"], scheduleServices: ["ss-1"], assignments: ["as-1"] },
      },
      NOW
    );

    expect(next.venueServices).toEqual([{ ...BASE.venueServices[0], archivedAt: NOW }]);
    expect(next.scheduleServices).toEqual([]);
    expect(next.assignments).toEqual([]);
  });
});

describe("resolveScopeConflicts", () => {
  const existing = special("dr-old", "2026-11-06", "2026-11-13");
  const before = { ...BASE, dateRules: [existing] };
  const incoming = special("dr-new", "2026-11-01", "2026-11-30", {
    repeat: { version: 1, weekdays: [5] },
  });
  const next = { ...before, dateRules: [existing, incoming] };
  const ids = () => {
    let n = 0;
    return () => `skip-${++n}`;
  };

  it("keep: skips the new rule on every date that already has its own change", () => {
    const resolved = resolveScopeConflicts(before, next, "keep", ids());

    const skips = resolved.dateRules.filter((r) => r.kind === "skip");
    expect(skips.map((s) => [s.seriesId, s.startsOn])).toEqual([
      ["dr-new", "2026-11-06"],
      ["dr-new", "2026-11-13"],
    ]);
  });

  it("replace: skips the existing rule on the dates the new rule covers", () => {
    const resolved = resolveScopeConflicts(before, next, "replace", ids());

    const skips = resolved.dateRules.filter((r) => r.kind === "skip");
    expect(skips.map((s) => [s.seriesId, s.startsOn])).toEqual([
      ["dr-old", "2026-11-06"],
      ["dr-old", "2026-11-13"],
    ]);
  });

  it("leaves a change with no dated hours rules alone", () => {
    expect(resolveScopeConflicts(before, before, "replace", ids())).toBe(before);
  });
});

describe("diffConfig and inverseOf", () => {
  it("classifies creates, updates and deletes per table", () => {
    const next: AvailabilityConfig = {
      ...BASE,
      scheduleServices: [],
      assignments: [{ ...BASE.assignments[0]!, precedence: 1 }],
      dateRules: [special("dr-1", "2026-11-06", null)],
    };

    const diff = diffConfig(BASE, next);

    expect(diff.create.dateRules.map((r) => r.id)).toEqual(["dr-1"]);
    expect(diff.update.assignments.map((a) => a.id)).toEqual(["as-1"]);
    expect(diff.remove.scheduleServices).toEqual(["ss-1"]);
    expect(diff.update.schedules).toEqual([]);
  });

  it("stores the rows to restore and the ids to delete", () => {
    const next = {
      ...BASE,
      scheduleServices: [],
      dateRules: [special("dr-1", "2026-11-06", null)],
    };
    const inverse = inverseOf(BASE, diffConfig(BASE, next), { monday: "x" });

    expect(inverse.remove.dateRules).toEqual(["dr-1"]);
    expect(inverse.restore.scheduleServices).toEqual(BASE.scheduleServices);
    expect(inverse.operatingHours).toEqual({ monday: "x" });
  });
});

describe("affectedRange", () => {
  it("spans the touched date rules", () => {
    const next = { ...BASE, dateRules: [special("dr-1", "2026-11-06", "2026-11-20")] };
    expect(affectedRange(BASE, diffConfig(BASE, next), "2026-10-25")).toEqual({
      from: "2026-11-06",
      to: "2026-11-20",
    });
  });

  it("is open from today when the week itself changed", () => {
    const next = { ...BASE, assignments: [{ ...BASE.assignments[0]!, precedence: 2 }] };
    expect(affectedRange(BASE, diffConfig(BASE, next), "2026-10-25")).toEqual({
      from: "2026-10-25",
      to: null,
    });
  });
});

describe("referenceIssues", () => {
  it("accepts a config whose references all resolve", () => {
    expect(referenceIssues(BASE, new Set())).toEqual([]);
  });

  it("names each reference to a row the venue does not have", () => {
    const config: AvailabilityConfig = {
      ...BASE,
      scheduleServices: [{ ...BASE.scheduleServices[0]!, scheduleId: "other-venue-sch" }],
      dateRules: [
        {
          id: "dr-t",
          kind: "closure",
          targetKind: "tables",
          tableIds: ["t-1", "t-elsewhere"],
          startsOn: "2026-11-06",
          endsOn: "2026-11-06",
        },
      ],
    };

    expect(referenceIssues(config, new Set(["t-1"])).map((i) => i.path)).toEqual([
      "scheduleServices[0].scheduleId",
      "dateRules[0].tableIds[1]",
    ]);
  });
});
