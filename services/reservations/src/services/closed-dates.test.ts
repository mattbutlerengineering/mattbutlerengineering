import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as Engine from "@mbe/availability";

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

vi.mock("@mbe/availability", async (importOriginal) => {
  const actual = await importOriginal<typeof Engine>();
  return { ...actual, listSlots: vi.fn(actual.listSlots) };
});

import { listSlots } from "@mbe/availability";
import { availabilityService, type ListingOptions } from "./availability.js";
import { prisma } from "./database.js";

/**
 * `getClosedDates` (#9971) must close exactly the dates the full slot listing
 * (`getAvailableDates`) closes. Each scenario runs both over the same rows and
 * compares, so a layer that changes the answer cannot slip past the cheap path.
 */

const VENUE_ID = "venue-1";
// Fixed clock: every date below is relative to this instant, not the wall clock.
const FIXED_NOW = new Date("2026-05-01T12:00:00Z");
// 2026-05-03 is a Sunday; four weeks to Saturday 05-30.
const FROM = "2026-05-03";
const TO = "2026-05-30";

const LEGACY_HOURS = {
  monday: { open: "11:00", close: "22:00" },
  tuesday: { open: "11:00", close: "22:00" },
  wednesday: { open: "11:00", close: "22:00" },
  thursday: { open: "11:00", close: "22:00" },
  friday: { open: "11:00", close: "23:00" },
  saturday: { open: "10:00", close: "23:00" },
  sunday: { open: "10:00", close: "21:00", closed: true },
};

function venueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: VENUE_ID,
    name: "Test Restaurant",
    slug: "test-restaurant",
    ianaTimezone: "America/New_York",
    settings: null,
    availabilityVersion: 1,
    operatingHours: LEGACY_HOURS,
    ...overrides,
  };
}

const TABLE_ROW = {
  id: "table-1",
  name: "Table 1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 6,
  isActive: true,
  priority: 5,
};

const day = (date: string) => new Date(`${date}T00:00:00Z`);

/** A `date_rules` row as Prisma returns it: a whole-venue closure of `on`. */
function rule(id: string, on: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "closure",
    targetKind: "venue",
    venueServiceId: null,
    sectionId: null,
    bookingTypes: [],
    startsOn: day(on),
    endsOn: day(on),
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

const SEATING = { version: 1, interval: 60 };
const LUNCH = { id: "vs-lunch", name: "Lunch" };
const DINNER = { id: "vs-dinner", name: "Dinner" };

function hours(venueServiceId: string, opensAt: number, lastSeatingAt: number, closesAt: number) {
  return { venueServiceId, opensAt, lastSeatingAt, closesAt, seating: SEATING };
}

function scheduleService(id: string, scheduleId: string, h: ReturnType<typeof hours>) {
  return {
    id,
    venueId: VENUE_ID,
    scheduleId,
    ...h,
    bookingTypes: ["online", "phone"],
    weekdays: [],
    rules: {},
  };
}

const schedule = (id: string, kind: string, isRegular = false) => ({
  id,
  venueId: VENUE_ID,
  name: id,
  kind,
  isRegular,
  archivedAt: null,
});

/**
 * A venue on availability rows, one layer per date:
 * - regular week: Lunch + Dinner Monday to Saturday; Sunday has no assignment (closed);
 * - seasonal: an alternate "summer" schedule (Lunch only, Sunday to Friday) for 05-17..05-23;
 * - use_schedule: Sunday 05-10 runs the holiday schedule (reopens a closed weekday);
 * - special hours: Sunday 05-24 reopens for Dinner; Tuesday 05-12 runs no service at all;
 * - closures: whole venue 05-14 (message), a short window 05-15 (open, shorter),
 *   Dinner only 05-16 (Lunch left), the only table 05-19 (tables never close a date),
 *   online booking 05-21 (that day only, not a pause), a whole-day Tonight stop 05-27.
 */
const ROWS = {
  schedules: [
    schedule("regular", "regular", true),
    schedule("summer", "alternate"),
    schedule("holiday", "holiday"),
  ],
  venueServices: [LUNCH, DINNER].map((v, position) => ({
    ...v,
    venueId: VENUE_ID,
    position,
    archivedAt: null,
  })),
  scheduleServices: [
    scheduleService("ss-r-lunch", "regular", hours(LUNCH.id, 660, 780, 840)),
    scheduleService("ss-r-dinner", "regular", hours(DINNER.id, 1080, 1260, 1320)),
    scheduleService("ss-s-lunch", "summer", hours(LUNCH.id, 690, 810, 870)),
    scheduleService("ss-h-dinner", "holiday", hours(DINNER.id, 1020, 1140, 1200)),
  ],
  assignments: [
    {
      id: "a-regular",
      venueId: VENUE_ID,
      scheduleId: "regular",
      weekdays: [1, 2, 3, 4, 5, 6],
      startsOn: null,
      endsOn: null,
      precedence: 0,
    },
    {
      id: "a-summer",
      venueId: VENUE_ID,
      scheduleId: "summer",
      weekdays: [0, 1, 2, 3, 4, 5],
      startsOn: day("2026-05-17"),
      endsOn: day("2026-05-23"),
      precedence: 1,
    },
  ],
  dateRules: [
    rule("r-holiday", "2026-05-10", { kind: "use_schedule", useScheduleId: "holiday" }),
    rule("r-special-open", "2026-05-24", {
      kind: "special_hours",
      payload: {
        version: 1,
        services: [{ ...hours(DINNER.id, 1080, 1200, 1260), bookingTypes: ["online"] }],
      },
    }),
    rule("r-special-none", "2026-05-12", {
      kind: "special_hours",
      payload: { version: 1, services: [] },
      guestMessage: "Private hire",
    }),
    rule("r-closed", "2026-05-14", { guestMessage: "Burst pipe" }),
    rule("r-window", "2026-05-15", { window: { version: 1, from: 1200, to: 1260 } }),
    rule("r-dinner", "2026-05-16", { targetKind: "service", venueServiceId: DINNER.id }),
    rule("r-tables", "2026-05-19", { targetKind: "tables", tables: [{ tableId: "table-1" }] }),
    rule("r-online", "2026-05-21", { targetKind: "booking", bookingTypes: ["online"] }),
    rule("r-tonight", "2026-05-27", {
      kind: "tonight",
      payload: { version: 1, stop: { from: 0, to: 1440 } },
    }),
  ],
};

interface Scenario {
  name: string;
  venue?: Record<string, unknown>;
  rows?: Partial<typeof ROWS>;
}

/** One snapshot's worth of rows; `mockResolvedValue` so both listings read the same data. */
function stub({ venue, rows = {} }: Scenario) {
  vi.mocked(prisma.venue.findUnique).mockResolvedValue(venueRow(venue) as never);
  vi.mocked(prisma.table.findMany).mockResolvedValue([TABLE_ROW] as never);
  vi.mocked(prisma.schedule.findMany).mockResolvedValue((rows.schedules ?? []) as never);
  vi.mocked(prisma.venueService.findMany).mockResolvedValue((rows.venueServices ?? []) as never);
  vi.mocked(prisma.scheduleService.findMany).mockResolvedValue(
    (rows.scheduleServices ?? []) as never
  );
  vi.mocked(prisma.scheduleAssignment.findMany).mockResolvedValue(
    (rows.assignments ?? []) as never
  );
  vi.mocked(prisma.dateRule.findMany).mockResolvedValue((rows.dateRules ?? []) as never);
}

// Booking window: 7 days ahead (14 for a member), so most of the range is past it.
const WINDOWED = { maxAdvanceBooking: 7, memberLeadDays: 7, minAdvanceBooking: 2 };

const SCENARIOS: Scenario[] = [
  { name: "rows: every layer across four weeks", rows: ROWS },
  { name: "rows: every layer, inside a booking window", rows: ROWS, venue: { settings: WINDOWED } },
  { name: "legacy hours: an open week with a closed regular weekday" },
  {
    name: "legacy hours under date rules",
    rows: { dateRules: ROWS.dateRules.filter((r) => r.kind === "closure") },
  },
  {
    name: "a pause of online booking until reopened",
    venue: { settings: { phone: "(555) 123-4567" } },
    rows: {
      dateRules: [
        rule("r-pause", "2026-05-05", {
          targetKind: "booking",
          bookingTypes: ["online"],
          endsOn: null,
        }),
      ],
    },
  },
  { name: "a venue that never set hours", venue: { operatingHours: null } },
  { name: "a venue whose legacy hours cannot be read", venue: { operatingHours: { version: 7 } } },
];

const OPTIONS: { name: string; options: ListingOptions }[] = [
  { name: "a guest", options: {} },
  { name: "a verified member", options: { member: true } },
];

async function fullListingClosures(partySize: number, options: ListingOptions) {
  const full = await availabilityService.getAvailableDates(VENUE_ID, FROM, TO, partySize, options);
  return full.flatMap(({ date, closure }) => (closure ? [{ date, closure }] : []));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_NOW);
  for (const delegate of [prisma.reservation, prisma.reservationHold]) {
    vi.mocked(delegate.findMany).mockResolvedValue([] as never);
  }
});
afterEach(() => {
  vi.useRealTimers();
});

