import type { AvailabilityConfig } from "@mbe/types";
import { describe, expect, it } from "vitest";
import { addDays } from "./civil-date.js";
import { encodeWeek, type ServiceHours, type Week } from "./service-days.js";
import { regularWeekView, weekSpans } from "./week-spans.js";
import { listSlots, type EngineTable } from "./slots.js";

const TZ = "America/Los_Angeles";
const NOW = new Date("2026-01-01T00:00:00Z");
// A Monday after the autumn clock change, so the whole week has ordinary days.
const MONDAY = "2026-11-02";
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const hours = (opensAt: number, closesAt: number): ServiceHours => ({
  opensAt,
  lastSeatingAt: closesAt - 45,
  closesAt,
  seating: { version: 1, interval: 15 },
  bookingTypes: ["online", "phone"],
});
const on = (h: ServiceHours, ...days: number[]) =>
  Array.from({ length: 7 }, (_, d) => (days.includes(d) ? h : null));

const LUNCH = "vs-lunch";
const DINNER = "vs-dinner";
const BRUNCH = "vs-brunch";

/** The demo week: lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, brunch Sat–Sun. */
const DEMO: Week = [
  { venueServiceId: LUNCH, days: on(hours(690, 900), 1, 2, 3, 4, 5) },
  {
    venueServiceId: DINNER,
    days: Array.from({ length: 7 }, (_, d) =>
      d === 1 ? null : d === 5 || d === 6 ? hours(1020, 1440) : hours(1020, 1380)
    ),
  },
  { venueServiceId: BRUNCH, days: on(hours(600, 840), 6, 0) },
];

function configOf(week: Week): AvailabilityConfig {
  return {
    schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
    venueServices: [
      { id: LUNCH, name: "Lunch", position: 0 },
      { id: DINNER, name: "Dinner", position: 1 },
      { id: BRUNCH, name: "Brunch", position: 2 },
    ],
    scheduleServices: encodeWeek(week, ALL_DAYS).map((row, i) => ({
      ...row,
      id: `ss-${i}`,
      scheduleId: "regular",
    })),
    assignments: [{ id: "as", scheduleId: "regular", weekdays: ALL_DAYS, precedence: 0 }],
    dateRules: [],
  };
}

const table = (id: string, capacity: number): EngineTable => ({
  id,
  name: id,
  capacity,
  minCovers: 1,
  maxCovers: capacity,
  isActive: true,
  priority: 1,
});

const options = (tables: readonly EngineTable[] = [], partySize = 2) => ({
  timezone: TZ,
  from: MONDAY,
  partySize,
  tables,
  now: NOW,
});

const spanOf = (days: ReturnType<typeof weekSpans>, date: string, venueServiceId: string) =>
  days
    .find((d) => d.serviceDate === date)
    ?.services.find((s) => s.venueServiceId === venueServiceId);

