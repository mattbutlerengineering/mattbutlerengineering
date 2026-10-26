import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { judge, listSlots, type BookingSnapshot, type EngineTable } from "./slots.js";

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
      opensAt: 1020, // 17:00
      lastSeatingAt: 1080, // 18:00
      closesAt: 1200,
      seating: { version: 1, interval: 30 },
      bookingTypes: ["online", "phone"],
    },
    {
      id: "late",
      scheduleId: "regular",
      venueServiceId: "vs-late",
      opensAt: 1380, // 23:00
      lastSeatingAt: 1470, // 00:30 next day
      closesAt: 1560,
      seating: { version: 1, fixed: [1380, 1470] },
      bookingTypes: ["phone"],
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

/** Instant of a venue-local wall time on DATE (PST). */
const at = (hhmm: string, date = DATE) => new Date(`${date}T${hhmm}:00-08:00`);

describe("listSlots", () => {
  it("lists interval seatings from open to last seating with free suitable tables", () => {
    const slots = listSlots(snapshot(), DATE, 3, "online", NOW);
    expect(slots.map((s) => s.start.toISOString())).toEqual([
      at("17:00").toISOString(),
      at("17:30").toISOString(),
      at("18:00").toISOString(),
    ]);
    expect(slots[0]).toMatchObject({
      venueServiceId: "vs-dinner",
      available: true,
      tables: [expect.objectContaining({ id: "t-4" })],
    });
  });

  it("lists only services open to the channel, and fixed seatings past midnight", () => {
    const phone = listSlots(snapshot(), DATE, 2, "phone", NOW).filter(
      (s) => s.venueServiceId === "vs-late"
    );
    expect(phone.map((s) => s.start.toISOString())).toEqual([
      at("23:00").toISOString(),
      at("00:30", "2026-11-07").toISOString(),
    ]);
    expect(
      listSlots(snapshot(), DATE, 2, "online", NOW).some((s) => s.venueServiceId === "vs-late")
    ).toBe(false);
  });

  it("marks a slot unavailable when every suitable table is booked", () => {
    const booked = snapshot({
      reservations: [
        { id: "r", tableId: "t-4", startTime: at("17:00"), endTime: at("18:30"), partySize: 4 },
      ],
    });
    const [first] = listSlots(booked, DATE, 3, "online", NOW);
    expect(first).toMatchObject({ available: false, reason: "no_table", tables: [] });
  });

  it("marks a slot unavailable when pacing is full", () => {
    const paced = snapshot({
      settings: { pacingRules: [{ maxCoversPerSlot: 4 }] },
      reservations: [
        { id: "r", tableId: "t-2", startTime: at("17:00"), endTime: at("18:15"), partySize: 2 },
      ],
    });
    const [first] = listSlots(paced, DATE, 3, "online", NOW);
    expect(first).toMatchObject({ available: false, reason: "pacing" });
  });

  it("lists nothing on a closed day or a closed channel", () => {
    const closedDay = withRules({ id: "c", kind: "closure", targetKind: "venue", startsOn: DATE });
    expect(listSlots(closedDay, DATE, 2, "online", NOW)).toEqual([]);
    const paused = withRules({
      id: "p",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: DATE,
    });
    expect(listSlots(paused, DATE, 2, "online", NOW)).toEqual([]);
    expect(listSlots(paused, DATE, 2, "phone", NOW)).not.toEqual([]);
  });

  it("leaves out seatings inside a closure band", () => {
    const band = withRules({
      id: "b",
      kind: "closure",
      targetKind: "venue",
      startsOn: DATE,
      window: { version: 1, from: 1050, to: 1080 },
    });
    expect(listSlots(band, DATE, 2, "online", NOW).map((s) => s.start.toISOString())).toEqual([
      at("17:00").toISOString(),
      at("18:00").toISOString(),
    ]);
  });

  it("drops blocked tables from a slot", () => {
    const blocked = withRules({
      id: "t",
      kind: "closure",
      targetKind: "tables",
      tableIds: ["t-4"],
      startsOn: DATE,
    });
    const [first] = listSlots(blocked, DATE, 2, "online", NOW);
    expect(first?.tables.map((t) => t.id)).toEqual(["t-2"]);
  });

  it("applies Tonight's lowered pacing", () => {
    const tonight = snapshot({
      config: {
        ...CONFIG,
        dateRules: [
          {
            id: "n",
            kind: "tonight",
            targetKind: "venue",
            startsOn: DATE,
            payload: { version: 1, pacing: { covers: 2 } },
          },
        ],
      },
    });
    expect(listSlots(tonight, DATE, 3, "online", NOW)[0]).toMatchObject({
      available: false,
      reason: "pacing",
    });
  });

  it("skips a seating that falls in a spring-forward gap", () => {
    const spring = snapshot({
      config: {
        ...CONFIG,
        scheduleServices: [
          {
            id: "brunch",
            scheduleId: "regular",
            venueServiceId: "vs-dinner",
            opensAt: 90,
            lastSeatingAt: 210,
            closesAt: 300,
            seating: { version: 1, interval: 30 },
            bookingTypes: ["online"],
          },
        ],
      },
    });
    const starts = listSlots(spring, "2027-03-14", 2, "online", NOW).map((s) =>
      s.start.toISOString()
    );
    // 01:30 PST, then 02:00 and 02:30 don't exist, then 03:00 and 03:30 PDT.
    expect(starts).toEqual([
      "2027-03-14T09:30:00.000Z",
      "2027-03-14T10:00:00.000Z",
      "2027-03-14T10:30:00.000Z",
    ]);
  });
});

describe("judge", () => {
  it("is ok for a listed slot", () => {
    expect(judge(snapshot(), { start: at("17:30"), partySize: 2, channel: "online" }, NOW)).toEqual(
      {
        kind: "ok",
      }
    );
  });

  it("is hard outside every service", () => {
    expect(judge(snapshot(), { start: at("15:00"), partySize: 2, channel: "online" }, NOW)).toEqual(
      {
        kind: "hard",
        reason: "outside_service",
      }
    );
  });

  it("is hard on a closure, with the guest message", () => {
    const closed = withRules({
      id: "c",
      kind: "closure",
      targetKind: "venue",
      startsOn: DATE,
      guestMessage: "Private event tonight.",
    });
    expect(judge(closed, { start: at("17:30"), partySize: 2, channel: "phone" }, NOW)).toEqual({
      kind: "hard",
      reason: "closed",
      message: "Private event tonight.",
    });
  });

  it("is hard when the channel is closed", () => {
    expect(judge(snapshot(), { start: at("23:00"), partySize: 2, channel: "online" }, NOW)).toEqual(
      {
        kind: "hard",
        reason: "booking_closed",
      }
    );
  });

  it("judges a past-midnight booking against the previous service day", () => {
    expect(
      judge(snapshot(), { start: at("00:30", "2026-11-07"), partySize: 2, channel: "phone" }, NOW)
    ).toEqual({ kind: "ok" });
  });

  it("is soft after last seating, and ok with a staff override reason", () => {
    const request = { start: at("19:00"), partySize: 2, channel: "phone" as const };
    expect(judge(snapshot(), request, NOW)).toEqual({
      kind: "soft",
      limits: ["after_last_seating"],
    });
    expect(judge(snapshot(), { ...request, override: { reason: "Regular" } }, NOW)).toEqual({
      kind: "ok_with_override",
      limits: ["after_last_seating"],
    });
    expect(judge(snapshot(), { ...request, override: { reason: "  " } }, NOW).kind).toBe("soft");
  });

  it("is hard online for a minute the listing never offers, but not for phone", () => {
    const off = { start: at("17:10"), partySize: 2 };
    expect(judge(snapshot(), { ...off, channel: "online" }, NOW)).toEqual({
      kind: "hard",
      reason: "outside_service",
    });
    expect(judge(snapshot(), { ...off, channel: "phone" }, NOW)).toEqual({ kind: "ok" });
  });

  it("does not let an online off-grid start step past a pacing window", () => {
    const busy = snapshot({
      settings: { pacingRules: [{ maxCoversPerSlot: 1 }] },
      reservations: [
        {
          id: "r1",
          tableId: "t-4",
          partySize: 2,
          status: "confirmed",
          reservationTime: at("17:00"),
          duration: 90,
        } as never,
      ],
    });
    expect(judge(busy, { start: at("17:01"), partySize: 2, channel: "online" }, NOW)).toEqual({
      kind: "hard",
      reason: "outside_service",
    });
  });

  it("never lets an override past a closure", () => {
    const closed = withRules({ id: "c", kind: "closure", targetKind: "venue", startsOn: DATE });
    expect(
      judge(
        closed,
        { start: at("17:30"), partySize: 2, channel: "phone", override: { reason: "VIP" } },
        NOW
      ).kind
    ).toBe("hard");
  });

  it("is soft when pacing or party size is exceeded", () => {
    const strict = snapshot({
      settings: { pacingRules: [{ maxCoversPerSlot: 1 }], maxPartySize: 1 },
    });
    expect(judge(strict, { start: at("17:00"), partySize: 2, channel: "phone" }, NOW)).toEqual({
      kind: "soft",
      limits: ["pacing", "party_size"],
    });
  });

  it("is hard on a blocked or conflicting requested table", () => {
    const blocked = withRules({
      id: "t",
      kind: "closure",
      targetKind: "tables",
      tableIds: ["t-4"],
      startsOn: DATE,
    });
    expect(
      judge(blocked, { start: at("17:00"), partySize: 2, channel: "phone", tableId: "t-4" }, NOW)
    ).toEqual({ kind: "hard", reason: "table_blocked" });

    const booked = snapshot({
      reservations: [
        { id: "r", tableId: "t-4", startTime: at("17:00"), endTime: at("18:30"), partySize: 4 },
      ],
    });
    expect(
      judge(booked, { start: at("17:30"), partySize: 2, channel: "phone", tableId: "t-4" }, NOW)
    ).toEqual({ kind: "hard", reason: "conflict" });
  });

  it("judges a requested table over the booking's real end, not the estimated one", () => {
    const later = snapshot({
      reservations: [
        { id: "r", tableId: "t-4", startTime: at("18:00"), endTime: at("19:00"), partySize: 2 },
      ],
    });
    const request = { start: at("17:00"), partySize: 2, channel: "phone" as const, tableId: "t-4" };
    expect(judge(later, { ...request, end: at("18:00") }, NOW)).toEqual({ kind: "ok" });
    expect(judge(later, { ...request, end: at("18:15") }, NOW)).toEqual({
      kind: "hard",
      reason: "conflict",
    });
  });

  it("is hard when no suitable table is free", () => {
    const full = snapshot({
      reservations: TABLES.map((t) => ({
        id: `r-${t.id}`,
        tableId: t.id,
        startTime: at("17:00"),
        endTime: at("19:00"),
        partySize: 2,
      })),
    });
    expect(judge(full, { start: at("17:30"), partySize: 2, channel: "online" }, NOW)).toEqual({
      kind: "hard",
      reason: "conflict",
    });
  });
});

describe("listSlots ↔ judge agreement (review follow-ups)", () => {
  it("never lists a seating at or after close", () => {
    const tonight = withRules({
      id: "n",
      kind: "tonight",
      targetKind: "venue",
      startsOn: DATE,
      payload: { version: 1, closeAt: 1050 },
    });
    const starts = listSlots(tonight, DATE, 2, "online", NOW).map((s) => s.minute);
    expect(starts).toEqual([1020]);
    for (const slot of listSlots(tonight, DATE, 2, "online", NOW)) {
      expect(judge(tonight, { start: slot.start, partySize: 2, channel: "online" }, NOW)).toEqual({
        kind: "ok",
      });
    }
  });

  it("drops a last seating equal to close", () => {
    const flush = snapshot({
      config: {
        ...CONFIG,
        scheduleServices: [{ ...CONFIG.scheduleServices[0]!, lastSeatingAt: 1200 }],
      },
    });
    expect(listSlots(flush, DATE, 2, "online", NOW).at(-1)?.minute).toBe(1170);
  });

  it("says booking_closed for a booking-type closure", () => {
    const paused = withRules({
      id: "p",
      kind: "closure",
      targetKind: "booking",
      bookingTypes: ["online"],
      startsOn: DATE,
      guestMessage: "Call us.",
    });
    expect(judge(paused, { start: at("17:30"), partySize: 2, channel: "online" }, NOW)).toEqual({
      kind: "hard",
      reason: "booking_closed",
      message: "Call us.",
    });
  });
});
