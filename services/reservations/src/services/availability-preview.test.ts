import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { planPreview, scopeIncludes, type PreviewInput } from "./availability-preview.js";

const NOW = new Date("2026-10-25T19:00:00.000Z");
const TZ = "America/Los_Angeles";

const CONFIG: AvailabilityConfig = {
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

const STATE: PreviewInput["state"] = {
  stored: CONFIG,
  effective: CONFIG,
  source: "rows",
  version: 3,
  timezone: TZ,
  operatingHours: null,
};

const closure = (startsOn: string, endsOn = startsOn) => ({
  id: `dr-${startsOn}`,
  kind: "closure" as const,
  targetKind: "venue" as const,
  startsOn,
  endsOn,
});

const DEFAULTS = { strandedOffset: 0, compareWith: "saved", partySize: 2 } as const;

const input = (overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  state: STATE,
  body: {
    draft: {
      changes: { upsert: { dateRules: [closure("2026-11-06")] }, remove: {} },
      scopeConflicts: "keep",
    },
    scope: { from: "2026-11-01" },
    focusDate: "2026-11-01",
    ...DEFAULTS,
  },
  bookings: [],
  tableIds: new Set(),
  now: NOW,
  ...overrides,
});

// Pacific evening: 19:00 on `day` in UTC the next morning.
const booking = (n: number, day: string) => ({
  id: `res-${String(n).padStart(3, "0")}`,
  tableId: null,
  startTime: new Date(Date.parse(`${day}T03:00:00.000Z`) + 86_400_000),
  partySize: 2,
  date: new Date(`${day}T00:00:00.000Z`),
});

describe("scopeIncludes", () => {
  it("covers a list, a closed range and an open range", () => {
    expect(scopeIncludes(["2026-11-06"], "2026-11-06")).toBe(true);
    expect(scopeIncludes(["2026-11-06"], "2026-11-07")).toBe(false);
    expect(scopeIncludes({ from: "2026-11-01", to: "2026-11-30" }, "2026-12-01")).toBe(false);
    expect(scopeIncludes({ from: "2026-11-01" }, "2027-03-01")).toBe(true);
    expect(scopeIncludes({ from: "2026-11-01" }, "2026-10-31")).toBe(false);
  });
});

