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

const input = (overrides: Partial<PreviewInput> = {}): PreviewInput => ({
  state: STATE,
  body: {
    draft: {
      changes: { upsert: { dateRules: [closure("2026-11-06")] }, remove: {} },
      scopeConflicts: "keep",
    },
    scope: { from: "2026-11-01" },
    focusDate: "2026-11-01",
    strandedOffset: 0,
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
          strandedOffset: 0,
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
          strandedOffset: 0,
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
          strandedOffset: 0,
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
});
