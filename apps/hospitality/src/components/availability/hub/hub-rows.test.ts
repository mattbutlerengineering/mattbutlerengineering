import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { hubRows, type HubRowsInput } from "./hub-rows.js";

const TIMEZONE = "America/Los_Angeles";
const SEATING = { version: 1, interval: 15 } as const;
const BOOKING_TYPES: ("online" | "phone")[] = ["online", "phone"];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0];

/** A Thursday. */
const TODAY = "2026-11-12";
/** 10:00 AM, before Dinner opens. */
const NOW = 600;

type Schedule = AvailabilityConfig["schedules"][number];
type ScheduleService = AvailabilityConfig["scheduleServices"][number];
type Assignment = AvailabilityConfig["assignments"][number];

const dinnerRow = (scheduleId: string, closesAt = 1320): ScheduleService => ({
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
function seasonal(id: string, name: string, ...uses: Partial<Assignment>[]) {
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
}

/** Regular hours from Jan 1, 2026: Dinner 5:00 PM to 10:00 PM every day, plus whatever is added. */
function venue(dateRules: DateRule[] = [], ...added: Parts[]): AvailabilityConfig {
  const config: AvailabilityConfig = {
    schedules: [REGULAR, ...added.flatMap((p) => p.schedules ?? [])],
    venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
    scheduleServices: [dinnerRow("regular"), ...added.flatMap((p) => p.scheduleServices ?? [])],
    assignments: [REGULAR_ASSIGNMENT, ...added.flatMap((p) => p.assignments ?? [])],
    dateRules,
  };
  // A fixture the server would refuse proves nothing about a real venue.
  expect(validateConfig(config)).toEqual([]);
  return config;
}

function input(config: AvailabilityConfig, rest: Partial<HubRowsInput> = {}): HubRowsInput {
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
function rowsOf(config: AvailabilityConfig, rest: Partial<HubRowsInput> = {}) {
  const result = hubRows(input(config, rest));
  if (result.kind !== "rows") throw new Error("expected rows");
  return result.rows;
}

const DINNER = {
  venueServiceId: "vs-dinner",
  name: "Dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
  days: MONDAY_FIRST,
  changes: [],
};

const rule = (id: string, rest: Partial<DateRule>): DateRule =>
  ({
    id,
    kind: "closure",
    targetKind: "venue",
    startsOn: TODAY,
    endsOn: TODAY,
    ...rest,
  }) as DateRule;

const specialHours = (id: string, date: string): DateRule =>
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
  });

const ONLINE: Partial<DateRule> = { targetKind: "booking", bookingTypes: ["online"], endsOn: null };

describe("hubRows", () => {
  it("returns the five rows in the order they win, numbered as the date check numbers them", () => {
    expect(rowsOf(venue()).map((row) => row.row)).toEqual([1, 2, 3, 4, 5]);
  });

  it("answers an empty venue when the config's source is empty", () => {
    const config: AvailabilityConfig = {
      schedules: [],
      venueServices: [],
      scheduleServices: [],
      assignments: [],
      dateRules: [],
    };
    expect(hubRows(input(config, { state: { config, source: "empty" } }))).toEqual({
      kind: "emptyVenue",
    });
  });
});

describe("hubRows: 1 regular hours", () => {
  it("lists each service with its hours and days, and no upcoming change", () => {
    expect(rowsOf(venue())[0]).toEqual({ row: 1, services: [DINNER], upcoming: null });
  });

  it("lists no service when the regular hours run none", () => {
    const config: AvailabilityConfig = { ...venue(), scheduleServices: [] };
    expect(validateConfig(config)).toEqual([]);
    expect(rowsOf(config)[0]).toEqual({ row: 1, services: [], upcoming: null });
  });

  it("carries an upcoming change with the date it starts and the hours it brings", () => {
    const config = venue([], {
      schedules: [{ id: "later", name: "Regular", kind: "regular", isRegular: false }],
      scheduleServices: [dinnerRow("later", 1380)],
      assignments: [
        {
          id: "as-later",
          scheduleId: "later",
          weekdays: EVERY_DAY,
          startsOn: "2027-01-04",
          precedence: 1,
        },
      ],
    });
    expect(rowsOf(config)[0]).toEqual({
      row: 1,
      services: [DINNER],
      upcoming: {
        startsOn: "2027-01-04",
        endsOn: null,
        services: [{ ...DINNER, lastSeatingAt: 1320, closesAt: 1380 }],
      },
    });
  });
});

describe("hubRows: 2 seasonal hours", () => {
  const summer = seasonal("summer", "Summer hours", {
    startsOn: "2027-06-01",
    endsOn: "2027-09-15",
  });

  it("lists a set with the dates and days it applies to", () => {
    expect(rowsOf(venue([], summer))[1]).toEqual({
      row: 2,
      sets: [
        {
          scheduleId: "summer",
          name: "Summer hours",
          usage: {
            kind: "periods",
            periods: [{ weekdays: EVERY_DAY, startsOn: "2027-06-01", endsOn: "2027-09-15" }],
          },
        },
      ],
      more: 0,
    });
  });

  it("lists nothing when there are no seasonal hours", () => {
    expect(rowsOf(venue())[1]).toEqual({ row: 2, sets: [], more: 0 });
  });

  it("lists three of four sets and counts 1 more", () => {
    const config = venue(
      [],
      summer,
      seasonal("b", "Autumn hours"),
      seasonal("c", "Winter hours"),
      seasonal("d", "Spring hours")
    );
    const row = rowsOf(config)[1];
    expect(row.sets.map((set) => set.name)).toEqual([
      "Summer hours",
      "Autumn hours",
      "Winter hours",
    ]);
    expect(row.more).toBe(1);
  });

  it("carries weekdays with no dates for a set that has no start and no end", () => {
    const weeknights = seasonal("weeknights", "Weeknights", { weekdays: [1, 2, 3, 4] });
    expect(rowsOf(venue([], weeknights))[1].sets).toEqual([
      {
        scheduleId: "weeknights",
        name: "Weeknights",
        usage: {
          kind: "periods",
          periods: [{ weekdays: [1, 2, 3, 4], startsOn: null, endsOn: null }],
        },
      },
    ]);
  });

  it("says a set that is used nowhere is unused", () => {
    expect(rowsOf(venue([], seasonal("spare", "Spare")))[1].sets[0]?.usage).toEqual({
      kind: "unused",
    });
  });
});

describe("hubRows: 3 special dates and holidays", () => {
  it("lists the next two special dates and counts the holidays not planned", () => {
    const config = venue([
      specialHours("r-dec-31", "2026-12-31"),
      specialHours("r-dec-24", "2026-12-24"),
      rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" }),
      specialHours("r-past", "2026-11-01"),
    ]);
    const holidays = [
      { state: { kind: "undecided" } },
      { state: { kind: "closed", ruleId: "r-nov-26" } },
      { state: { kind: "undecided" } },
      { state: { kind: "openAsUsual" } },
      { state: { kind: "undecided" } },
    ] as const;
    expect(rowsOf(config, { holidays })[2]).toEqual({
      row: 3,
      next: [
        {
          ruleId: "r-nov-26",
          kind: "closed",
          startsOn: "2026-11-26",
          endsOn: "2026-11-26",
          weekdays: null,
        },
        {
          ruleId: "r-dec-24",
          kind: "specialHours",
          startsOn: "2026-12-24",
          endsOn: "2026-12-24",
          weekdays: null,
        },
      ],
      holidaysNotPlanned: 3,
    });
  });

  it("lists nothing when there are no special dates, and still counts the holidays", () => {
    const holidays = [{ state: { kind: "undecided" } }] as const;
    expect(rowsOf(venue(), { holidays })[2]).toEqual({ row: 3, next: [], holidaysNotPlanned: 1 });
    expect(rowsOf(venue())[2]).toEqual({ row: 3, next: [], holidaysNotPlanned: 0 });
  });

  it("does not list a closure of part of the venue or part of a day as a special date", () => {
    const config = venue([
      rule("r-from-six", { window: { version: 1, from: 1080, to: 2880 } }),
      rule("r-online", { targetKind: "booking", bookingTypes: ["online"] }),
    ]);
    expect(rowsOf(config)[2].next).toEqual([]);
  });
});

describe("hubRows: 4 closures and pauses", () => {
  const PATIO = rule("r-patio", {
    targetKind: "tables",
    sectionId: "sec-patio",
    tableIds: ["t-1", "t-2"],
    startsOn: "2026-11-01",
    endsOn: null,
  });
  const THANKSGIVING = rule("r-nov-26", { startsOn: "2026-11-26", endsOn: "2026-11-26" });

  it("lists what is closed now, then the next closure", () => {
    const later = rule("r-dec-25", { startsOn: "2026-12-25", endsOn: "2026-12-25" });
    expect(rowsOf(venue([later, THANKSGIVING, PATIO]))[3]).toEqual({
      row: 4,
      pause: null,
      now: [
        {
          ruleId: "r-patio",
          what: { kind: "section", section: "Patio" },
          startsOn: "2026-11-01",
          endsOn: null,
          weekdays: null,
          window: null,
        },
      ],
      next: {
        ruleId: "r-nov-26",
        what: { kind: "venue" },
        startsOn: "2026-11-26",
        endsOn: "2026-11-26",
        weekdays: null,
        window: null,
      },
    });
  });

  it("lists nothing when nothing is closed or paused", () => {
    expect(rowsOf(venue())[3]).toEqual({ row: 4, pause: null, now: [], next: null });
  });

  it("carries an online pause that is in force, apart from the closures", () => {
    const row = rowsOf(venue([rule("r-pause", ONLINE)]))[3];
    expect(row).toEqual({
      row: 4,
      pause: { ruleId: "r-pause", inForce: true, fromMinute: null },
      now: [],
      next: null,
    });
  });

  it("carries an online pause that is waiting for its time", () => {
    const waiting = rule("r-pause", { ...ONLINE, window: { version: 1, from: 1080, to: 2880 } });
    expect(rowsOf(venue([waiting]))[3].pause).toEqual({
      ruleId: "r-pause",
      inForce: false,
      fromMinute: 1080,
    });
    // Once its time is reached it is in force.
    expect(rowsOf(venue([waiting]), { nowMinute: 1100 })[3].pause).toMatchObject({
      inForce: true,
    });
  });

  it("holds a closure whose time has not come as the next closure, not as closed now", () => {
    const fromSix = rule("r-from-six", { window: { version: 1, from: 1080, to: 2880 } });
    const expected = { ruleId: "r-from-six", window: { from: 1080, to: 2880 } };
    expect(rowsOf(venue([fromSix]))[3]).toMatchObject({ now: [], next: expected });
    expect(rowsOf(venue([fromSix]), { nowMinute: 1100 })[3]).toMatchObject({
      now: [expected],
      next: null,
    });
  });

  it("reads a repeating closure by its weekdays, and not as closed on a skipped date", () => {
    const thursdays = rule("r-series", {
      startsOn: "2026-11-01",
      endsOn: "2027-02-28",
      repeat: { version: 1, weekdays: [4] },
    });
    const skipToday = rule("r-skip", { kind: "skip", seriesId: "r-series" });
    expect(rowsOf(venue([thursdays]))[3].now).toMatchObject([
      { ruleId: "r-series", weekdays: [4] },
    ]);
    expect(rowsOf(venue([thursdays, skipToday]))[3]).toMatchObject({
      now: [],
      next: { ruleId: "r-series" },
    });
    // A Friday: the series is not closed now.
    expect(rowsOf(venue([thursdays]), { today: "2026-11-13" })[3].now).toEqual([]);
  });
});

describe("hubRows: 5 booking rules", () => {
  it("carries the three values, null where one is not set", () => {
    const settings = { maxAdvanceBooking: 60, minAdvanceBooking: 2 };
    expect(rowsOf(venue(), { settings })[4]).toEqual({
      row: 5,
      rules: { daysAhead: 60, noticeHours: 2, largestParty: null },
    });
  });

  it("carries no rules when none is set", () => {
    expect(rowsOf(venue())[4]).toEqual({ row: 5, rules: null });
    expect(rowsOf(venue(), { settings: {} })[4]).toEqual({ row: 5, rules: null });
  });
});

describe("hub-rows.ts is policy", () => {
  it("imports no React, router or i18n", () => {
    const source = readFileSync(join(import.meta.dirname, "hub-rows.ts"), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => /react|router|i18n/i.test(from ?? ""))).toEqual([]);
  });
});
