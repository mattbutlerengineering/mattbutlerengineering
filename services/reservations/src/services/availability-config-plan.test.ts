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
const TODAY = "2026-10-25";

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
    const resolved = resolveScopeConflicts(before, next, "keep", ids(), TODAY);

    const skips = resolved.dateRules.filter((r) => r.kind === "skip");
    expect(skips.map((s) => [s.seriesId, s.startsOn])).toEqual([
      ["dr-new", "2026-11-06"],
      ["dr-new", "2026-11-13"],
    ]);
  });

  it("replace: skips the existing rule on the dates the new rule covers", () => {
    const resolved = resolveScopeConflicts(before, next, "replace", ids(), TODAY);

    const skips = resolved.dateRules.filter((r) => r.kind === "skip");
    expect(skips.map((s) => [s.seriesId, s.startsOn])).toEqual([
      ["dr-old", "2026-11-06"],
      ["dr-old", "2026-11-13"],
    ]);
  });

  describe("a rule trimmed by a This and following split", () => {
    const dec = (d: number) => `2026-12-${String(d).padStart(2, "0")}`;
    const edited = (rule: DateRule) =>
      ({
        ...rule,
        payload: {
          version: 1,
          services: [
            {
              ...(rule as { payload: { services: object[] } }).payload.services[0]!,
              closesAt: 1200,
            },
          ],
        },
      }) as DateRule;
    const split = (rule: DateRule, from: number) => {
      const ended = { ...rule, endsOn: dec(from - 1) } as DateRule;
      const created = { ...edited(rule), id: `${rule.id}-2`, startsOn: dec(from) } as DateRule;
      return { ended, created };
    };
    const skipsOf = (config: AvailabilityConfig) =>
      config.dateRules.filter((r) => r.kind === "skip").map((s) => [s.seriesId, s.startsOn]);
    const ids = () => {
      let n = 0;
      return () => `skip-${++n}`;
    };

    it("does not treat the trimmed half as incoming: a one-date edit of an earlier date keeps its hours (Replace)", () => {
      const rangeA = special("A", dec(1), dec(31));
      const overrideX = special("X", dec(15), dec(15));
      const skipA = {
        id: "sk",
        kind: "skip",
        targetKind: "venue",
        startsOn: dec(15),
        endsOn: dec(15),
        seriesId: "A",
      } as DateRule;
      const stored = { ...BASE, dateRules: [rangeA, overrideX, skipA] };
      const { ended, created } = split(rangeA, 20);
      const next = { ...stored, dateRules: [ended, created, overrideX, skipA] };

      const resolved = resolveScopeConflicts(stored, next, "replace", ids(), "2026-12-10");

      expect(skipsOf(resolved)).toEqual([["A", dec(15)]]);
    });

    it("does not flip the dates before the split to an older rule (Keep)", () => {
      const fridaysB = special("B", "2026-11-01", null, { repeat: { version: 1, weekdays: [5] } });
      const rangeA = special("A", dec(1), dec(31));
      const stored = { ...BASE, dateRules: [fridaysB, rangeA] };
      const { ended, created } = split(rangeA, 20);
      const next = { ...stored, dateRules: [fridaysB, ended, created] };

      const resolved = resolveScopeConflicts(stored, next, "keep", ids(), "2026-12-10");

      // Only the new half meets B, on the one Friday it covers; Dec 4, 11 and 18 stay A's.
      expect(skipsOf(resolved)).toEqual([["A-2", dec(25)]]);
    });

    it("still settles the dates a longer range newly covers", () => {
      const rangeA = special("A", dec(1), dec(10));
      const other = special("O", dec(12), dec(12));
      const stored = { ...BASE, dateRules: [rangeA, other] };
      const next = { ...stored, dateRules: [{ ...rangeA, endsOn: dec(20) } as DateRule, other] };

      const resolved = resolveScopeConflicts(stored, next, "keep", ids(), "2026-12-01");

      expect(skipsOf(resolved)).toEqual([["A", dec(12)]]);
    });

    it("ignores closure series edits, which are not hours rules", () => {
      const closure = {
        id: "C",
        kind: "closure",
        targetKind: "venue",
        startsOn: dec(1),
        endsOn: dec(31),
        repeat: { version: 1, weekdays: [1] },
      } as DateRule;
      const other = special("O", dec(7), dec(7));
      const stored = { ...BASE, dateRules: [closure, other] };
      const next = {
        ...stored,
        dateRules: [{ ...closure, endsOn: dec(13) } as DateRule, other],
      };
      expect(resolveScopeConflicts(stored, next, "replace", ids(), "2026-12-01")).toBe(next);
    });
  });

  it("leaves a change with no dated hours rules alone", () => {
    expect(resolveScopeConflicts(before, before, "replace", ids(), TODAY)).toBe(before);
  });

  describe("an edit to a schedule (everywhere it is used)", () => {
    const longer = { ...BASE.scheduleServices[0]!, closesAt: 1380 };
    const weekEdit = { ...before, scheduleServices: [longer] };

    it("replace: skips stored dated hours on the future dates that schedule runs", () => {
      const resolved = resolveScopeConflicts(before, weekEdit, "replace", ids(), TODAY);

      const skips = resolved.dateRules.filter((r) => r.kind === "skip");
      expect(skips.map((s) => s.seriesId)).toEqual(Array(8).fill("dr-old"));
      expect(skips.map((s) => s.startsOn)).toEqual([
        "2026-11-06",
        "2026-11-07",
        "2026-11-08",
        "2026-11-09",
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
      ]);
    });

    it("keep: leaves the stored dated hours winning", () => {
      expect(resolveScopeConflicts(before, weekEdit, "keep", ids(), TODAY)).toBe(weekEdit);
    });

    it("replace: leaves dated hours alone where another schedule runs", () => {
      const summer = {
        id: "sch-summer",
        name: "Summer",
        kind: "alternate" as const,
        isRegular: false,
      };
      const withSummer: AvailabilityConfig = {
        ...before,
        schedules: [...before.schedules, summer],
        scheduleServices: [
          ...before.scheduleServices,
          { ...BASE.scheduleServices[0]!, id: "ss-summer", scheduleId: "sch-summer" },
        ],
        assignments: [
          ...before.assignments,
          {
            id: "as-summer",
            scheduleId: "sch-summer",
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startsOn: "2027-06-01",
            endsOn: "2027-09-15",
            precedence: 1,
          },
        ],
      };
      const summerEdit = {
        ...withSummer,
        scheduleServices: withSummer.scheduleServices.map((s) =>
          s.id === "ss-summer" ? { ...s, closesAt: 1380 } : s
        ),
      };

      expect(resolveScopeConflicts(withSummer, summerEdit, "replace", ids(), TODAY)).toBe(
        summerEdit
      );
    });

    it("replace: never skips a past date", () => {
      const resolved = resolveScopeConflicts(before, weekEdit, "replace", ids(), "2026-11-10");
      expect(resolved.dateRules.filter((r) => r.kind === "skip").map((s) => s.startsOn)).toEqual([
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
      ]);
    });
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
