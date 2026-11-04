import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { projectLegacyOperatingHours, type LegacyOperatingHours } from "./legacy-projection.js";
import { MINUTES_PER_DAY, WEEKDAYS } from "./types.js";

const service = (id: string, scheduleId: string, venueServiceId: string, opensAt: number) => ({
  id,
  scheduleId,
  venueServiceId,
  opensAt,
  lastSeatingAt: opensAt + 120,
  closesAt: opensAt + 180,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const, "phone" as const],
  weekdays: [],
  dayHours: { version: 1 as const, sets: [] },
});

const CONFIG: AvailabilityConfig = {
  schedules: [
    {
      id: "sch-old",
      name: "Old",
      kind: "regular",
      isRegular: false,
      archivedAt: "2026-10-01T00:00:00.000Z",
    },
    { id: "sch-new", name: "New", kind: "regular", isRegular: true },
  ],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0, archivedAt: "2026-10-01T00:00:00.000Z" },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    service("ss-old", "sch-old", "vs-dinner", 600),
    service("ss-lunch", "sch-new", "vs-lunch", 660),
    service("ss-dinner", "sch-new", "vs-dinner", 1020),
  ],
  assignments: [
    // The archived schedule would win on precedence if it were still read.
    { id: "as-old", scheduleId: "sch-old", weekdays: [5], precedence: 9 },
    { id: "as-new", scheduleId: "sch-new", weekdays: [5], precedence: 0 },
  ],
  dateRules: [],
};

describe("projectLegacyOperatingHours with archived rows", () => {
  it("ignores archived schedules and archived venue services", () => {
    expect(projectLegacyOperatingHours(CONFIG).friday).toEqual({ open: "17:00", close: "20:00" });
  });

  it("reads a day closed when its only schedule is archived", () => {
    const onlyOld = { ...CONFIG, assignments: [CONFIG.assignments[0]!] };
    expect(projectLegacyOperatingHours(onlyOld).friday).toMatchObject({ closed: true });
  });
});

