import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { rebookOffers, type RebookResult } from "./rebook.js";
import type { BookingSnapshot, EngineTable } from "./slots.js";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-11-05T12:00:00Z"); // Thu Nov 5, 04:00 PST

const TABLES: EngineTable[] = [
  {
    id: "t-4",
    name: "4-top",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    isActive: true,
    priority: 1,
  },
];

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
  scheduleServices: [
    {
      id: "dinner",
      scheduleId: "regular",
      venueServiceId: "vs-dinner",
      opensAt: 1020, // 17:00
      lastSeatingAt: 1080, // 18:00
      closesAt: 1200,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    },
  ],
  assignments: [
    { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const snapshot = (dateRules: DateRule[] = [], overrides: Partial<BookingSnapshot> = {}) => ({
  timezone: TZ,
  config: { ...CONFIG, dateRules },
  tables: TABLES,
  reservations: [],
  holds: [],
  settings: null,
  ...overrides,
});

/** A whole-venue closure from `startsOn` to `endsOn` inclusive (one day by default). */
const closed = (startsOn: string, endsOn = startsOn): DateRule => ({
  id: `c-${startsOn}`,
  kind: "closure",
  targetKind: "venue",
  startsOn,
  endsOn,
});

/** Instant of a PST wall time (no DST change in the test window). */
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-08:00`);

const ORIGINAL = { startTime: at("2026-11-06", "17:30"), partySize: 2 };

const starts = (result: RebookResult) =>
  result.kind === "offers" ? result.slots.map((s) => s.start.toISOString()) : [];

describe("rebookOffers", () => {
  it("offers 3 slots on different days at the original time, soonest first", () => {
    const result = rebookOffers(snapshot([closed("2026-11-06")]), ORIGINAL, NOW);
    expect(result.kind).toBe("offers");
    expect(starts(result)).toEqual([
      at("2026-11-05", "17:30").toISOString(),
      at("2026-11-07", "17:30").toISOString(),
      at("2026-11-08", "17:30").toISOString(),
    ]);
  });

  it("breaks an equal time-of-day distance toward the earlier time", () => {
    const original = { startTime: at("2026-11-06", "17:15"), partySize: 2 };
    const result = rebookOffers(snapshot([closed("2026-11-06")]), original, NOW);
    expect(starts(result)[0]).toBe(at("2026-11-05", "17:00").toISOString());
  });

  it("fills with second-nearest times when fewer than 3 days are open", () => {
    // Open only Nov 5 and Nov 7 within the window.
    const rules = [closed("2026-11-06"), closed("2026-11-08", "2026-11-30")];
    const result = rebookOffers(snapshot(rules), ORIGINAL, NOW);
    expect(starts(result)).toEqual([
      at("2026-11-05", "17:00").toISOString(),
      at("2026-11-05", "17:30").toISOString(),
      at("2026-11-07", "17:30").toISOString(),
    ]);
  });

  it("offers fewer than 3 when fewer slots are open", () => {
    const rules = [closed("2026-11-05", "2026-11-06"), closed("2026-11-08", "2026-11-30")];
    const booked = {
      reservations: [
        {
          id: "r1",
          tableId: "t-4",
          startTime: at("2026-11-07", "17:00"),
          endTime: at("2026-11-07", "18:00"),
          partySize: 4,
        },
      ],
    };
    const result = rebookOffers(snapshot(rules, booked), ORIGINAL, NOW);
    expect(starts(result)).toEqual([at("2026-11-07", "18:00").toISOString()]);
  });

  it("never offers a slot in the past or past the 14-day window", () => {
    const lateNow = new Date("2026-11-06T01:45:00Z"); // Nov 5, 17:45 PST
    const rules = [closed("2026-11-06", "2026-11-18")];
    // The window is Nov 5..Nov 18: 17:00/17:30 on Nov 5 have passed and open Nov 19 is outside it.
    const result = rebookOffers(snapshot(rules), ORIGINAL, lateNow);
    expect(starts(result)).toEqual([at("2026-11-05", "18:00").toISOString()]);
  });

  it("falls back to the picker when nothing is open", () => {
    const result = rebookOffers(snapshot([closed("2026-11-01", "2026-11-30")]), ORIGINAL, NOW);
    expect(result).toEqual({ kind: "picker" });
  });

  it("only offers slots with a table for the same party size", () => {
    const big = { startTime: ORIGINAL.startTime, partySize: 6 };
    expect(rebookOffers(snapshot([closed("2026-11-06")]), big, NOW)).toEqual({ kind: "picker" });
  });
});
