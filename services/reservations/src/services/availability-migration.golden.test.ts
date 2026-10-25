import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import {
  addDays,
  listSlots,
  weekdayOf,
  WEEKDAYS,
  type BookingSnapshot,
  type EngineSettings,
  type EngineTable,
  type Weekday,
} from "@mbe/availability";
import type { AvailabilityConfig, TimeSlot } from "@mbe/types";
import { legacyTimeSlots } from "../test/legacy-slot-oracle.js";
import { SEED_VENUES } from "../test/seed-venues.js";
import { availabilityService } from "./availability.js";
import { planVenueMigration } from "./availability-migration.js";
import { prisma } from "./database.js";

/**
 * SC Migration golden test (#7502). For every seeded and fixture venue it
 * captures the slots the legacy path offers over a fixed 60-day window, then
 * the slots the engine offers over the migrated rows, and requires them to be
 * identical — for both legacy storage shapes of the same hours.
 *
 * Unit level: the "before" is the pre-engine slot loop, frozen as a test oracle
 * (`legacyTimeSlots`); the "after" runs `planVenueMigration` + the engine's
 * `listSlots`. Time zones and windows are chosen so each 60-day window crosses a
 * DST transition.
 *
 * Listing (#7503) runs on the engine whether or not the backfill has run: the
 * real `generateTimeSlots`, against a mocked Prisma client (no database is
 * available to this suite), must equal the engine "after" both with the
 * migrated rows present and with no rows at all (the config derived in memory
 * from the legacy column).
 *
 * The "before" of the seed-array shape is synthetic: the legacy slot code reads
 * only the weekday-keyed shape, so it offers nothing for a seed-array column
 * (asserted below). That shape's "before" is the weekday-keyed equivalent of the
 * same hours. Past-midnight days are the one deliberate divergence: legacy offers
 * nothing, the engine offers the explicit list asserted per day.
 */

type DayHours = readonly [open: string, close: string] | null;
type Week = Readonly<Record<Weekday, DayHours>>;

interface FixtureVenue {
  name: string;
  week: Week;
  settings: (EngineSettings & { lastSeatingBuffer?: number }) | null;
}

const week = (monToSat: DayHours, fri: DayHours, sun: DayHours): Week => ({
  monday: monToSat,
  tuesday: monToSat,
  wednesday: monToSat,
  thursday: monToSat,
  friday: fri,
  saturday: fri,
  sunday: sun,
});

const SEED_ROW_DAY: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const seedWeek = (hours: (typeof SEED_VENUES)[number]["hours"]): Week =>
  Object.fromEntries(
    hours.map((r) => [SEED_ROW_DAY[r.dayOfWeek]!, r.isClosed ? null : [r.openTime, r.closeTime]])
  ) as unknown as Week;

const FIXTURES: FixtureVenue[] = [
  ...SEED_VENUES.map((v) => ({
    name: `seed: ${v.name}`,
    week: seedWeek(v.hours),
    settings: v.settings,
  })),
  {
    name: "weekday hours, defaults",
    week: week(["11:00", "22:00"], ["11:00", "23:00"], ["10:00", "21:00"]),
    settings: null,
  },
  {
    name: "30-minute interval, 60-minute buffer, closed Sunday",
    week: week(["17:00", "22:00"], ["17:00", "23:30"], null),
    settings: { slotIntervalMinutes: 30, lastSeatingBuffer: 60 },
  },
  {
    name: "odd interval, late opening",
    week: week(["11:30", "21:15"], ["11:30", "22:45"], ["12:00", "20:00"]),
    settings: { slotIntervalMinutes: 20, lastSeatingBuffer: 45 },
  },
];

/** Shape 1: `{ monday: { open, close, closed? } }`. */
const weekdayShape = (w: Week) =>
  Object.fromEntries(
    WEEKDAYS.map((d) => [
      d,
      w[d] ? { open: w[d]![0], close: w[d]![1] } : { open: "10:00", close: "21:00", closed: true },
    ])
  );

/** Shape 2: `[{ dayOfWeek, openTime, closeTime, isClosed }]`. */
const seedArrayShape = (w: Week) =>
  SEED_ROW_DAY.map((d, dayOfWeek) => ({
    dayOfWeek,
    openTime: w[d]?.[0] ?? "00:00",
    closeTime: w[d]?.[1] ?? "00:00",
    isClosed: w[d] === null,
  }));

