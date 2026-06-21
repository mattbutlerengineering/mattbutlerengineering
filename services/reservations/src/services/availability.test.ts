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

import {
  availabilityService,
  estimateDuration,
  parseOperatingHours,
  filterSuitableTables,
  checkTableConflict,
  checkPacingForSlot,
  fetchConflictData,
  selectBestTable,
  type ReservationSlim,
  type HoldSlim,
  type TableCandidate,
  type TableFilter,
} from "./availability.js";
import { prisma } from "./database.js";

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

describe("estimateDuration", () => {
  it("returns 75 minutes for party of 1-2 (default rules)", () => {
    expect(estimateDuration(1)).toBe(75);
    expect(estimateDuration(2)).toBe(75);
  });

  it("returns 90 minutes for party of 3-4 (default rules)", () => {
    expect(estimateDuration(3)).toBe(90);
    expect(estimateDuration(4)).toBe(90);
  });

  it("returns 105 minutes for party of 5-6 (default rules)", () => {
    expect(estimateDuration(5)).toBe(105);
    expect(estimateDuration(6)).toBe(105);
  });

  it("returns 120 minutes for party of 7-10 (default rules)", () => {
    expect(estimateDuration(7)).toBe(120);
    expect(estimateDuration(10)).toBe(120);
  });

  it("extrapolates for parties larger than rules cover", () => {
    const duration = estimateDuration(12);
    // maxPartySize in default rules = 10, extra = 2, ceil(2/2)*15 = 15
    expect(duration).toBe(120 + 15);
  });

  it("extrapolates correctly for odd extra guests", () => {
    const duration = estimateDuration(11);
    // extra = 1, ceil(1/2)*15 = 15
    expect(duration).toBe(120 + 15);
  });

  it("uses venue-specific duration rules when provided", () => {
    const settings = {
      durationRules: [
        { minPartySize: 1, maxPartySize: 4, durationMinutes: 60 },
        { minPartySize: 5, maxPartySize: 8, durationMinutes: 90 },
      ],
    };
    expect(estimateDuration(2, settings)).toBe(60);
    expect(estimateDuration(6, settings)).toBe(90);
  });

  it("falls back to defaultReservationDuration when no rule matches", () => {
    const settings = {
      durationRules: [{ minPartySize: 1, maxPartySize: 2, durationMinutes: 60 }],
      defaultReservationDuration: 120,
    };
    expect(estimateDuration(8, settings)).toBe(120);
  });

  it("extrapolates from venue rules when no default and no match", () => {
    const settings = {
      durationRules: [{ minPartySize: 1, maxPartySize: 4, durationMinutes: 60 }],
    };
    // party 6, max = 4, extra = 2, ceil(2/2)*15 = 15
    expect(estimateDuration(6, settings)).toBe(60 + 15);
  });
});

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

describe("checkTableConflict (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const end = new Date("2026-05-05T19:15:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: new Date("2026-05-05T18:30:00Z"),
      endTime: new Date("2026-05-05T20:00:00Z"),
      partySize: 2,
      ...overrides,
    };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-1",
      startTime: new Date("2026-05-05T18:30:00Z"),
      endTime: new Date("2026-05-05T20:00:00Z"),
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  it("returns false when no reservations or holds", () => {
    expect(checkTableConflict("table-1", start, end, [], [])).toBe(false);
  });

  it("returns true for an overlapping reservation on the same table", () => {
    expect(checkTableConflict("table-1", start, end, [makeReservation()], [])).toBe(true);
  });

  it("ignores reservations on a different table", () => {
    expect(
      checkTableConflict("table-1", start, end, [makeReservation({ tableId: "table-2" })], [])
    ).toBe(false);
  });

  it("treats abutting reservation that ends exactly at start as no conflict (boundary)", () => {
    const res = makeReservation({
      startTime: new Date("2026-05-05T16:00:00Z"),
      endTime: start, // ends exactly when the requested slot starts
    });
    expect(checkTableConflict("table-1", start, end, [res], [])).toBe(false);
  });

  it("treats reservation that starts exactly at end as no conflict (boundary)", () => {
    const res = makeReservation({
      startTime: end, // starts exactly when the requested slot ends
      endTime: new Date("2026-05-05T21:00:00Z"),
    });
    expect(checkTableConflict("table-1", start, end, [res], [])).toBe(false);
  });

  it("returns true for an overlapping active hold", () => {
    expect(checkTableConflict("table-1", start, end, [], [makeHold()])).toBe(true);
  });

  it("ignores an expired hold even when it overlaps", () => {
    const expired = makeHold({ expiresAt: new Date(Date.now() - 1000) });
    expect(checkTableConflict("table-1", start, end, [], [expired])).toBe(false);
  });

  it("ignores a hold on a different table", () => {
    expect(checkTableConflict("table-1", start, end, [], [makeHold({ tableId: "table-2" })])).toBe(
      false
    );
  });
});