describe("weekSpans", () => {
  it("covers seven consecutive dates from the start date", () => {
    const days = weekSpans(configOf(DEMO), options());
    expect(days.map((d) => d.serviceDate)).toEqual(
      Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i))
    );
  });

  it("gives Friday and Saturday later last times than Thursday, and no dinner on Monday", () => {
    const days = weekSpans(configOf(DEMO), options());
    const thursday = spanOf(days, "2026-11-05", DINNER);
    const friday = spanOf(days, "2026-11-06", DINNER);
    const saturday = spanOf(days, "2026-11-07", DINNER);
    expect(thursday?.lastAt).toBe(1335);
    expect(friday?.lastAt).toBe(1395);
    expect(saturday?.lastAt).toBe(1395);
    expect(spanOf(days, MONDAY, DINNER)).toBeUndefined();
    expect(spanOf(days, MONDAY, LUNCH)).toMatchObject({ firstAt: 690, lastAt: 855 });
  });

  it("gives noTableFits, not a missing service, when no active table fits the party", () => {
    const small = [table("t-1", 2), table("t-2", 2)];
    const days = weekSpans(configOf(DEMO), options(small, 6));
    expect(spanOf(days, "2026-11-03", DINNER)).toMatchObject({ firstAt: 1020, noTableFits: true });
    const fits = weekSpans(configOf(DEMO), options(small, 2));
    expect(spanOf(fits, "2026-11-03", DINNER)?.noTableFits).toBe(false);
  });

  it("makes no party check when the venue has no active tables", () => {
    const days = weekSpans(configOf(DEMO), options([], 6));
    expect(spanOf(days, "2026-11-03", DINNER)?.noTableFits).toBe(false);
  });

  it("equals the first and last time listSlots returns, per service, for every date", () => {
    const config = configOf(DEMO);
    const tables = [table("t-1", 4)];
    const snapshot = { timezone: TZ, config, tables, reservations: [], holds: [], settings: null };
    for (const day of weekSpans(config, options(tables, 2))) {
      const slots = listSlots(snapshot, day.serviceDate, 2, "online", NOW);
      const expected = [...new Set(slots.map((s) => s.venueServiceId))].map((id) => {
        const minutes = slots.filter((s) => s.venueServiceId === id).map((s) => s.minute);
        return { venueServiceId: id, firstAt: Math.min(...minutes), lastAt: Math.max(...minutes) };
      });
      expect(
        day.services.map(({ venueServiceId, firstAt, lastAt }) => ({
          venueServiceId,
          firstAt,
          lastAt,
        }))
      ).toEqual(expected);
    }
  });

  it("reads the clock only from the now it is given", () => {
    const config = configOf(DEMO);
    expect(weekSpans(config, { ...options(), now: new Date("2030-06-01T00:00:00Z") })).toEqual(
      weekSpans(config, options())
    );
  });
});

describe("regularWeekView", () => {
  it("ignores a closure rule and a dated schedule", () => {
    const base = configOf(DEMO);
    const config: AvailabilityConfig = {
      ...base,
      schedules: [
        ...base.schedules,
        { id: "summer", name: "Summer", kind: "alternate", isRegular: false },
        { id: "holiday", name: "Holiday", kind: "holiday", isRegular: false },
      ],
      assignments: [
        ...base.assignments,
        {
          id: "as-summer",
          scheduleId: "summer",
          weekdays: ALL_DAYS,
          precedence: 5,
          startsOn: "2026-11-01",
          endsOn: "2026-11-30",
        },
        { id: "as-holiday", scheduleId: "holiday", weekdays: [6], precedence: 9 },
      ],
      dateRules: [
        {
          id: "dr-close",
          kind: "closure",
          targetKind: "venue",
          startsOn: "2026-11-03",
          endsOn: "2026-11-03",
        },
      ],
    };
    const view = regularWeekView(config);
    expect(view.assignments.map((a) => a.id)).toEqual(["as"]);
    expect(view.dateRules).toEqual([]);
    expect(weekSpans(view, options())).toEqual(weekSpans(base, options()));
  });

  it("keeps a superseded regular version and drops an archived one", () => {
    const base = configOf(DEMO);
    const config: AvailabilityConfig = {
      ...base,
      schedules: [
        ...base.schedules,
        { id: "old", name: "Regular week", kind: "regular", isRegular: false },
        {
          id: "gone",
          name: "Regular week",
          kind: "regular",
          isRegular: false,
          archivedAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      assignments: [
        ...base.assignments,
        {
          id: "as-old",
          scheduleId: "old",
          weekdays: ALL_DAYS,
          precedence: 0,
          endsOn: "2026-10-31",
        },
        { id: "as-gone", scheduleId: "gone", weekdays: ALL_DAYS, precedence: 0 },
      ],
    };
    expect(regularWeekView(config).assignments.map((a) => a.id)).toEqual(["as", "as-old"]);
  });
});
