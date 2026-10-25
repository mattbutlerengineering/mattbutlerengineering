import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: {
        findUnique: vi.fn(),
      },
      table: {
        findMany: vi.fn(),
      },
      reservation: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        aggregate: vi.fn(),
      },
      reservationHold: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        aggregate: vi.fn(),
      },
      // Availability rows: none by default, so listing derives the week from the
      // legacy operatingHours column (a venue the backfill has not reached).
      schedule: { findMany: vi.fn() },
      venueService: { findMany: vi.fn() },
      scheduleService: { findMany: vi.fn() },
      scheduleAssignment: { findMany: vi.fn() },
      dateRule: { findMany: vi.fn() },
    },
  });
});

import { availabilityService, fetchConflictData } from "./availability.js";
import { prisma } from "./database.js";
import { NOT_BOOKED_STATUSES, activeHoldWindow } from "./slot-rules.js";

const VENUE_ID = "venue-1";

function makePrismaVenue(overrides: Record<string, unknown> = {}) {
  return {
    id: VENUE_ID,
    name: "Test Restaurant",
    slug: "test-restaurant",
    ianaTimezone: "America/New_York",
    settings: null,
    operatingHours: {
      monday: { open: "11:00", close: "22:00" },
      tuesday: { open: "11:00", close: "22:00" },
      wednesday: { open: "11:00", close: "22:00" },
      thursday: { open: "11:00", close: "22:00" },
      friday: { open: "11:00", close: "23:00" },
      saturday: { open: "10:00", close: "23:00" },
      sunday: { open: "10:00", close: "21:00", closed: true },
    },
    ...overrides,
  };
}

function makePrismaTable(overrides: Record<string, unknown> = {}) {
  return {
    id: "table-1",
    name: "Table 1",
    tableNumber: "1",
    capacity: 4,
    minCovers: 1,
    maxCovers: 6,
    location: "Main Floor",
    isActive: true,
    priority: 5,
    status: "AVAILABLE",
    venueId: VENUE_ID,
    floorPlanId: null,
    shapeMetadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Fixed clock: every date below is relative to this instant, not the wall clock.
const FIXED_NOW = new Date("2026-05-01T12:00:00Z");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const delegate of [
    prisma.schedule,
    prisma.venueService,
    prisma.scheduleService,
    prisma.scheduleAssignment,
    prisma.dateRule,
  ]) {
    vi.mocked(delegate.findMany).mockResolvedValue([] as never);
  }
});
afterEach(() => {
  vi.useRealTimers();
});