/** The projection as it was before day scope: every row of the covering schedule, base hours. Kept as the oracle. */
function legacyProjectionBeforeDayScope(config: AvailabilityConfig): LegacyOperatingHours {
  const clock = (minute: number) => {
    const m = minute % MINUTES_PER_DAY;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  const liveSchedules = new Set(config.schedules.filter((s) => !s.archivedAt).map((s) => s.id));
  const liveServices = new Set(config.venueServices.filter((s) => !s.archivedAt).map((s) => s.id));
  const regularWeek = config.assignments.filter(
    (a) => !a.startsOn && !a.endsOn && liveSchedules.has(a.scheduleId)
  );
  const entries = WEEKDAYS.map((day) => {
    const stored = (WEEKDAYS.indexOf(day) + 1) % 7;
    const covering = regularWeek
      .filter((a) => a.weekdays.includes(stored))
      .reduce<(typeof regularWeek)[number] | null>(
        (best, a) => (best === null || a.precedence > best.precedence ? a : best),
        null
      );
    const services = covering
      ? config.scheduleServices.filter(
          (s) => s.scheduleId === covering.scheduleId && liveServices.has(s.venueServiceId)
        )
      : [];
    return [
      day,
      services.length === 0
        ? { open: "00:00", close: "00:00", closed: true }
        : {
            open: clock(Math.min(...services.map((s) => s.opensAt))),
            close: clock(Math.max(...services.map((s) => s.closesAt))),
          },
    ] as const;
  });
  return Object.fromEntries(entries) as LegacyOperatingHours;
}

describe("projectLegacyOperatingHours with day scope", () => {
  const hours = (opensAt: number, closesAt: number) => ({
    opensAt,
    lastSeatingAt: closesAt - 45,
    closesAt,
    seating: { version: 1 as const, interval: 15 },
    bookingTypes: ["online" as const, "phone" as const],
  });
  const row = (
    id: string,
    venueServiceId: string,
    base: ReturnType<typeof hours>,
    weekdays: number[],
    sets: { weekdays: number[]; hours: ReturnType<typeof hours> }[] = []
  ): AvailabilityConfig["scheduleServices"][number] => ({
    id,
    scheduleId: "regular",
    venueServiceId,
    ...base,
    weekdays,
    dayHours: { version: 1, sets: sets.map((s) => ({ weekdays: s.weekdays, ...s.hours })) },
  });
  const VENUE_SERVICES = [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
    { id: "vs-brunch", name: "Brunch", position: 2 },
  ];
  const config = (
    scheduleServices: AvailabilityConfig["scheduleServices"],
    days = [0, 1, 2, 3, 4, 5, 6]
  ): AvailabilityConfig => ({
    schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
    venueServices: VENUE_SERVICES,
    scheduleServices,
    assignments: [{ id: "as", scheduleId: "regular", weekdays: days, precedence: 0 }],
    dateRules: [],
  });

  it("projects the demo week per weekday: Monday has no dinner window", () => {
    const demo = config([
      row("ss-lunch", "vs-lunch", hours(690, 900), [1, 2, 3, 4, 5]),
      row(
        "ss-dinner",
        "vs-dinner",
        hours(1020, 1380),
        [2, 3, 4, 0],
        [{ weekdays: [5, 6], hours: hours(1020, 1440) }]
      ),
      row("ss-brunch", "vs-brunch", hours(600, 840), [6, 0]),
    ]);
    const projected = projectLegacyOperatingHours(demo);
    // Monday: lunch only. Friday: lunch to the later dinner close, wrapped past midnight.
    expect(projected.monday).toEqual({ open: "11:30", close: "15:00" });
    expect(projected.tuesday).toEqual({ open: "11:30", close: "23:00" });
    expect(projected.friday).toEqual({ open: "11:30", close: "00:00" });
    expect(projected.saturday).toEqual({ open: "10:00", close: "00:00" });
    expect(projected.sunday).toEqual({ open: "10:00", close: "23:00" });
  });

  it("reads a covered weekday where no row runs as closed", () => {
    const only = config([row("ss-lunch", "vs-lunch", hours(690, 900), [1])]);
    expect(projectLegacyOperatingHours(only).tuesday).toMatchObject({ closed: true });
  });

  it("projects a config of unscoped rows identically to the pre-change function", () => {
    const rowArb = fc
      .record({
        schedule: fc.constantFrom("regular", "other"),
        service: fc.constantFrom("vs-lunch", "vs-dinner", "vs-brunch"),
        opens: fc.integer({ min: 0, max: 1200 }),
        length: fc.integer({ min: 60, max: 600 }),
      })
      .map((r) => ({
        ...row(`ss-${r.schedule}-${r.service}`, r.service, hours(r.opens, r.opens + r.length), []),
        scheduleId: r.schedule,
      }));
    const configArb = fc
      .record({
        rows: fc.array(rowArb, { maxLength: 5 }),
        days: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
        otherDays: fc.subarray([0, 1, 2, 3, 4, 5, 6]),
        archived: fc.subarray(["vs-lunch", "vs-dinner", "vs-brunch"]),
      })
      .map(({ rows, days, otherDays, archived }) => {
        const base = config(rows, days);
        return {
          ...base,
          schedules: [
            ...base.schedules,
            { id: "other", name: "Other", kind: "alternate" as const, isRegular: false },
          ],
          venueServices: base.venueServices.map((v) =>
            archived.includes(v.id) ? { ...v, archivedAt: "2026-10-01T00:00:00.000Z" } : v
          ),
          assignments: [
            ...base.assignments.filter((a) => a.weekdays.length > 0),
            ...(otherDays.length > 0
              ? [{ id: "as-other", scheduleId: "other", weekdays: otherDays, precedence: 1 }]
              : []),
          ],
        };
      });
    fc.assert(
      fc.property(configArb, (c) => {
        expect(projectLegacyOperatingHours(c)).toEqual(legacyProjectionBeforeDayScope(c));
      }),
      { numRuns: 300 }
    );
  });
});
