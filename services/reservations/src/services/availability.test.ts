import { describe, it, expect, vi, beforeEach } from "vitest";

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

describe("availabilityService.generateTimeSlots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(availableSlot).toBeDefined();
    expect(availableSlot!.tables).toBeDefined();
    expect(availableSlot!.tables!).toHaveLength(1);
    expect(availableSlot!.tables![0].id).toBe("table-1");
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

    const reservationWhere = vi.mocked(prisma.reservation.findMany).mock.calls[0][0] as {
      where: { status: unknown };
    };
    expect(reservationWhere.where.status).toEqual({ notIn: [...NOT_BOOKED_STATUSES] });

    const holdWhere = vi.mocked(prisma.reservationHold.findMany).mock.calls[0][0] as {
      where: { expiresAt: { gt: Date } };
    };
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

    expect(dates[0].hasAvailability).toBe(true);
    expect(dates[0].slotCount).toBeGreaterThan(0);
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
        startTime: new Date("2026-05-05T22:00:00Z"), // 18:00 ET
        endTime: new Date("2026-05-05T23:15:00Z"), // 19:15 ET
        partySize: 2,
      },
      // May 5 — blocks table-2 at 18:00 ET (two reservations on same day)
      {
        id: "res-may5-t2",
        tableId: "table-2",
        startTime: new Date("2026-05-05T22:00:00Z"),
        endTime: new Date("2026-05-05T23:15:00Z"),
        partySize: 2,
      },
      // May 6 — only table-1 blocked
      {
        id: "res-may6-t1",
        tableId: "table-1",
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
        startTime: new Date("2026-05-07T22:00:00Z"),
        endTime: new Date("2026-05-07T23:15:00Z"),
        partySize: 2,
        expiresAt: futureExpiry,
      },
      // May 7 — expired hold on table-2 (must NOT block availability)
      {
        id: "hold-may7-t2-expired",
        tableId: "table-2",
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

    const holdCall = vi.mocked(prisma.reservationHold.findMany).mock.calls[0][0] as {
      where: { venueId: string; expiresAt: { gt: Date } };
    };
    expect(holdCall.where.venueId).toBe(VENUE_ID);
    expect(holdCall.where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("drift test: derives status/expiry filters from the shared slot-rules declaration, not a local literal", async () => {
    vi.mocked(prisma.reservation.findMany).mockResolvedValueOnce([] as never);
    vi.mocked(prisma.reservationHold.findMany).mockResolvedValueOnce([] as never);

    await fetchConflictData(VENUE_ID, "2026-05-05");

    const reservationWhere = vi.mocked(prisma.reservation.findMany).mock.calls[0][0] as {
      where: { status: unknown };
    };
    expect(reservationWhere.where.status).toEqual({ notIn: [...NOT_BOOKED_STATUSES] });

    const holdWhere = vi.mocked(prisma.reservationHold.findMany).mock.calls[0][0] as {
      where: { expiresAt: { gt: Date } };
    };
    expect(holdWhere.where.expiresAt).toEqual(activeHoldWindow(holdWhere.where.expiresAt.gt));
  });
});