describe("availabilityService.generateTimeSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("booking window", () => {
    function stubVenue(settings: Record<string, unknown> | null) {
      vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(
        makePrismaVenue({ settings }) as never
      );
      vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
      vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
      vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);
    }

    it("drops slots already past (now = 18:00 ET, no minAdvance)", async () => {
      vi.setSystemTime(new Date("2026-05-05T22:00:00Z")); // 18:00 ET
      stubVenue(null);

      const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s) => new Date(s.time) >= new Date("2026-05-05T22:00:00Z"))).toBe(true);
      expect(slots[0]?.time).toBe("2026-05-05T22:00:00.000Z");
    });

    it("drops slots before now + minAdvanceBooking hours", async () => {
      vi.setSystemTime(new Date("2026-05-05T22:00:00Z"));
      stubVenue({ minAdvanceBooking: 2 });

      const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

      expect(slots[0]?.time).toBe("2026-05-06T00:00:00.000Z"); // 20:00 ET
    });

    it("returns [] for a date beyond maxAdvanceBooking", async () => {
      stubVenue({ maxAdvanceBooking: 3 }); // today is 2026-05-01 -> latest 05-04

      const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

      expect(slots).toEqual([]);
    });

    it("still offers the last permitted day", async () => {
      stubVenue({ maxAdvanceBooking: 4 });

      const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

      expect(slots.length).toBeGreaterThan(0);
    });
  });

  it("does not offer a 2-top (null maxCovers) to a party of 12", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([
      makePrismaTable({ capacity: 2, minCovers: 1, maxCovers: null }),
    ] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 12);

    expect(slots).toEqual([]);
  });

  it("returns empty array when venue not found", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    expect(slots).toEqual([]);
  });

  it("returns empty array when venue is closed on that day", async () => {
    const allClosed = {
      sunday: { open: "10:00", close: "21:00", closed: true },
      monday: { open: "11:00", close: "22:00", closed: true },
      tuesday: { open: "11:00", close: "22:00", closed: true },
      wednesday: { open: "11:00", close: "22:00", closed: true },
      thursday: { open: "11:00", close: "22:00", closed: true },
      friday: { open: "11:00", close: "23:00", closed: true },
      saturday: { open: "10:00", close: "23:00", closed: true },
    };
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(
      makePrismaVenue({ operatingHours: allClosed }) as never
    );
    // The snapshot loads inventory in the same batch as the hours.
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-04", 2);

    expect(slots).toEqual([]);
  });

  it("returns empty array when no suitable tables exist", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);

    // 2026-05-05 is a Monday
    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    expect(slots).toEqual([]);
  });

  it("generates time slots at 15-minute intervals within operating hours", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    // Monday: 11:00 - 22:00, last seating buffer = 90 min => last seating at 20:30
    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    expect(slots.length).toBeGreaterThan(0);
    // All should be available (no conflicts)
    expect(slots.every((s) => s.available)).toBe(true);

    // First slot should be at 11:00, last at 20:30
    // Total: (20:30 - 11:00) / 15 + 1 = 570/15 + 1 = 39
    expect(slots).toHaveLength(39);
  });

  it("marks slots as unavailable when table has a conflicting reservation", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);

    // One reservation blocking 18:00-19:15
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T22:00:00Z"), // 18:00 ET (UTC-4 in May)
        endTime: new Date("2026-05-05T23:15:00Z"), // 19:15 ET
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    // Some slots should be unavailable due to overlap
    const unavailable = slots.filter((s) => !s.available);
    expect(unavailable.length).toBeGreaterThan(0);
  });

  it("uses custom slot interval from venue settings", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(
      makePrismaVenue({
        settings: { slotIntervalMinutes: 30 },
      }) as never
    );
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    // 30-min intervals: (20:30 - 11:00) / 30 + 1 = 570/30 + 1 = 20
    expect(slots).toHaveLength(20);
  });

  it("respects durationOverride parameter", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);

    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T22:00:00Z"),
        endTime: new Date("2026-05-05T23:00:00Z"),
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    // With 30 min duration, fewer conflicts
    const slotsShort = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2, 30);

    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T22:00:00Z"),
        endTime: new Date("2026-05-05T23:00:00Z"),
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    // With 120 min duration, more conflicts
    const slotsLong = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2, 120);

    const shortUnavailable = slotsShort.filter((s) => !s.available).length;
    const longUnavailable = slotsLong.filter((s) => !s.available).length;
    expect(longUnavailable).toBeGreaterThanOrEqual(shortUnavailable);
  });

  it("includes available tables in slot when tables are free", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    const availableSlot = slots.find((s) => s.available);
    if (!availableSlot) throw new Error("expected an available slot");
    expect(availableSlot.tables).toBeDefined();
    expect(availableSlot.tables).toHaveLength(1);
    const [firstTable] = availableSlot.tables ?? [];
    if (!firstTable) throw new Error("expected at least one table");
    expect(firstTable.id).toBe("table-1");
  });

  it("respects pacing rules when configured", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(
      makePrismaVenue({
        settings: {
          pacingRules: [{ maxCoversPerSlot: 4 }],
        },
      }) as never
    );
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([
      makePrismaTable(),
      makePrismaTable({ id: "table-2", name: "Table 2" }),
    ] as never);

    // Existing reservations that sum to 4 covers in the 11:00 window
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "table-2",
        startTime: new Date("2026-05-05T15:00:00Z"), // 11:00 ET
        endTime: new Date("2026-05-05T16:15:00Z"),
        partySize: 4,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);

    // The 11:00 slot should be unavailable because pacing limit (4) would be exceeded
    // with existing 4 covers + new party of 2 = 6 > 4
    const elevenOClock = slots[0];
    if (!elevenOClock) throw new Error("expected at least one slot");
    expect(elevenOClock.available).toBe(false);
  });
});