describe("planPreview", () => {
  it("refuses an invalid draft with validateConfig's issue paths", () => {
    const plan = planPreview(
      input({
        body: {
          draft: {
            changes: {
              upsert: {
                scheduleServices: [{ ...CONFIG.scheduleServices[0]!, lastSeatingAt: 1400 }],
              },
              remove: {},
            },
            scopeConflicts: "keep",
          },
          scope: { from: "2026-11-01" },
          focusDate: "2026-11-01",
          ...DEFAULTS,
        },
      })
    );
    expect(plan).toEqual({
      kind: "invalid",
      issues: [expect.objectContaining({ path: "scheduleServices[0].lastSeatingAt" })],
    });
  });

  it("returns 30 days from the focus date, with the closed date's times removed", () => {
    const plan = planPreview(input());
    if (plan.kind !== "ok") throw new Error(plan.kind);
    expect(plan.result.days).toHaveLength(30);
    expect(plan.result.days[0]?.serviceDate).toBe("2026-11-01");
    const closed = plan.result.days.find((d) => d.serviceDate === "2026-11-06");
    expect(closed?.removed.length).toBeGreaterThan(0);
    expect(closed?.added).toEqual([]);
    expect(plan.result.days.filter((d) => d.removed.length > 0)).toHaveLength(1);
    expect(plan.result.version).toBe(3);
  });

  it("resolves the focus date under the draft", () => {
    const plan = planPreview(input({ body: { ...input().body, focusDate: "2026-11-06" } }));
    if (plan.kind !== "ok") throw new Error(plan.kind);
    expect(plan.result.focusDay).toMatchObject({
      serviceDate: "2026-11-06",
      label: "Closed",
      services: [],
    });
  });

  it("lists stranded bookings beyond the 30-day window, but only in scope", () => {
    const plan = planPreview(
      input({
        body: {
          draft: {
            changes: {
              upsert: { dateRules: [closure("2026-11-06"), closure("2027-02-05")] },
              remove: {},
            },
            scopeConflicts: "keep",
          },
          scope: { from: "2026-11-01", to: "2026-12-31" },
          focusDate: "2026-11-01",
          ...DEFAULTS,
        },
        bookings: [booking(1, "2026-11-06"), booking(2, "2027-02-05"), booking(3, "2026-11-07")],
      })
    );
    if (plan.kind !== "ok") throw new Error(plan.kind);
    expect(plan.result.stranded.items.map((r) => r.id)).toEqual(["res-001"]);

    const wider = planPreview(
      input({
        body: {
          draft: {
            changes: { upsert: { dateRules: [closure("2027-02-05")] }, remove: {} },
            scopeConflicts: "keep",
          },
          scope: { from: "2026-11-01" },
          focusDate: "2026-11-01",
          ...DEFAULTS,
        },
        bookings: [booking(2, "2027-02-05")],
      })
    );
    if (wider.kind !== "ok") throw new Error(wider.kind);
    expect(wider.result.stranded.items.map((r) => r.id)).toEqual(["res-002"]);
  });

  it("pages the stranded list after 50", () => {
    const bookings = Array.from({ length: 60 }, (_, i) => booking(i, "2026-11-06"));
    const first = planPreview(input({ bookings }));
    const second = planPreview(input({ bookings, body: { ...input().body, strandedOffset: 50 } }));
    if (first.kind !== "ok" || second.kind !== "ok") throw new Error("not ok");
    expect(first.result.stranded).toMatchObject({ total: 60, offset: 0 });
    expect(first.result.stranded.items).toHaveLength(50);
    expect(second.result.stranded).toMatchObject({ total: 60, offset: 50 });
    expect(second.result.stranded.items).toHaveLength(10);
    const ids = [...first.result.stranded.items, ...second.result.stranded.items].map((r) => r.id);
    expect(new Set(ids).size).toBe(60);
  });

  describe("compareWith", () => {
    const withClosure = {
      ...STATE,
      stored: { ...CONFIG, dateRules: [closure("2026-11-04")] },
      effective: { ...CONFIG, dateRules: [closure("2026-11-04")] },
    };
    const removedDates = (compareWith: "saved" | "regularWeek") => {
      const plan = planPreview(
        input({ state: withClosure, body: { ...input().body, compareWith } })
      );
      if (plan.kind !== "ok") throw new Error(plan.kind);
      return plan.result.days.filter((d) => d.removed.length > 0).map((d) => d.serviceDate);
    };

    it("measures against the saved config by default", () => {
      expect(removedDates("saved")).toEqual(["2026-11-06"]);
    });

    it("measures against the regular week, which has no date rules", () => {
      expect(removedDates("regularWeek")).toEqual(["2026-11-04", "2026-11-06"]);
    });

    it("still finds stranded bookings against the saved config", () => {
      const plan = planPreview(
        input({
          state: withClosure,
          body: { ...input().body, compareWith: "regularWeek" },
          bookings: [booking(1, "2026-11-04")],
        })
      );
      if (plan.kind !== "ok") throw new Error(plan.kind);
      expect(plan.result.stranded.total).toBe(0);
    });
  });

  describe("partySize", () => {
    const table = {
      id: "t-1",
      name: "T1",
      capacity: 4,
      minCovers: 1,
      maxCovers: null,
      isActive: true,
      priority: 0,
    };
    const removedFor = (partySize: number, tables: PreviewInput["tables"]) => {
      const plan = planPreview(input({ tables, body: { ...input().body, partySize } }));
      if (plan.kind !== "ok") throw new Error(plan.kind);
      return plan.result.days.find((d) => d.serviceDate === "2026-11-06")?.removed ?? [];
    };

    it("shows the times a party of that size could book, given the tables", () => {
      expect(removedFor(2, [table]).length).toBeGreaterThan(0);
      expect(removedFor(6, [table])).toEqual([]);
    });

    it("shows the listed times when the venue has no tables to judge by", () => {
      expect(removedFor(6, []).length).toBeGreaterThan(0);
    });
  });

  it("takes the regular week from undated assignments, not a seasonal one", () => {
    const summer = {
      ...CONFIG,
      schedules: [
        ...CONFIG.schedules,
        { id: "sch-2", name: "Summer", kind: "alternate" as const, isRegular: false },
      ],
      scheduleServices: [
        ...CONFIG.scheduleServices,
        {
          ...CONFIG.scheduleServices[0]!,
          id: "ss-2",
          scheduleId: "sch-2",
          opensAt: 720,
          lastSeatingAt: 780,
          closesAt: 840,
        },
      ],
      assignments: [
        ...CONFIG.assignments,
        {
          id: "as-2",
          scheduleId: "sch-2",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          precedence: 1,
          startsOn: "2026-11-01",
          endsOn: "2026-11-30",
        },
      ],
    };
    const state = { ...STATE, stored: summer, effective: summer };
    const run = (compareWith: "saved" | "regularWeek") => {
      const plan = planPreview(
        input({
          state,
          body: {
            ...input().body,
            draft: { changes: { upsert: {}, remove: {} }, scopeConflicts: "keep" },
            compareWith,
          },
        })
      );
      if (plan.kind !== "ok") throw new Error(plan.kind);
      return plan.result.days[0]!;
    };
    expect(run("saved").added).toEqual([]);
    // The draft changes nothing, so against the season it adds the dinner times the season lacks.
    expect(run("regularWeek").added.length).toBeGreaterThan(0);
  });

  it("judges by active tables only", () => {
    const inactive = {
      id: "t-1",
      name: "T1",
      capacity: 4,
      minCovers: 1,
      maxCovers: null,
      isActive: false,
      priority: 0,
    };
    const plan = planPreview(input({ tables: [inactive] }));
    if (plan.kind !== "ok") throw new Error(plan.kind);
    expect(
      plan.result.days.find((d) => d.serviceDate === "2026-11-06")?.removed.length
    ).toBeGreaterThan(0);
  });
});
