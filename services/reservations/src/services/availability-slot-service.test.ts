import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./database.js", async () => {
  const { createMockDatabaseService } = await import("@mbe/database/testing");
  return createMockDatabaseService({
    prisma: {
      venue: { findUnique: vi.fn() },
      table: { findMany: vi.fn() },
      reservation: { findMany: vi.fn() },
      reservationHold: { findMany: vi.fn() },
      schedule: { findMany: vi.fn() },
      venueService: { findMany: vi.fn() },
      scheduleService: { findMany: vi.fn() },
      scheduleAssignment: { findMany: vi.fn() },
      dateRule: { findMany: vi.fn() },
    },
  });
});

import { availabilityService } from "./availability.js";
import { prisma } from "./database.js";

/**
 * Each public slot names the venue service it belongs to (#9964), for venues on
 * availability rows. Tuesday 2026-05-05, America/New_York (UTC-4).
 */

const VENUE_ID = "venue-1";
const DATE = "2026-05-05";
const BRUNCH = { id: "vs-brunch", name: "Brunch" };
const DINNER = { id: "vs-dinner", name: "Dinner" };
const LATE = { id: "vs-late", name: "Late Night" };

const SEATING = { version: 1, interval: 60 };

function hours(venueServiceId: string, opensAt: number, lastSeatingAt: number, closesAt: number) {
  return { venueServiceId, opensAt, lastSeatingAt, closesAt, seating: SEATING };
}

function stubVenue() {
  vi.mocked(prisma.venue.findUnique).mockResolvedValueOnce({
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
  } as never);
  vi.mocked(prisma.table.findMany).mockResolvedValueOnce([
    {
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
    },
  ] as never);
}

/** Availability rows: one regular schedule on Tuesdays running `services`. */
function stubRows(
  venueServices: { id: string; name: string }[],
  services: ReturnType<typeof hours>[]
) {
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
  vi.mocked(prisma.venueService.findMany).mockResolvedValueOnce(
    venueServices.map((v, position) => ({
      ...v,
      venueId: VENUE_ID,
      position,
      archivedAt: null,
    })) as never
  );
  vi.mocked(prisma.scheduleService.findMany).mockResolvedValueOnce(
    services.map((s, i) => ({
      id: `ss${i}`,
      venueId: VENUE_ID,
      scheduleId: "s1",
      ...s,
      bookingTypes: ["online", "phone"],
      rules: {},
    })) as never
  );
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
}

/** A `date_rules` row on DATE as Prisma returns it. */
function dateRule(overrides: Record<string, unknown>) {
  return {
    id: "rule-1",
    kind: "closure",
    targetKind: "venue",
    venueServiceId: null,
    bookingTypes: [],
    startsOn: new Date(`${DATE}T00:00:00Z`),
    endsOn: new Date(`${DATE}T00:00:00Z`),
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

const BRUNCH_AND_DINNER = [hours(BRUNCH.id, 600, 660, 720), hours(DINNER.id, 1080, 1140, 1200)];

async function slotsOf() {
  const day = await availabilityService.getDayAvailability(VENUE_ID, DATE, 2);
  return day.slots.map((s) => ({ time: s.time, service: s.service }));
}

const FIXED_NOW = new Date("2026-05-01T12:00:00Z");
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const delegate of [
    prisma.reservation,
    prisma.reservationHold,
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

describe("getDayAvailability labels each slot with its venue service", () => {
  it("tags Brunch and Dinner slots with their id and current name", async () => {
    stubVenue();
    stubRows([BRUNCH, DINNER], BRUNCH_AND_DINNER);

    expect(await slotsOf()).toEqual([
      { time: "2026-05-05T14:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T15:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T22:00:00.000Z", service: DINNER },
      { time: "2026-05-05T23:00:00.000Z", service: DINNER },
    ]);
  });

  it("tags the past-midnight seatings of an overnight service (closesAt > 1440)", async () => {
    stubVenue();
    stubRows(
      [DINNER, LATE],
      [hours(DINNER.id, 1080, 1140, 1200), hours(LATE.id, 1380, 1500, 1560)]
    );

    expect(await slotsOf()).toEqual([
      { time: "2026-05-05T22:00:00.000Z", service: DINNER },
      { time: "2026-05-05T23:00:00.000Z", service: DINNER },
      { time: "2026-05-06T03:00:00.000Z", service: LATE },
      { time: "2026-05-06T04:00:00.000Z", service: LATE },
      { time: "2026-05-06T05:00:00.000Z", service: LATE },
    ]);
  });

  it("tags the seatings of a special-hours day", async () => {
    stubVenue();
    stubRows([BRUNCH, DINNER], BRUNCH_AND_DINNER);
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      dateRule({
        kind: "special_hours",
        payload: {
          version: 1,
          services: [{ ...hours(DINNER.id, 1140, 1200, 1260), bookingTypes: ["online"] }],
        },
      }),
    ] as never);

    expect(await slotsOf()).toEqual([
      { time: "2026-05-05T23:00:00.000Z", service: DINNER },
      { time: "2026-05-06T00:00:00.000Z", service: DINNER },
    ]);
  });

  it("tags what is left after a Tonight close-early", async () => {
    stubVenue();
    stubRows([BRUNCH, DINNER], BRUNCH_AND_DINNER);
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      dateRule({ kind: "tonight", source: "tonight", payload: { version: 1, closeAt: 1110 } }),
    ] as never);

    expect(await slotsOf()).toEqual([
      { time: "2026-05-05T14:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T15:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T22:00:00.000Z", service: DINNER },
    ]);
  });

  it("tags what is left after a windowed closure of one service", async () => {
    stubVenue();
    stubRows([BRUNCH, DINNER], BRUNCH_AND_DINNER);
    vi.mocked(prisma.dateRule.findMany).mockResolvedValueOnce([
      dateRule({
        targetKind: "service",
        venueServiceId: DINNER.id,
        window: { version: 1, from: 1080, to: 1110 },
      }),
    ] as never);

    expect(await slotsOf()).toEqual([
      { time: "2026-05-05T14:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T15:00:00.000Z", service: BRUNCH },
      { time: "2026-05-05T23:00:00.000Z", service: DINNER },
    ]);
  });

  it("returns slots without a service for a venue still on legacy hours", async () => {
    stubVenue();

    const day = await availabilityService.getDayAvailability(VENUE_ID, DATE, 2);

    expect(day.slots.length).toBeGreaterThan(0);
    for (const slot of day.slots) expect(slot).not.toHaveProperty("service");
  });
});