describe("availabilityService.getAvailableDates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty unavailable dates when venue not found", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-05",
      "2026-05-07",
      2
    );

    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d) => !d.hasAvailability)).toBe(true);
  });

  it("limits date range to 60 days", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-01-01",
      "2026-12-31",
      2
    );

    expect(dates.length).toBeLessThanOrEqual(61);
  });

  it("drift test: bulk-fetch derives its status/expiry filters from the shared slot-rules declaration", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    await availabilityService.getAvailableDates(VENUE_ID, "2026-05-04", "2026-05-04", 2);

    const reservationWhere = vi.mocked(prisma.reservation.findMany).mock.calls[0]?.[0] as
      { where: { status: unknown } } | undefined;
    if (!reservationWhere) throw new Error("expected a reservation.findMany call");
    expect(reservationWhere.where.status).toEqual({ notIn: [...NOT_BOOKED_STATUSES] });

    const holdWhere = vi.mocked(prisma.reservationHold.findMany).mock.calls[0]?.[0] as
      { where: { expiresAt: { gt: Date } } } | undefined;
    if (!holdWhere) throw new Error("expected a reservationHold.findMany call");
    expect(holdWhere.where.expiresAt).toEqual(activeHoldWindow(holdWhere.where.expiresAt.gt));
  });

  it("marks closed days as unavailable", async () => {
    const allClosed = {
      sunday: { open: "10:00", close: "21:00", closed: true },
      monday: { open: "11:00", close: "22:00", closed: true },
      tuesday: { open: "11:00", close: "22:00", closed: true },
      wednesday: { open: "11:00", close: "22:00", closed: true },
      thursday: { open: "11:00", close: "22:00", closed: true },
      friday: { open: "11:00", close: "23:00", closed: true },
      saturday: { open: "10:00", close: "23:00", closed: true },
    };
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(
      makePrismaVenue({ operatingHours: allClosed }) as never
    );
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    // Bulk-fetch happens before the day loop; provide empty arrays for the date range
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-04",
      "2026-05-04",
      2
    );

    expect(dates[0]!.hasAvailability).toBe(false);
    expect(dates[0]!.slotCount).toBe(0);
  });

  it("returns slot counts for open days", async () => {
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    // 2026-05-05 is Monday in PT (open)
    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-05",
      "2026-05-05",
      2
    );

    const [firstDate] = dates;
    if (!firstDate) throw new Error("expected at least one date");
    expect(firstDate.hasAvailability).toBe(true);
    expect(firstDate.slotCount).toBeGreaterThan(0);
  });

  it("correctly buckets reservations and holds by date across a multi-day range", async () => {
    // 2026-05-05 (Mon), 2026-05-06 (Tue), 2026-05-07 (Wed) — all open days
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([
      makePrismaTable({ id: "table-1" }),
      makePrismaTable({ id: "table-2", name: "Table 2" }),
    ] as never);

    // May 5: two reservations blocking BOTH tables from 18:00–19:15 ET (22:00–23:15 UTC)
    // May 6: one reservation blocking table-1, table-2 still free
    // May 7: one active hold blocking table-1, table-2 still free
    // May 7: an EXPIRED hold on table-2 — should be ignored
    const futureExpiry = new Date(Date.now() + 600_000);
    const pastExpiry = new Date(Date.now() - 1000);

    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      // May 5 — blocks table-1 at 18:00 ET
      {
        id: "res-may5-t1",
        tableId: "table-1",
        date: new Date("2026-05-05"),
        startTime: new Date("2026-05-05T22:00:00Z"), // 18:00 ET
        endTime: new Date("2026-05-05T23:15:00Z"), // 19:15 ET
        partySize: 2,
      },
      // May 5 — blocks table-2 at 18:00 ET (two reservations on same day)
      {
        id: "res-may5-t2",
        tableId: "table-2",
        date: new Date("2026-05-05"),
        startTime: new Date("2026-05-05T22:00:00Z"),
        endTime: new Date("2026-05-05T23:15:00Z"),
        partySize: 2,
      },
      // May 6 — only table-1 blocked
      {
        id: "res-may6-t1",
        tableId: "table-1",
        date: new Date("2026-05-06"),
        startTime: new Date("2026-05-06T22:00:00Z"),
        endTime: new Date("2026-05-06T23:15:00Z"),
        partySize: 2,
      },
    ] as never);

    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([
      // May 7 — active hold on table-1
      {
        id: "hold-may7-t1",
        tableId: "table-1",
        date: new Date("2026-05-07"),
        startTime: new Date("2026-05-07T22:00:00Z"),
        endTime: new Date("2026-05-07T23:15:00Z"),
        partySize: 2,
        expiresAt: futureExpiry,
      },
      // May 7 — expired hold on table-2 (must NOT block availability)
      {
        id: "hold-may7-t2-expired",
        tableId: "table-2",
        date: new Date("2026-05-07"),
        startTime: new Date("2026-05-07T22:00:00Z"),
        endTime: new Date("2026-05-07T23:15:00Z"),
        partySize: 2,
        expiresAt: pastExpiry,
      },
    ] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-05",
      "2026-05-07",
      2
    );

    expect(dates).toHaveLength(3);

    const [may5, may6, may7] = dates as [(typeof dates)[0], (typeof dates)[0], (typeof dates)[0]];

    // May 5: both tables blocked at 18:00, but OTHER slots remain available
    // (reservation only covers one slot window, not the whole day)
    expect(may5.date).toBe("2026-05-05");
    expect(may5.hasAvailability).toBe(true);
    expect(may5.slotCount).toBeGreaterThan(0);

    // May 6: table-1 blocked at 18:00, table-2 still free — plenty of available slots
    expect(may6.date).toBe("2026-05-06");
    expect(may6.hasAvailability).toBe(true);
    // table-2 is free, so May 6 must have at least as many or more available slots than May 5
    // (May 5 has both tables blocked at 18:00 vs May 6 only one)
    expect(may6.slotCount).toBeGreaterThanOrEqual(may5.slotCount!);

    // May 7: active hold on table-1 at 18:00, expired hold on table-2 is ignored →
    // table-2 is fully free, so same pattern as May 6
    expect(may7.date).toBe("2026-05-07");
    expect(may7.hasAvailability).toBe(true);
    // May 7 has only one table blocked (active hold) and one fully free,
    // matching May 6's pattern — slot counts should be equal
    expect(may7.slotCount).toBe(may6.slotCount!);

    // Critical bucketing correctness: May 5 reservations must NOT bleed into May 6/7
    // and May 6 reservation must NOT affect May 7.
    // We verify this indirectly: if bucketing were wrong, May 6/7 would show fewer
    // available slots than expected (May 5's reservations would pollute them).
    // The equality assertion above catches cross-day leakage.
  });

  it("buckets a reservation crossing the UTC day boundary by its venue-local date, not the next UTC day", async () => {
    // Venue is America/New_York (UTC-4 in May). A 22:00 ET Friday reservation
    // is a 2026-05-09T02:00Z instant — a UTC calendar day later than the
    // reservation's own `date` column (2026-05-08). Bucketing by `startTime`
    // (the bug) files it under "2026-05-09" instead of "2026-05-08", so it
    // never shows up as a conflict on the day it actually belongs to.
    vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue() as never);
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-crossing",
        tableId: "table-1",
        date: new Date("2026-05-08"),
        startTime: new Date("2026-05-09T02:00:00Z"), // 22:00 ET Friday May 8
        endTime: new Date("2026-05-09T03:15:00Z"), // 23:15 ET Friday May 8
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-08",
      "2026-05-08",
      2
    );

    // Friday 11:00-23:00, 90-min last-seating buffer, 75-min duration for a
    // party of 2 => 43 total slots, 3 of which (21:00/21:15/21:30 ET) overlap
    // the 22:00-23:15 ET reservation. Bucketing by `startTime` (the bug)
    // leaves May 8 at the full 43 (no conflict counted) — this assertion
    // fails against main.
    expect(dates[0]!.date).toBe("2026-05-08");
    expect(dates[0]!.slotCount).toBe(40);
  });

  it("agrees with generateTimeSlots on a crossing-midnight date instead of contradicting it", async () => {
    // A venue open only in the late evening, so a single crossing-midnight
    // reservation covers every generated slot for the day. If getAvailableDates
    // mis-buckets that reservation into the next UTC day (the bug), it reports
    // the day as available while generateTimeSlots — which filters correctly by
    // the `date` column — reports every slot booked. That contradiction is
    // exactly what a real date picker vs. slot list disagreement looks like.
    const eveningOnlyHours = {
      sunday: { open: "10:00", close: "21:00" },
      monday: { open: "11:00", close: "22:00" },
      tuesday: { open: "11:00", close: "22:00" },
      wednesday: { open: "11:00", close: "22:00" },
      thursday: { open: "11:00", close: "22:00" },
      friday: { open: "20:15", close: "23:45" },
      saturday: { open: "10:00", close: "23:00" },
    };
    const venue = makePrismaVenue({ operatingHours: eveningOnlyHours });
    const table = makePrismaTable();
    const crossingReservation = {
      id: "res-crossing-full-day",
      tableId: "table-1",
      date: new Date("2026-05-08"),
      startTime: new Date("2026-05-09T00:15:00Z"), // 20:15 ET Friday May 8 (venue open)
      endTime: new Date("2026-05-09T03:30:00Z"), // 23:30 ET Friday May 8 (venue close)
      partySize: 2,
    };

    vi.mocked(prisma.venue.findUnique).mockResolvedValue(venue as never);
    vi.mocked(prisma.table.findMany).mockResolvedValue([table] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValue([crossingReservation] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValue([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-08", 2);
    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-08",
      "2026-05-08",
      2
    );

    const anySlotAvailable = slots.some((s) => s.available);
    expect(slots.length).toBeGreaterThan(0);
    expect(anySlotAvailable).toBe(false); // generateTimeSlots: the whole day is booked
    // getAvailableDates must not contradict generateTimeSlots for the same
    // venue/date/party-size — this fails against main, which reports true.
    expect(dates[0]!.hasAvailability).toBe(anySlotAvailable);
  });

  it("agrees with generateTimeSlots when pacing rejects every slot (#5096)", async () => {
    // maxCoversPerSlot: 1 with no existing reservations/holds means a party
    // of 2 always exceeds pacing, for every slot, regardless of time —
    // generateTimeSlots marks every slot unavailable on pacing grounds even
    // though table conflict checks alone would pass. getAvailableDates (the
    // bug) doesn't apply checkPacingForSlot at all, so it reports the date as
    // available with a full slot count — a contradiction of the same class
    // #5000 fixed for UTC-day bucketing.
    const venue = makePrismaVenue({ settings: { pacingRules: [{ maxCoversPerSlot: 1 }] } });
    const table = makePrismaTable();

    vi.mocked(prisma.venue.findUnique).mockResolvedValue(venue as never);
    vi.mocked(prisma.table.findMany).mockResolvedValue([table] as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValue([] as never);

    const slots = await availabilityService.generateTimeSlots(VENUE_ID, "2026-05-05", 2);
    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-05",
      "2026-05-05",
      2
    );

    const anySlotAvailable = slots.some((s) => s.available);
    expect(slots.length).toBeGreaterThan(0);
    expect(anySlotAvailable).toBe(false); // generateTimeSlots: pacing rejects every slot
    // getAvailableDates must not contradict generateTimeSlots for the same
    // venue/date/party-size — this fails against main, which reports true.
    expect(dates[0]!.hasAvailability).toBe(anySlotAvailable);
    expect(dates[0]!.slotCount).toBe(0);
  });

  it("loads one snapshot for the whole range, not one per date", async () => {
    stubOpenVenue();

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-04",
      "2026-06-02",
      2
    );

    expect(dates).toHaveLength(30);
    expect(prisma.venue.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.reservation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.reservationHold.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.dateRule.findMany).toHaveBeenCalledTimes(1);
  });

  it("carries a closure message on a closed date only", async () => {
    stubOpenVenue();
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      closureRow({ guestMessage: "Closed for a private event" }),
    ] as never);

    const dates = await availabilityService.getAvailableDates(
      VENUE_ID,
      "2026-05-05",
      "2026-05-06",
      2
    );

    expect(dates[0]).toEqual({
      date: "2026-05-05",
      hasAvailability: false,
      slotCount: 0,
      closure: { message: "Closed for a private event" },
    });
    expect(dates[1]).not.toHaveProperty("closure");
    expect(dates[1]!.hasAvailability).toBe(true);
  });
});