describe("availabilityService.getClosedDates", () => {
  describe.each(OPTIONS)("for $name", ({ options }) => {
    it.each(SCENARIOS)("matches the full listing's closures: $name", async (scenario) => {
      stub(scenario);
      // A party no table seats too: the full listing offers nothing, closures must not move.
      for (const partySize of [2, 12]) {
        const expected = await fullListingClosures(partySize, options);

        const closed = await availabilityService.getClosedDates(
          VENUE_ID,
          FROM,
          TO,
          partySize,
          options
        );

        expect(closed).toEqual(expected);
      }
    });
  });

  it("closes the dates each rows layer closes, and only those", async () => {
    stub({ name: "rows", rows: ROWS });

    const closed = await availabilityService.getClosedDates(VENUE_ID, FROM, TO, 2);

    expect(closed).toEqual([
      { date: "2026-05-03", closure: { message: "Closed on this date." } },
      { date: "2026-05-12", closure: { message: "Private hire" } },
      { date: "2026-05-14", closure: { message: "Burst pipe" } },
      { date: "2026-05-21", closure: { message: "Closed on this date." } },
      { date: "2026-05-27", closure: { message: "Closed on this date." } },
    ]);
  });

  it("lists slots only for dates a rule closes", async () => {
    stub({ name: "rows", rows: ROWS });

    await availabilityService.getClosedDates(VENUE_ID, FROM, TO, 2);

    const listedDates = vi.mocked(listSlots).mock.calls.map(([, date]) => date);
    // Rule-closed: the closed Sunday, the no-service special date and five closures.
    // The partial ones (05-15, 05-16) are listed to find a seating left; open days never are.
    expect(listedDates.sort()).toEqual([
      "2026-05-03",
      "2026-05-12",
      "2026-05-14",
      "2026-05-15",
      "2026-05-16",
      "2026-05-21",
      "2026-05-27",
    ]);
  });

  it("returns no dates when the venue is gone", async () => {
    stub({ name: "gone" });
    vi.mocked(prisma.venue.findUnique).mockResolvedValue(null as never);

    expect(await availabilityService.getClosedDates(VENUE_ID, FROM, TO, 2)).toEqual([]);
  });
});
