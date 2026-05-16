import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./database.js", () => ({
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
}));

import { availabilityService, estimateDuration } from "./availability.js";
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
        endTime: new Date("2026-05-05T23:15:00Z"),   // 19:15 ET
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
    const slotsShort = await availabilityService.generateTimeSlots(
      VENUE_ID,
      "2026-05-05",
      2,
      30
    );

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
    const slotsLong = await availabilityService.generateTimeSlots(
      VENUE_ID,
      "2026-05-05",
      2,
      120
    );

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

describe("availabilityService.checkConflict", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no conflict when table is free", async () => {
    vi.mocked(prisma.reservation.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce(null as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    const result = await availabilityService.checkConflict("table-1", "2026-05-05", start, end);

    expect(result.hasConflict).toBe(false);
  });

  it("detects conflicting reservation", async () => {
    vi.mocked(prisma.reservation.findFirst).mockResolvedValueOnce({ id: "res-conflict" } as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    const result = await availabilityService.checkConflict("table-1", "2026-05-05", start, end);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictingReservationId).toBe("res-conflict");
  });

  it("detects conflicting hold", async () => {
    vi.mocked(prisma.reservation.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce({ id: "hold-conflict" } as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    const result = await availabilityService.checkConflict("table-1", "2026-05-05", start, end);

    expect(result.hasConflict).toBe(true);
    expect(result.conflictingHoldId).toBe("hold-conflict");
  });

  it("excludes specified reservation from conflict check", async () => {
    vi.mocked(prisma.reservation.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce(null as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    await availabilityService.checkConflict(
      "table-1",
      "2026-05-05",
      start,
      end,
      "res-self"
    );

    expect(prisma.reservation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "res-self" },
        }),
      })
    );
  });

  it("excludes specified hold from conflict check", async () => {
    vi.mocked(prisma.reservation.findFirst).mockResolvedValueOnce(null as never);
    vi.mocked(prisma.reservationHold.findFirst).mockResolvedValueOnce(null as never);

    const start = new Date("2026-05-05T18:00:00Z");
    const end = new Date("2026-05-05T19:15:00Z");

    await availabilityService.checkConflict(
      "table-1",
      "2026-05-05",
      start,
      end,
      undefined,
      "hold-self"
    );

    expect(prisma.reservationHold.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: "hold-self" },
        }),
      })
    );
  });
});

describe("availabilityService.checkPacing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns within limit when no pacing rules configured", async () => {
    const result = await availabilityService.checkPacing(
      VENUE_ID,
      new Date("2026-05-05T18:00:00Z"),
      4,
      null
    );

    expect(result.withinLimit).toBe(true);
    expect(result.maxCovers).toBe(Infinity);
  });

  it("returns within limit when total covers are under max", async () => {
    vi.mocked(prisma.reservation.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 2 },
    } as never);
    vi.mocked(prisma.reservationHold.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 0 },
    } as never);

    const settings = {
      pacingRules: [{ maxCoversPerSlot: 10 }],
    };

    const result = await availabilityService.checkPacing(
      VENUE_ID,
      new Date("2026-05-05T18:00:00Z"),
      4,
      settings
    );

    expect(result.withinLimit).toBe(true);
    expect(result.currentCovers).toBe(2);
    expect(result.maxCovers).toBe(10);
  });

  it("returns not within limit when total covers exceed max", async () => {
    vi.mocked(prisma.reservation.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 8 },
    } as never);
    vi.mocked(prisma.reservationHold.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 2 },
    } as never);

    const settings = {
      pacingRules: [{ maxCoversPerSlot: 12 }],
    };

    const result = await availabilityService.checkPacing(
      VENUE_ID,
      new Date("2026-05-05T18:00:00Z"),
      4,
      settings
    );

    // current = 8 + 2 = 10, total after booking = 10 + 4 = 14 > 12
    expect(result.withinLimit).toBe(false);
    expect(result.currentCovers).toBe(10);
  });

  it("handles null _sum values from aggregates", async () => {
    vi.mocked(prisma.reservation.aggregate).mockResolvedValueOnce({
      _sum: { partySize: null },
    } as never);
    vi.mocked(prisma.reservationHold.aggregate).mockResolvedValueOnce({
      _sum: { partySize: null },
    } as never);

    const settings = {
      pacingRules: [{ maxCoversPerSlot: 10 }],
    };

    const result = await availabilityService.checkPacing(
      VENUE_ID,
      new Date("2026-05-05T18:00:00Z"),
      2,
      settings
    );

    expect(result.withinLimit).toBe(true);
    expect(result.currentCovers).toBe(0);
  });

  it("uses timeWindowMinutes from pacing rule", async () => {
    vi.mocked(prisma.reservation.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 0 },
    } as never);
    vi.mocked(prisma.reservationHold.aggregate).mockResolvedValueOnce({
      _sum: { partySize: 0 },
    } as never);

    const settings = {
      pacingRules: [{ maxCoversPerSlot: 10, timeWindowMinutes: 30 }],
    };

    await availabilityService.checkPacing(
      VENUE_ID,
      new Date("2026-05-05T18:00:00Z"),
      2,
      settings
    );

    // Verify the window end is 30 minutes from start
    const reservationCall = vi.mocked(prisma.reservation.aggregate).mock.calls[0][0] as {
      where: { startTime: { lt: Date } };
    };
    const windowEnd = reservationCall.where.startTime.lt;
    expect(windowEnd.getTime() - new Date("2026-05-05T18:00:00Z").getTime()).toBe(
      30 * 60 * 1000
    );
  });
});