function stubOpenVenue(overrides: Record<string, unknown> = {}) {
  vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce(makePrismaVenue(overrides) as never);
  vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);
  vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
  vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);
}

/** A `date_rules` row as Prisma returns it: a whole-venue closure of 2026-05-05. */
function closureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-closed",
    kind: "closure",
    targetKind: "venue",
    venueServiceId: null,
    bookingTypes: [],
    startsOn: new Date("2026-05-05T00:00:00Z"),
    endsOn: new Date("2026-05-05T00:00:00Z"),
    repeat: null,
    window: null,
    payload: {},
    useScheduleId: null,
    seriesId: null,
    guestMessage: null,
    staffNote: null,
    expiresAt: null,
    tables: [],
    ...overrides,
  };
}

describe("availabilityService.getDayAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the slots with no notice on an open date", async () => {
    stubOpenVenue();

    const day = await availabilityService.getDayAvailability(VENUE_ID, "2026-05-05", 2);

    expect(day.slots).toHaveLength(39);
    expect(day).not.toHaveProperty("closure");
    expect(day).not.toHaveProperty("bookingPaused");
  });

  it("returns no slots and the closure message on a closed date", async () => {
    stubOpenVenue();
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      closureRow({ guestMessage: "Burst pipe" }),
    ] as never);

    const day = await availabilityService.getDayAvailability(VENUE_ID, "2026-05-05", 2);

    expect(day).toEqual({ slots: [], closure: { message: "Burst pipe" } });
  });

  it("returns the booking pause with the venue phone while phone booking is open", async () => {
    stubOpenVenue({ settings: { phone: "(555) 123-4567" } });
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      closureRow({ targetKind: "booking", bookingTypes: ["online"], endsOn: null }),
    ] as never);

    const day = await availabilityService.getDayAvailability(VENUE_ID, "2026-05-05", 2);

    expect(day).toEqual({
      slots: [],
      bookingPaused: { message: "Online booking is paused right now.", phone: "(555) 123-4567" },
    });
  });

  it("reads the availability rows, not the legacy column, once they exist", async () => {
    // Rows say Tuesday 17:00-19:00 at 60 minutes; the legacy column says 11:00-22:00.
    stubOpenVenue();
    vi.mocked(prisma.schedule.findMany).mockResolvedValueOnce([
      {
        id: "s1",
        venueId: VENUE_ID,
        name: "Regular week",
        kind: "regular",
        isRegular: true,
        archivedAt: null,
      },
    ] as never);
    vi.mocked(prisma.venueService.findMany).mockResolvedValueOnce([
      { id: "vs1", venueId: VENUE_ID, name: "Dinner", position: 0, archivedAt: null },
    ] as never);
    vi.mocked(prisma.scheduleService.findMany).mockResolvedValueOnce([
      {
        id: "ss1",
        venueId: VENUE_ID,
        scheduleId: "s1",
        venueServiceId: "vs1",
        opensAt: 1020,
        lastSeatingAt: 1140,
        closesAt: 1200,
        seating: { version: 1, interval: 60 },
        bookingTypes: ["online", "phone"],
        rules: {},
      },
    ] as never);
    vi.mocked(prisma.scheduleAssignment.findMany).mockResolvedValueOnce([
      {
        id: "a1",
        venueId: VENUE_ID,
        scheduleId: "s1",
        weekdays: [2],
        startsOn: null,
        endsOn: null,
        precedence: 0,
      },
    ] as never);

    const day = await availabilityService.getDayAvailability(VENUE_ID, "2026-05-05", 2);

    expect(day.slots.map((s) => s.time)).toEqual([
      "2026-05-05T21:00:00.000Z",
      "2026-05-05T22:00:00.000Z",
      "2026-05-05T23:00:00.000Z",
    ]);
  });

  it("is closed, and logs a warning, when the legacy hours cannot be read", async () => {
    stubOpenVenue({ operatingHours: { version: 7 } });
    const logger = { warn: vi.fn() };

    const day = await availabilityService.getDayAvailability(VENUE_ID, "2026-05-05", 2, undefined, {
      logger,
    });

    expect(day).toEqual({ slots: [] });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ table: "venues", id: VENUE_ID }),
      "availability_snapshot_row_invalid"
    );
  });
});

