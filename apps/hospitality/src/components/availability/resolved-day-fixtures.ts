import { resolveDay, type ResolvedDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";

/** Test fixtures: days produced by the real engine, never hand-written removal results. */

export const FIXTURE_DATE = "2026-10-30"; // a Friday
export const FIXTURE_TIMEZONE = "America/Los_Angeles";

const SEATING = { version: 1, interval: 15 } as const;
const BOOKING_TYPES: ("online" | "phone")[] = ["online", "phone"];

const LUNCH_HOURS = {
  opensAt: 690,
  lastSeatingAt: 840,
  closesAt: 900,
  seating: SEATING,
  bookingTypes: BOOKING_TYPES,
};
const DINNER_HOURS = {
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1380,
  seating: SEATING,
  bookingTypes: BOOKING_TYPES,
};

const BASE_CONFIG: AvailabilityConfig = {
  schedules: [{ id: "regular", name: "Weekend", kind: "regular", isRegular: true }],
  venueServices: [
    { id: "vs-lunch", name: "Lunch", position: 0 },
    { id: "vs-dinner", name: "Dinner", position: 1 },
  ],
  scheduleServices: [
    { id: "ss-lunch", scheduleId: "regular", venueServiceId: "vs-lunch", ...LUNCH_HOURS },
    { id: "ss-dinner", scheduleId: "regular", venueServiceId: "vs-dinner", ...DINNER_HOURS },
  ],
  assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: [5], precedence: 0 }],
  dateRules: [],
};

const ON_DAY = { startsOn: FIXTURE_DATE, endsOn: FIXTURE_DATE } as const;

/** Special hours: Dinner closes at 10:00 PM instead of 11:00 PM. */
export const EARLY_DINNER: DateRule = {
  ...ON_DAY,
  id: "r-special",
  kind: "special_hours",
  targetKind: "venue",
  payload: {
    version: 1,
    services: [
      { venueServiceId: "vs-lunch", ...LUNCH_HOURS },
      { venueServiceId: "vs-dinner", ...DINNER_HOURS, lastSeatingAt: 1200, closesAt: 1320 },
    ],
  },
};

/** A private party blocks 10:00-11:00 PM. */
export const PARTY_CLOSURE: DateRule = {
  ...ON_DAY,
  id: "r-party",
  kind: "closure",
  targetKind: "venue",
  window: { version: 1, from: 1320, to: 1380 },
};

/** Online booking closed for the day. */
export const ONLINE_CLOSURE: DateRule = {
  ...ON_DAY,
  id: "r-online",
  kind: "closure",
  targetKind: "booking",
  bookingTypes: ["online"],
};

/** Lunch closed for the day. */
export const LUNCH_CLOSURE: DateRule = {
  ...ON_DAY,
  id: "r-lunch",
  kind: "closure",
  targetKind: "service",
  venueServiceId: "vs-lunch",
};

/** The whole venue closed for the day. */
export const VENUE_CLOSURE: DateRule = {
  ...ON_DAY,
  id: "r-venue",
  kind: "closure",
  targetKind: "venue",
};

/** Tonight: stop 9:00-9:30 PM. */
export const TONIGHT_STOP: DateRule = {
  ...ON_DAY,
  id: "r-stop",
  kind: "tonight",
  targetKind: "venue",
  payload: { version: 1, stop: { from: 1260, to: 1290 } },
};

/** Tonight: close at 9:00 PM. */
export const TONIGHT_CLOSE: DateRule = {
  ...ON_DAY,
  id: "r-close",
  kind: "tonight",
  targetKind: "venue",
  payload: { version: 1, closeAt: 1260 },
};

/** Tonight: 6 covers per seating. */
export const TONIGHT_PACING: DateRule = {
  ...ON_DAY,
  id: "r-pacing",
  kind: "tonight",
  targetKind: "venue",
  payload: { version: 1, pacing: { covers: 6 } },
};

/** The engine's resolution of the fixture Friday with these date rules applied. */
export function resolveFixtureDay(...rules: DateRule[]): ResolvedDay {
  return resolveDay(
    { timezone: FIXTURE_TIMEZONE, config: { ...BASE_CONFIG, dateRules: rules } },
    FIXTURE_DATE
  );
}
