import { expect } from "vitest";
import { validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { hubRows, type HubRowsInput } from "./hub-rows.js";

/** Fixtures the hub row tests share. Every config built here has passed `validateConfig`. */

const TIMEZONE = "America/Los_Angeles";
const SEATING = { version: 1, interval: 15 } as const;
const BOOKING_TYPES: ("online" | "phone")[] = ["online", "phone"];
export const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

/** A Thursday. */
export const TODAY = "2026-11-12";
/** 10:00 AM, before Dinner opens. */
const NOW = 600;

type Schedule = AvailabilityConfig["schedules"][number];
type ScheduleService = AvailabilityConfig["scheduleServices"][number];
type Assignment = AvailabilityConfig["assignments"][number];

/** Dinner from 5:00 PM, with its last seating an hour before it closes. */
export const dinnerRow = (scheduleId: string, closesAt = 1320): ScheduleService => ({
  id: `ss-${scheduleId}`,
  scheduleId,
  venueServiceId: "vs-dinner",
  opensAt: 1020,
  lastSeatingAt: closesAt - 60,
  closesAt,
  seating: SEATING,
  bookingTypes: BOOKING_TYPES,
  weekdays: [],
  dayHours: { version: 1, sets: [] },
});

const REGULAR: Schedule = { id: "regular", name: "Regular", kind: "regular", isRegular: true };
const REGULAR_ASSIGNMENT: Assignment = {
  id: "as-regular",
  scheduleId: "regular",
  weekdays: EVERY_DAY,
  startsOn: "2026-01-01",
  precedence: 0,
};

/** A set of seasonal hours running Dinner, with the assignments that put it on the week. */
export function seasonal(id: string, name: string, ...uses: Partial<Assignment>[]) {
  return {
    schedules: [{ id, name, kind: "alternate", isRegular: false } satisfies Schedule],
    scheduleServices: [dinnerRow(id, 1380)],
    assignments: uses.map((use, index): Assignment => ({
      id: `as-${id}-${index}`,
      scheduleId: id,
      weekdays: EVERY_DAY,
      precedence: 1,
      ...use,
    })),
  };
}

interface Parts {
  readonly schedules?: readonly Schedule[];
  readonly scheduleServices?: readonly ScheduleService[];
  readonly assignments?: readonly Assignment[];
  /** When regular Dinner closes; 10:00 PM unless given. */
  readonly regularClosesAt?: number;
}

/** A fixture the server would refuse proves nothing about a real venue. */
export function valid(config: AvailabilityConfig): AvailabilityConfig {
  expect(validateConfig(config)).toEqual([]);
  return config;
}

/** Regular hours from Jan 1, 2026: Dinner 5:00 PM to 10:00 PM every day, plus whatever is added. */
export function venue(dateRules: DateRule[] = [], ...added: Parts[]): AvailabilityConfig {
  const closesAt = added.find((p) => p.regularClosesAt !== undefined)?.regularClosesAt;
  return valid({
    schedules: [REGULAR, ...added.flatMap((p) => p.schedules ?? [])],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [
      dinnerRow("regular", closesAt),
      ...added.flatMap((p) => p.scheduleServices ?? []),
    ],
    assignments: [REGULAR_ASSIGNMENT, ...added.flatMap((p) => p.assignments ?? [])],
    dateRules,
  });
}

export function input(config: AvailabilityConfig, rest: Partial<HubRowsInput> = {}): HubRowsInput {
  return {
    state: { config, source: "rows" },
    settings: null,
    holidays: [],
    sectionNames: new Map([["sec-patio", "Patio"]]),
    timezone: TIMEZONE,
    today: TODAY,
    nowMinute: NOW,
    ...rest,
  };
}

/** The five rows, or a failed test when the venue reads as empty. */
export function rowsOf(config: AvailabilityConfig, rest: Partial<HubRowsInput> = {}) {
  const result = hubRows(input(config, rest));
  if (result.kind !== "rows") throw new Error("expected rows");
  return result.rows;
}

/** A date rule; unless told otherwise, the whole venue closed for the whole of today. */
export const rule = (id: string, rest: Partial<DateRule> = {}): DateRule =>
  ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: TODAY,
    endsOn: TODAY,
    ...rest,
  }) as DateRule;

/** Special hours: Dinner 4:00 PM to 8:00 PM, on one date unless `rest` says otherwise. */
export const specialHours = (id: string, date: string, rest: Partial<DateRule> = {}): DateRule =>
  rule(id, {
    kind: "special_hours",
    startsOn: date,
    endsOn: date,
    payload: {
      version: 1,
      services: [
        {
          venueServiceId: "vs-dinner",
          opensAt: 960,
          lastSeatingAt: 1140,
          closesAt: 1200,
          seating: SEATING,
          bookingTypes: BOOKING_TYPES,
        },
      ],
    },
    ...rest,
  } as Partial<DateRule>);

/** A part of each day, in service-day minutes. */
export const window = (from: number, to = 2880) => ({ version: 1 as const, from, to });

/** Every Thursday from Nov 1, 2026 to Feb 28, 2027; today is one of them. */
export const THURSDAYS: Partial<DateRule> = {
  startsOn: "2026-11-01",
  endsOn: "2027-02-28",
  repeat: { version: 1, weekdays: [4] },
};