describe("availabilityService.findBestTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns best-fit table (highest priority, smallest capacity)", async () => {
    const tables = [
      makePrismaTable({ id: "t-small", capacity: 2, priority: 10 }),
      makePrismaTable({ id: "t-large", capacity: 8, priority: 5 }),
    ];
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce(tables as never);
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    const result = await availabilityService.findBestTable(VENUE_ID, "2026-05-05", start, end, 2);

    expect(result).not.toBeNull();
    expect(result!.id).toBe("t-small");
  });

  it("skips tables with conflicting reservations", async () => {
    const tables = [
      makePrismaTable({ id: "t-booked", priority: 10 }),
      makePrismaTable({ id: "t-free", priority: 5 }),
    ];
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce(tables as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "t-booked",
        startTime: new Date("2026-05-05T17:30:00Z"),
        endTime: new Date("2026-05-05T19:00:00Z"),
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const result = await availabilityService.findBestTable(VENUE_ID, "2026-05-05", start, end, 2);

    expect(result!.id).toBe("t-free");
  });

  it("returns null when all tables are booked", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([
      {
        id: "res-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T17:30:00Z"),
        endTime: new Date("2026-05-05T19:30:00Z"),
        partySize: 2,
      },
    ] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    const result = await availabilityService.findBestTable(VENUE_ID, "2026-05-05", start, end, 2);

    expect(result).toBeNull();
  });

  it("skips tables with conflicting holds", async () => {
    vi.mocked(prisma.table.findMany).mockResolvedValueOnce([makePrismaTable()] as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([
      {
        id: "hold-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T17:45:00Z"),
        endTime: new Date("2026-05-05T19:00:00Z"),
        partySize: 2,
        expiresAt: new Date(Date.now() + 300_000), // not expired
      },
    ] as never);

    const result = await availabilityService.findBestTable(VENUE_ID, "2026-05-05", start, end, 2);

    expect(result).toBeNull();
  });
});