describe("checkPacingForSlot (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: start,
      endTime: new Date("2026-05-05T19:30:00Z"),
      partySize: 4,
      ...overrides,
    };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-2",
      startTime: start,
      endTime: new Date("2026-05-05T19:30:00Z"),
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  it("returns true when no pacing rules configured", () => {
    expect(checkPacingForSlot(start, 4, null, [makeReservation()], [])).toBe(true);
    expect(checkPacingForSlot(start, 4, undefined, [makeReservation()], [])).toBe(true);
    expect(checkPacingForSlot(start, 4, { pacingRules: [] }, [makeReservation()], [])).toBe(true);
  });

  it("returns true when covers within limit", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 10 }] };
    // existing 4 + new 2 = 6 <= 10
    expect(checkPacingForSlot(start, 2, settings, [makeReservation()], [])).toBe(true);
  });

  it("returns false when covers exceed limit", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4 }] };
    // existing 4 + new 2 = 6 > 4
    expect(checkPacingForSlot(start, 2, settings, [makeReservation()], [])).toBe(false);
  });

  it("counts active holds toward the pacing total", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 5 }] };
    // reservation 4 + hold 2 + new 0... use party 1: 4 + 2 + 1 = 7 > 5
    expect(checkPacingForSlot(start, 1, settings, [makeReservation()], [makeHold()])).toBe(false);
  });

  it("excludes expired holds from the pacing total", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 5 }] };
    const expired = makeHold({ expiresAt: new Date(Date.now() - 1000), partySize: 4 });
    // reservation 4 + new 1 = 5 <= 5 (expired hold ignored)
    expect(checkPacingForSlot(start, 1, settings, [makeReservation()], [expired])).toBe(true);
  });

  it("only counts reservations starting within the time window", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    // This reservation starts 30 min after window start — outside the 15-min window
    const outside = makeReservation({
      startTime: new Date("2026-05-05T18:30:00Z"),
      partySize: 4,
    });
    expect(checkPacingForSlot(start, 2, settings, [outside], [])).toBe(true);
  });

  it("counts a reservation starting exactly at window start (inclusive lower bound)", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    const atStart = makeReservation({ startTime: start, partySize: 4 });
    // 4 + new 1 = 5 > 4
    expect(checkPacingForSlot(start, 1, settings, [atStart], [])).toBe(false);
  });

  it("excludes a reservation starting exactly at window end (exclusive upper bound)", () => {
    const settings = { pacingRules: [{ maxCoversPerSlot: 4, timeWindowMinutes: 15 }] };
    const atEnd = makeReservation({
      startTime: new Date(start.getTime() + 15 * 60 * 1000),
      partySize: 4,
    });
    expect(checkPacingForSlot(start, 2, settings, [atEnd], [])).toBe(true);
  });
});