const isOvernight = (hours: DayHours) => hours !== null && hours[1] <= hours[0];

const TABLES: EngineTable[] = [
  {
    id: "t-2",
    name: "2-top",
    capacity: 2,
    minCovers: 1,
    maxCovers: 2,
    isActive: true,
    priority: 2,
  },
  {
    id: "t-4",
    name: "4-top",
    capacity: 4,
    minCovers: 1,
    maxCovers: 4,
    isActive: true,
    priority: 1,
  },
  {
    id: "t-10",
    name: "Private",
    capacity: 10,
    minCovers: 4,
    maxCovers: 10,
    isActive: true,
    priority: 0,
  },
];

const CASES = [
  { tz: "America/New_York", start: "2026-03-02", now: "2026-03-01T12:00:00Z" }, // spring forward 8 Mar
  { tz: "America/Los_Angeles", start: "2026-10-26", now: "2026-10-25T12:00:00Z" }, // fall back 1 Nov
  { tz: "Europe/London", start: "2026-03-23", now: "2026-03-22T12:00:00Z" }, // spring forward 29 Mar
] as const;

const PARTY_SIZES = [2, 6] as const;
const DAYS = 60;

interface SlotView {
  time: string;
  available: boolean;
  tableIds: string[];
}

const fromTimeSlots = (slots: TimeSlot[]): SlotView[] =>
  slots.map((s) => ({
    time: s.time,
    available: s.available,
    tableIds: (s.tables ?? []).map((t) => t.id),
  }));

function legacySlots(venue: object, date: string, partySize: number, now: Date): SlotView[] {
  return fromTimeSlots(legacyTimeSlots(venue as never, TABLES, date, partySize, now));
}

/** Prisma rows for a config, as the backfill writes them. */
function rowsOf(config: AvailabilityConfig) {
  return {
    schedules: config.schedules.map((s) => ({ ...s, venueId: "v1", archivedAt: null })),
    venueServices: config.venueServices.map((s) => ({ ...s, venueId: "v1", archivedAt: null })),
    scheduleServices: config.scheduleServices.map((s) => ({ ...s, venueId: "v1", rules: {} })),
    assignments: config.assignments.map((a) => ({
      ...a,
      venueId: "v1",
      startsOn: null,
      endsOn: null,
    })),
  };
}

const NO_ROWS = { schedules: [], venueServices: [], scheduleServices: [], assignments: [] };

/** The real listing, through the snapshot loader, over the given availability rows. */
async function listedSlots(
  venue: object,
  rows: ReturnType<typeof rowsOf>,
  date: string,
  partySize: number
): Promise<SlotView[]> {
  vi.mocked(prisma.venue.findUnique).mockResolvedValue({
    ...venue,
    availabilityVersion: 0,
  } as never);
  vi.mocked(prisma.table.findMany).mockResolvedValue(TABLES as never);
  vi.mocked(prisma.reservation.findMany).mockResolvedValue([]);
  vi.mocked(prisma.reservationHold.findMany).mockResolvedValue([]);
  vi.mocked(prisma.schedule.findMany).mockResolvedValue(rows.schedules as never);
  vi.mocked(prisma.venueService.findMany).mockResolvedValue(rows.venueServices as never);
  vi.mocked(prisma.scheduleService.findMany).mockResolvedValue(rows.scheduleServices as never);
  vi.mocked(prisma.scheduleAssignment.findMany).mockResolvedValue(rows.assignments as never);
  vi.mocked(prisma.dateRule.findMany).mockResolvedValue([]);
  return fromTimeSlots(await availabilityService.generateTimeSlots("v1", date, partySize));
}

function engineSlotList(
  plan: ReturnType<typeof planVenueMigration>,
  tz: string,
  settings: FixtureVenue["settings"],
  date: string,
  partySize: number,
  now: Date
) {
  if (plan.kind !== "migrate") throw new Error(`not migrated: ${plan.reason}`);
  const snapshot: BookingSnapshot = {
    timezone: tz,
    config: plan.config,
    tables: TABLES,
    reservations: [],
    holds: [],
    settings,
  };
  return listSlots(snapshot, date, partySize, "online", now);
}

const toView = (slots: ReturnType<typeof engineSlotList>): SlotView[] =>
  slots.map((s) => ({
    time: s.start.toISOString(),
    available: s.available,
    tableIds: s.tables.map((t) => t.id),
  }));

function engineSlots(...args: Parameters<typeof engineSlotList>): SlotView[] {
  return toView(engineSlotList(...args));
}

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
};