describe("fetchConflictData", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns reservations and holds for the date", async () => {
    const reservations = [
      {
        id: "res-1",
        tableId: "table-1",
        startTime: new Date("2026-05-05T18:00:00Z"),
        endTime: new Date("2026-05-05T19:30:00Z"),
        partySize: 2,
      },
    ];
    const holds = [
      {
        id: "hold-1",
        tableId: "table-2",
        startTime: new Date("2026-05-05T18:00:00Z"),
        endTime: new Date("2026-05-05T19:30:00Z"),
        partySize: 4,
        expiresAt: new Date(Date.now() + 300_000),
      },
    ];
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce(reservations as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce(holds as never);

    const result = await fetchConflictData(VENUE_ID, "2026-05-05");

    expect(result.reservations).toEqual(reservations);
    expect(result.holds).toEqual(holds);
  });

  it("filters reservations by venue, date and active status", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    await fetchConflictData(VENUE_ID, "2026-05-05");

    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          venueId: VENUE_ID,
          date: new Date("2026-05-05"),
          status: { notIn: ["CANCELLED", "NO_SHOW"] },
        }),
      })
    );
  });

  it("filters holds to only active (non-expired) ones", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    await fetchConflictData(VENUE_ID, "2026-05-05");

    const holdCall = vi.mocked(prisma.reservationHold.findMany).mock.calls[0]?.[0] as
      { where: { venueId: string; expiresAt: { gt: Date } } } | undefined;
    if (!holdCall) throw new Error("expected a reservationHold.findMany call");
    expect(holdCall.where.venueId).toBe(VENUE_ID);
    expect(holdCall.where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("drift test: derives status/expiry filters from the shared slot-rules declaration, not a local literal", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    await fetchConflictData(VENUE_ID, "2026-05-05");

    const reservationWhere = vi.mocked(prisma.reservation.findMany).mock.calls[0]?.[0] as
      { where: { status: unknown } } | undefined;
    if (!reservationWhere) throw new Error("expected a reservation.findMany call");
    expect(reservationWhere.where.status).toEqual({ notIn: [...NOT_BOOKED_STATUSES] });

    const holdWhere = vi.mocked(prisma.reservationHold.findMany).mock.calls[0]?.[0] as
      { where: { expiresAt: { gt: Date } } } | undefined;
    if (!holdWhere) throw new Error("expected a reservationHold.findMany call");
    expect(holdWhere.where.expiresAt).toEqual(activeHoldWindow(holdWhere.where.expiresAt.gt));
  });
});