describe("selectBestTable (pure)", () => {
  const start = new Date("2026-05-05T18:00:00Z");
  const end = new Date("2026-05-05T19:15:00Z");
  const future = new Date(Date.now() + 300_000);

  function makeCandidate(overrides: Partial<TableCandidate> = {}): TableCandidate {
    return {
      id: "table-1",
      capacity: 4,
      priority: 5,
      ...overrides,
    };
  }

  function makeHold(overrides: Partial<HoldSlim> = {}): HoldSlim {
    return {
      id: "hold-1",
      tableId: "table-1",
      startTime: start,
      endTime: end,
      partySize: 2,
      expiresAt: future,
      ...overrides,
    };
  }

  function makeReservation(overrides: Partial<ReservationSlim> = {}): ReservationSlim {
    return {
      id: "res-1",
      tableId: "table-1",
      startTime: start,
      endTime: end,
      partySize: 2,
      ...overrides,
    };
  }

  it("returns null when no candidates provided", () => {
    expect(selectBestTable([], start, end, [], [])).toBeNull();
  });

  it("returns the single candidate when it has no conflicts", () => {
    const table = makeCandidate({ id: "t-1" });
    expect(selectBestTable([table], start, end, [], [])).toBe(table);
  });

  it("returns null when only candidate has a conflicting reservation", () => {
    const table = makeCandidate({ id: "table-1" });
    const res = makeReservation({ tableId: "table-1" });
    expect(selectBestTable([table], start, end, [res], [])).toBeNull();
  });

  it("returns null when only candidate has a conflicting active hold", () => {
    const table = makeCandidate({ id: "table-1" });
    const hold = makeHold({ tableId: "table-1" });
    expect(selectBestTable([table], start, end, [], [hold])).toBeNull();
  });

  it("exact-fit: returns the single exact-capacity table when it fits", () => {
    // party size is implicit from the conflict data — the function just picks first conflict-free
    const table = makeCandidate({ id: "t-exact", capacity: 2 });
    expect(selectBestTable([table], start, end, [], [])).toBe(table);
  });

  it("priority tie: when two tables have same priority, selects smaller capacity first", () => {
    // Caller must pass tables pre-sorted (priority desc, capacity asc) — pure fn just takes first free
    const small = makeCandidate({ id: "t-small", capacity: 2, priority: 5 });
    const large = makeCandidate({ id: "t-large", capacity: 8, priority: 5 });
    // pre-sorted: small first (capacity asc when priority equal)
    const result = selectBestTable([small, large], start, end, [], []);
    expect(result!.id).toBe("t-small");
  });

  it("capacity tie: when two tables have same capacity, selects higher priority first", () => {
    const high = makeCandidate({ id: "t-high", capacity: 4, priority: 10 });
    const low = makeCandidate({ id: "t-low", capacity: 4, priority: 3 });
    // pre-sorted: high priority first
    const result = selectBestTable([high, low], start, end, [], []);
    expect(result!.id).toBe("t-high");
  });

  it("skips booked tables and returns the next conflict-free one", () => {
    const booked = makeCandidate({ id: "table-1", priority: 10 });
    const free = makeCandidate({ id: "t-free", priority: 5 });
    const res = makeReservation({ tableId: "table-1" });
    const result = selectBestTable([booked, free], start, end, [res], []);
    expect(result!.id).toBe("t-free");
  });

  it("no-fit: returns null when all candidates conflict", () => {
    const t1 = makeCandidate({ id: "table-1" });
    const t2 = makeCandidate({ id: "table-2" });
    const res1 = makeReservation({ tableId: "table-1" });
    const res2 = makeReservation({ id: "res-2", tableId: "table-2" });
    expect(selectBestTable([t1, t2], start, end, [res1, res2], [])).toBeNull();
  });

  it("ignores expired holds — expired-hold table is still selectable", () => {
    const table = makeCandidate({ id: "table-1" });
    const expiredHold = makeHold({ expiresAt: new Date(Date.now() - 1000) });
    expect(selectBestTable([table], start, end, [], [expiredHold])).toBe(table);
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
});

describe("parseOperatingHours (pure)", () => {
  // Dates chosen so new Date(str).getUTCDay() is the intended weekday (timezone-stable):
  //   2026-05-04 = Mon, 2026-05-08 = Fri, 2026-05-09 = Sat, 2026-05-10 = Sun
  const openHours = {
    monday: { open: "11:00", close: "22:00" },
    tuesday: { open: "11:00", close: "22:00" },
    wednesday: { open: "11:00", close: "22:00" },
    thursday: { open: "11:00", close: "22:00" },
    friday: { open: "11:00", close: "23:00" },
    saturday: { open: "10:00", close: "23:00" },
    sunday: { open: "10:00", close: "21:00" },
  };

  it("returns the schedule for an open weekday (Monday = 2026-05-04)", () => {
    const result = parseOperatingHours(openHours, "2026-05-04");
    expect(result).not.toBeNull();
    expect(result!.open).toBe("11:00");
    expect(result!.close).toBe("22:00");
  });

  it("returns null when operatingHours is null", () => {
    expect(parseOperatingHours(null, "2026-05-04")).toBeNull();
  });

  it("returns null for a day marked closed: true", () => {
    const withClosedSunday = {
      ...openHours,
      sunday: { open: "10:00", close: "21:00", closed: true },
    };
    // 2026-05-10 = Sunday (getUTCDay()=0)
    expect(parseOperatingHours(withClosedSunday, "2026-05-10")).toBeNull();
  });

  it("returns null when the day has no schedule entry", () => {
    // Only Monday in the schedule; Sunday (2026-05-10) has no entry
    const noSunday = { monday: openHours.monday };
    expect(parseOperatingHours(noSunday, "2026-05-10")).toBeNull();
  });

  it("returns Friday schedule for a Friday date (2026-05-08)", () => {
    // 2026-05-08 = Friday (getUTCDay()=5)
    const result = parseOperatingHours(openHours, "2026-05-08");
    expect(result).not.toBeNull();
    expect(result!.close).toBe("23:00");
  });

  it("returns Saturday schedule for a Saturday date (2026-05-09)", () => {
    // 2026-05-09 = Saturday (getUTCDay()=6)
    const result = parseOperatingHours(openHours, "2026-05-09");
    expect(result).not.toBeNull();
    expect(result!.open).toBe("10:00");
  });
});

describe("filterSuitableTables (pure)", () => {
  function makeTable(overrides: Partial<TableFilter> = {}): TableFilter {
    return {
      id: "table-1",
      capacity: 4,
      minCovers: 1,
      maxCovers: 6,
      isActive: true,
      ...overrides,
    };
  }

  it("returns tables where partySize fits within minCovers..maxCovers", () => {
    const tables = [
      makeTable({ id: "t-2", minCovers: 1, maxCovers: 2 }),
      makeTable({ id: "t-4", minCovers: 1, maxCovers: 4 }),
      makeTable({ id: "t-6", minCovers: 1, maxCovers: 6 }),
    ];
    const result = filterSuitableTables(tables, 3);
    expect(result.map((t) => t.id)).toEqual(["t-4", "t-6"]);
  });

  it("excludes inactive tables", () => {
    const tables = [
      makeTable({ id: "active", isActive: true }),
      makeTable({ id: "inactive", isActive: false }),
    ];
    const result = filterSuitableTables(tables, 2);
    expect(result.map((t) => t.id)).toEqual(["active"]);
  });

  it("excludes tables where partySize < minCovers", () => {
    const tables = [makeTable({ minCovers: 4, maxCovers: 8 })];
    expect(filterSuitableTables(tables, 2)).toEqual([]);
  });

  it("excludes tables where partySize > maxCovers", () => {
    const tables = [makeTable({ minCovers: 1, maxCovers: 3 })];
    expect(filterSuitableTables(tables, 4)).toEqual([]);
  });

  it("includes tables where maxCovers is null (no upper limit)", () => {
    const tables = [makeTable({ minCovers: 1, maxCovers: null })];
    expect(filterSuitableTables(tables, 10)).toHaveLength(1);
  });

  it("returns empty array when no tables provided", () => {
    expect(filterSuitableTables([], 2)).toEqual([]);
  });

  it("exact fit: includes table where partySize equals maxCovers", () => {
    const tables = [makeTable({ minCovers: 1, maxCovers: 4 })];
    expect(filterSuitableTables(tables, 4)).toHaveLength(1);
  });

  it("exact fit: includes table where partySize equals minCovers", () => {
    const tables = [makeTable({ minCovers: 2, maxCovers: 4 })];
    expect(filterSuitableTables(tables, 2)).toHaveLength(1);
  });
});
