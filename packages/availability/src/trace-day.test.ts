import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { listSlots, type BookingSnapshot, type EngineTable } from "./slots.js";
import { traceDay, type TraceReason } from "./trace-day.js";

const TZ = "America/Los_Angeles";
const DATE = "2026-11-06"; // Friday, PST (UTC−8)
const NOW = new Date("2026-11-06T12:00:00Z");

const TABLES: EngineTable[] = [
  {
    id: "t-2",
    name: "2-top",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    isActive: true,
    priority: 1,
  },
  {
    id: "t-4",
    name: "4-top",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    isActive: true,
    priority: 2,
  },
];

const CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Regular", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "vs-dinner", name: "Dinner", position: 0 },
    { id: "vs-late", name: "Late", position: 1 },
  ],
  scheduleServices: [
    {
      id: "dinner",
      scheduleId: "regular",
      venueServiceId: "vs-dinner",
      opensAt: 1020,
      lastSeatingAt: 1080,
      closesAt: 1200,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
    {
      id: "late",
      scheduleId: "regular",
      venueServiceId: "vs-late",
      opensAt: 1380,
      lastSeatingAt: 1470,
      closesAt: 1560,
      seating: { version: 1, fixed: [1380, 1470] },
      bookingTypes: ["phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
    },
  ],
  assignments: [
    { id: "as", scheduleId: "regular", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
  ],
  dateRules: [],
};

const snapshot = (overrides: Partial<BookingSnapshot> = {}): BookingSnapshot => ({
  timezone: TZ,
  config: CONFIG,
  tables: TABLES,
  reservations: [],
  holds: [],
  settings: null,
  ...overrides,
});
const withRules = (...dateRules: DateRule[]) => snapshot({ config: { ...CONFIG, dateRules } });
const at = (hhmm: string, date = DATE) => new Date(`${date}T${hhmm}:00-08:00`);

const reasonAt = (
  trace: ReturnType<typeof traceDay>,
  serviceId: string,
  minute: number
): TraceReason | undefined =>
  trace.times.find((t) => t.serviceId === serviceId && t.minute === minute)?.reason;

describe("traceDay", () => {
  it("returns the resolveDay explanation unchanged and one entry per candidate time", () => {
    const trace = traceDay(snapshot(), DATE, { partySize: 3, now: NOW });
    expect(trace.day.serviceDate).toBe(DATE);
    expect(trace.day.explanation.length).toBeGreaterThan(0);
    expect(trace.times.map((t) => [t.serviceId, t.minute, t.outcome])).toEqual([
      ["vs-dinner", 1020, "bookable"],
      ["vs-dinner", 1050, "bookable"],
      ["vs-dinner", 1080, "bookable"],
      ["vs-late", 1380, "removed"],
      ["vs-late", 1470, "removed"],
    ]);
    expect(trace.times[0]).toMatchObject({
      serviceName: "Dinner",
      time: "5:00 PM",
      startsAt: at("17:00").toISOString(),
    });
  });

  it("removes a channel-closed service's times with channel_not_offered", () => {
    const trace = traceDay(snapshot(), DATE, { partySize: 2, now: NOW });
    expect(reasonAt(trace, "vs-late", 1380)).toEqual({
      code: "channel_not_offered",
      channel: "online",
    });
  });

  it("removes every time with booking_paused when the channel is paused", () => {
    const trace = traceDay(
      withRules({
        id: "p",
        kind: "closure",
        targetKind: "booking",
        bookingTypes: ["online"],
        startsOn: DATE,
      }),
      DATE,
      { partySize: 2, now: NOW }
    );
    expect(reasonAt(trace, "vs-dinner", 1020)).toEqual({
      code: "booking_paused",
      channel: "online",
    });
  });

  it("names the closure that removed a time, with its band", () => {
    const trace = traceDay(
      withRules({
        id: "b",
        kind: "closure",
        targetKind: "venue",
        startsOn: DATE,
        window: { version: 1, from: 1050, to: 1080 },
      }),
      DATE,
      { partySize: 2, now: NOW }
    );
    expect(reasonAt(trace, "vs-dinner", 1050)).toEqual({
      code: "closure",
      ruleId: "b",
      targetKind: "venue",
      from: 1050,
      to: 1080,
    });
    expect(trace.times.find((t) => t.minute === 1020)?.outcome).toBe("bookable");
  });

  it("flags a time that does not exist on the venue clock", () => {
    const spring = snapshot({ timezone: "America/Los_Angeles" });
    const trace = traceDay(
      {
        ...spring,
        config: {
          ...CONFIG,
          scheduleServices: [
            { ...CONFIG.scheduleServices[0]!, opensAt: 150, lastSeatingAt: 150, closesAt: 300 },
          ],
        },
      },
      "2027-03-14",
      { partySize: 2, now: NOW }
    );
    expect(reasonAt(trace, "vs-dinner", 150)).toEqual({ code: "nonexistent_local_time" });
  });

  it("reports no_suitable_table when no active table fits the party", () => {
    const trace = traceDay(snapshot(), DATE, { partySize: 9, now: NOW });
    expect(reasonAt(trace, "vs-dinner", 1020)).toEqual({ code: "no_suitable_table", partySize: 9 });
  });

  it("reports the booking window facts for too-soon and too-far times", () => {
    const earliest = at("17:15");
    const soon = traceDay(snapshot(), DATE, {
      partySize: 2,
      now: NOW,
      window: { earliest, latestLocalDate: null },
    });
    expect(reasonAt(soon, "vs-dinner", 1020)).toEqual({
      code: "before_earliest",
      earliest: earliest.toISOString(),
    });
    expect(soon.times.find((t) => t.minute === 1050)?.outcome).toBe("bookable");

    const far = traceDay(snapshot(), DATE, {
      partySize: 2,
      now: NOW,
      window: { earliest: NOW, latestLocalDate: "2026-11-05" },
    });
    expect(reasonAt(far, "vs-dinner", 1020)).toEqual({
      code: "after_latest_date",
      latestLocalDate: "2026-11-05",
    });
  });

  it("reports no_free_table with the number of suitable tables", () => {
    const trace = traceDay(
      snapshot({
        reservations: [
          { id: "r", tableId: "t-4", startTime: at("17:00"), endTime: at("18:30"), partySize: 4 },
        ],
      }),
      DATE,
      { partySize: 3, now: NOW }
    );
    expect(reasonAt(trace, "vs-dinner", 1020)).toEqual({
      code: "no_free_table",
      suitableTables: 1,
    });
  });

  it("reports the pacing limit and the covers already counted", () => {
    const trace = traceDay(
      snapshot({
        settings: { pacingRules: [{ maxCoversPerSlot: 4 }] },
        reservations: [
          { id: "r", tableId: "t-2", startTime: at("17:00"), endTime: at("18:15"), partySize: 2 },
        ],
      }),
      DATE,
      { partySize: 3, now: NOW }
    );
    expect(reasonAt(trace, "vs-dinner", 1020)).toEqual({
      code: "pacing",
      scope: "venue",
      limit: 4,
      windowMinutes: 15,
      covers: 2,
      partySize: 3,
    });
  });

  it("agrees with listSlots on which times are bookable", () => {
    const cases: BookingSnapshot[] = [
      snapshot(),
      withRules({ id: "c", kind: "closure", targetKind: "venue", startsOn: DATE }),
      withRules({
        id: "b",
        kind: "closure",
        targetKind: "venue",
        startsOn: DATE,
        window: { version: 1, from: 1050, to: 1080 },
      }),
      withRules({
        id: "t",
        kind: "closure",
        targetKind: "tables",
        tableIds: ["t-4"],
        startsOn: DATE,
      }),
      snapshot({
        settings: { pacingRules: [{ maxCoversPerSlot: 4 }] },
        reservations: [
          { id: "r", tableId: "t-2", startTime: at("17:00"), endTime: at("18:15"), partySize: 2 },
        ],
      }),
      snapshot({
        reservations: [
          { id: "r", tableId: "t-4", startTime: at("17:30"), endTime: at("19:00"), partySize: 4 },
        ],
      }),
    ];
    for (const snap of cases) {
      for (const partySize of [1, 2, 3, 4, 9]) {
        for (const channel of ["online", "phone"] as const) {
          const expected = listSlots(snap, DATE, partySize, channel, NOW)
            .filter((s) => s.available)
            .map((s) => s.start.toISOString());
          const actual = traceDay(snap, DATE, { partySize, now: NOW, channel })
            .times.filter((t) => t.outcome === "bookable")
            .map((t) => t.startsAt);
          expect(actual).toEqual(expected);
        }
      }
    }
  });
});