/** Seating minutes a past-midnight day must offer: open to close - buffer at the venue interval. */
function expectedOvernightMinutes(
  hours: NonNullable<DayHours>,
  settings: FixtureVenue["settings"]
) {
  const interval = settings?.slotIntervalMinutes ?? 15;
  const buffer = settings?.lastSeatingBuffer ?? 90;
  const open = toMinutes(hours[0]);
  const last = toMinutes(hours[1]) + 1440 - buffer;
  const minutes: number[] = [];
  for (let m = open; m <= last; m += interval) minutes.push(m);
  return minutes;
}

describe("legacy -> availability rows: slots are identical before and after", () => {
  let clock: Date;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const fixture of FIXTURES) {
    for (const c of CASES) {
      it(`${fixture.name} in ${c.tz} from ${c.start}`, async () => {
        clock = new Date(c.now);
        vi.setSystemTime(clock);
        const base = {
          id: "v1",
          name: fixture.name,
          slug: "v1",
          ianaTimezone: c.tz,
          settings: fixture.settings,
        };
        const asWeekday = { ...base, operatingHours: weekdayShape(fixture.week) };
        const asSeedArray = { ...base, operatingHours: seedArrayShape(fixture.week) };
        const fromWeekday = planVenueMigration(asWeekday, clock);
        const fromArray = planVenueMigration(asSeedArray, clock);

        // Both legacy shapes of the same hours migrate to the same rows apart from ids.
        expect(fromArray.kind).toBe("migrate");
        expect(fromWeekday.kind).toBe("migrate");
        if (fromWeekday.kind !== "migrate") return;
        const migratedRows = rowsOf(fromWeekday.config);

        let compared = 0;
        for (let i = 0; i < DAYS; i += 1) {
          const date = addDays(c.start, i);
          const hours = fixture.week[weekdayOf(date)];
          for (const partySize of PARTY_SIZES) {
            const before = legacySlots(asWeekday, date, partySize, clock);
            // The legacy code cannot read the seed-array shape at all.
            expect(legacySlots(asSeedArray, date, partySize, clock)).toEqual([]);
            const afterWeekday = engineSlots(
              fromWeekday,
              c.tz,
              fixture.settings,
              date,
              partySize,
              clock
            );
            const afterArray = engineSlots(
              fromArray,
              c.tz,
              fixture.settings,
              date,
              partySize,
              clock
            );
            expect(afterArray).toEqual(afterWeekday);
            // Listing on the engine: identical whether or not the backfill has run.
            const label = `${date} party ${partySize}`;
            expect(await listedSlots(asWeekday, migratedRows, date, partySize), label).toEqual(
              afterWeekday
            );
            expect(await listedSlots(asWeekday, NO_ROWS, date, partySize), label).toEqual(
              afterWeekday
            );
            expect(await listedSlots(asSeedArray, NO_ROWS, date, partySize), label).toEqual(
              afterWeekday
            );
            if (isOvernight(hours)) {
              // Documented divergence: the legacy loop offered nothing for a close at or
              // before the open; the migration reads it as past midnight (ADR-029).
              expect(before).toEqual([]);
              const list = engineSlotList(
                fromWeekday,
                c.tz,
                fixture.settings,
                date,
                partySize,
                clock
              );
              expect(
                list.map((x) => x.minute),
                `${date} overnight`
              ).toEqual(expectedOvernightMinutes(hours!, fixture.settings));
              expect(list.every((x) => x.available)).toBe(true);
              continue;
            }
            expect(afterWeekday, `${date} party ${partySize}`).toEqual(before);
            compared += before.length;
          }
        }
        // The comparison must not pass vacuously.
        expect(compared).toBeGreaterThan(0);
      });
    }
  }

  it("the seed venues offer bookable slots after migration", () => {
    for (const seed of SEED_VENUES) {
      const clock = new Date("2026-03-01T12:00:00Z");
      const plan = planVenueMigration(
        { operatingHours: seed.hours, settings: seed.settings, ianaTimezone: seed.ianaTimezone },
        clock
      );
      const bookable = Array.from({ length: 7 }, (_, i) =>
        engineSlots(plan, seed.ianaTimezone, seed.settings, addDays("2026-03-02", i), 2, clock)
      )
        .flat()
        .filter((s) => s.available);
      expect(bookable.length, seed.name).toBeGreaterThan(0);
    }
  });
});
