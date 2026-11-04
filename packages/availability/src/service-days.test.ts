import type { AvailabilityConfig, ScheduleService, VenueService } from "@mbe/types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveDay } from "./resolve-day.js";
import {
  decodeWeek,
  encodeWeek,
  hoursOn,
  servicesOn,
  type ServiceHours,
  type Week,
} from "./service-days.js";

const SEATING = { version: 1 as const, interval: 15 };
const BOOKING = ["online" as const, "phone" as const];

const row = (
  id: string,
  venueServiceId: string,
  opensAt: number,
  closesAt: number,
  scope: Partial<Pick<ScheduleService, "weekdays" | "dayHours">> = {}
): ScheduleService => ({
  id,
  scheduleId: "regular",
  venueServiceId,
  opensAt,
  lastSeatingAt: closesAt - 45,
  closesAt,
  seating: SEATING,
  bookingTypes: BOOKING,
  weekdays: [],
  dayHours: { version: 1, sets: [] },
  ...scope,
});

const set = (weekdays: number[], opensAt: number, closesAt: number) => ({
  weekdays,
  opensAt,
  lastSeatingAt: closesAt - 45,
  closesAt,
  seating: SEATING,
  bookingTypes: BOOKING,
});

const VENUE_SERVICES: VenueService[] = [
  { id: "vs-lunch", name: "Lunch", position: 0 },
  { id: "vs-dinner", name: "Dinner", position: 1 },
  { id: "vs-brunch", name: "Brunch", position: 2 },
];
const BY_ID = new Map(VENUE_SERVICES.map((v) => [v.id, v]));

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

describe("hoursOn", () => {
  it("gives an unscoped row's base hours on every weekday", () => {
    const dinner = row("ss-dinner", "vs-dinner", 1020, 1380);
    for (const weekday of ALL_DAYS) {
      expect(hoursOn(dinner, weekday)).toEqual({
        opensAt: 1020,
        lastSeatingAt: 1335,
        closesAt: 1380,
        seating: SEATING,
        bookingTypes: BOOKING,
      });
    }
  });

  it("gives the base hours only on the row's own weekdays", () => {
    const lunch = row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2, 3, 4, 5] });
    expect(hoursOn(lunch, 1)?.opensAt).toBe(690);
    expect(hoursOn(lunch, 0)).toBeNull();
    expect(hoursOn(lunch, 6)).toBeNull();
  });

  it("gives a set's hours on the weekdays it claims, and the base elsewhere", () => {
    const dinner = row("ss-dinner", "vs-dinner", 1020, 1380, {
      dayHours: { version: 1, sets: [set([5, 6], 1020, 1440)] },
    });
    expect(hoursOn(dinner, 5)?.closesAt).toBe(1440);
    expect(hoursOn(dinner, 6)?.closesAt).toBe(1440);
    expect(hoursOn(dinner, 4)?.closesAt).toBe(1380);
    expect(hoursOn(dinner, 0)?.closesAt).toBe(1380);
  });

  it("does not leak a set's weekdays into the hours it returns", () => {
    const dinner = row("ss-dinner", "vs-dinner", 1020, 1380, {
      dayHours: { version: 1, sets: [set([5], 1020, 1440)] },
    });
    expect(Object.keys(hoursOn(dinner, 5) ?? {}).sort()).toEqual([
      "bookingTypes",
      "closesAt",
      "lastSeatingAt",
      "opensAt",
      "seating",
    ]);
  });

  it("lets the first set win when two claim the same weekday (validateConfig refuses it)", () => {
    const dinner = row("ss-dinner", "vs-dinner", 1020, 1380, {
      dayHours: { version: 1, sets: [set([5], 1000, 1300), set([5], 1100, 1400)] },
    });
    expect(hoursOn(dinner, 5)?.opensAt).toBe(1000);
  });
});

describe("servicesOn", () => {
  it("lists the services running that weekday in opening order", () => {
    const rows = [
      row("ss-dinner", "vs-dinner", 1020, 1380),
      row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2, 3, 4, 5] }),
    ];
    expect(servicesOn(rows, BY_ID, 2).map((s) => s.name)).toEqual(["Lunch", "Dinner"]);
    expect(servicesOn(rows, BY_ID, 0).map((s) => s.name)).toEqual(["Dinner"]);
  });

  it("leaves out a service whose venue service is missing", () => {
    expect(servicesOn([row("ss-x", "vs-gone", 600, 700)], BY_ID, 1)).toEqual([]);
  });

  it("carries the row id and the weekday's hours", () => {
    const dinner = row("ss-dinner", "vs-dinner", 1020, 1380, {
      dayHours: { version: 1, sets: [set([5], 1020, 1440)] },
    });
    expect(servicesOn([dinner], BY_ID, 5)).toEqual([
      {
        scheduleServiceId: "ss-dinner",
        venueServiceId: "vs-dinner",
        name: "Dinner",
        opensAt: 1020,
        lastSeatingAt: 1395,
        closesAt: 1440,
        seating: SEATING,
        bookingTypes: BOOKING,
      },
    ]);
  });
});

describe("resolveDay with day scope", () => {
  const config = (
    scheduleServices: ScheduleService[],
    assignmentDays = ALL_DAYS
  ): AvailabilityConfig => ({
    schedules: [{ id: "regular", name: "Regular week", kind: "regular", isRegular: true }],
    venueServices: VENUE_SERVICES,
    scheduleServices,
    assignments: [{ id: "as", scheduleId: "regular", weekdays: assignmentDays, precedence: 0 }],
    dateRules: [],
  });
  const names = (c: AvailabilityConfig, date: string) =>
    resolveDay({ timezone: "America/Los_Angeles", config: c }, date).services.map((s) => s.name);
  // 2026-10-26 is a Monday; the week runs to Sunday 2026-11-01.
  const WEEK = [
    "2026-10-26",
    "2026-10-27",
    "2026-10-28",
    "2026-10-29",
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ];

  it("resolves a row with no scope exactly as before on every weekday", () => {
    const c = config([
      row("ss-lunch", "vs-lunch", 690, 900),
      row("ss-dinner", "vs-dinner", 1020, 1380),
    ]);
    for (const date of WEEK) expect(names(c, date)).toEqual(["Lunch", "Dinner"]);
  });

  it("runs a row scoped to Mon–Fri under a wider assignment on those days only", () => {
    const c = config([
      row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2, 3, 4, 5] }),
      row("ss-dinner", "vs-dinner", 1020, 1380),
    ]);
    expect(WEEK.map((d) => names(c, d).join("+"))).toEqual([
      "Lunch+Dinner",
      "Lunch+Dinner",
      "Lunch+Dinner",
      "Lunch+Dinner",
      "Lunch+Dinner",
      "Dinner",
      "Dinner",
    ]);
  });

  it("gives a set's hours on the days it claims with the base elsewhere", () => {
    const c = config([
      row("ss-dinner", "vs-dinner", 1020, 1380, {
        dayHours: { version: 1, sets: [set([5, 6], 1020, 1440)] },
      }),
    ]);
    const closes = WEEK.map(
      (d) => resolveDay({ timezone: "America/Los_Angeles", config: c }, d).services[0]?.closesAt
    );
    // Mon … Thu base, Fri and Sat later, Sun base.
    expect(closes).toEqual([1380, 1380, 1380, 1380, 1440, 1440, 1380]);
  });

  it("never resolves a row scoped to days no assignment covers", () => {
    const c = config([row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [6] })], [1, 2, 3, 4, 5]);
    for (const date of WEEK) expect(names(c, date)).toEqual([]);
  });

  it("is closed on a covered weekday where no row runs", () => {
    const c = config([row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2] })]);
    const sunday = resolveDay({ timezone: "America/Los_Angeles", config: c }, "2026-11-01");
    expect(sunday.scheduleId).toBe("regular");
    expect(sunday.services).toEqual([]);
  });

  it("keeps each layer's removalResult equal to resolveDay with that layer removed", () => {
    const withScope = config([
      row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2, 3, 4, 5] }),
      row("ss-dinner", "vs-dinner", 1020, 1380, {
        dayHours: { version: 1, sets: [set([5, 6], 1020, 1440)] },
      }),
    ]);
    const full: AvailabilityConfig = {
      ...withScope,
      dateRules: [
        {
          id: "dr-close",
          kind: "closure",
          targetKind: "service",
          venueServiceId: "vs-dinner",
          startsOn: "2026-10-30",
          endsOn: "2026-10-30",
        },
      ],
    };
    const snapshot = { timezone: "America/Los_Angeles", config: full };
    for (const date of WEEK) {
      const day = resolveDay(snapshot, date);
      for (const layer of day.explanation) {
        const without = {
          ...full,
          assignments: full.assignments.filter((a) => a.id !== layer.id),
          dateRules: full.dateRules.filter((r) => r.id !== layer.id),
        };
        expect(layer.removalResult).toEqual(
          (({ explanation: _e, ...summary }) => summary)(
            resolveDay({ timezone: "America/Los_Angeles", config: without }, date)
          )
        );
      }
    }
  });

  it("reports a scoped schedule's hours for the weekday in its explanation", () => {
    const c = config([
      row("ss-lunch", "vs-lunch", 690, 900, { weekdays: [1, 2, 3, 4, 5] }),
      row("ss-dinner", "vs-dinner", 1020, 1380),
    ]);
    const saturday = resolveDay({ timezone: "America/Los_Angeles", config: c }, "2026-10-31");
    const layer = saturday.explanation.find((l) => l.kind === "schedule");
    expect(layer?.hours?.map((h) => h.name)).toEqual(["Dinner"]);
  });
});

describe("encodeWeek canonical form", () => {
  const base = {
    opensAt: 1020,
    lastSeatingAt: 1335,
    closesAt: 1380,
  };
  it("groups days whose bookingTypes or fixed seating differ only in order", () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(["online", "phone", "walk_in"], { minLength: 3, maxLength: 3 }),
        fc.shuffledSubarray([1080, 1140, 1200], { minLength: 3, maxLength: 3 }),
        (types, fixed) => {
          const monday = {
            ...base,
            seating: { fixed: [1080, 1140, 1200] },
            bookingTypes: ["online", "phone", "walk_in"],
          } as ServiceHours;
          const tuesday = { ...monday, seating: { fixed }, bookingTypes: types } as ServiceHours;
          const days = Array.from({ length: 7 }, (_, d) =>
            d === 1 ? monday : d === 2 ? tuesday : null
          );
          const [row] = encodeWeek([{ venueServiceId: "vs", days }], [1, 2]);
          expect(row?.dayHours.sets).toEqual([]);
          expect(row?.weekdays).toEqual([]);
        }
      )
    );
  });
});

describe("encodeWeek and decodeWeek", () => {
  const hoursOf = (opensAt: number, closesAt: number): ServiceHours => ({
    opensAt,
    lastSeatingAt: closesAt - 45,
    closesAt,
    seating: SEATING,
    bookingTypes: BOOKING,
  });
  const daysWith = (hours: ServiceHours | null, ...on: number[]) =>
    Array.from({ length: 7 }, (_, d) => (on.includes(d) ? hours : null));
  /** Day-by-day hours from a {weekday: hours} list. */
  const dayList = (entries: readonly [number[], ServiceHours][]): (ServiceHours | null)[] =>
    Array.from({ length: 7 }, (_, d) => entries.find(([days]) => days.includes(d))?.[1] ?? null);

  it("encodes a uniform week to weekdays [] and no sets", () => {
    const week: Week = [
      { venueServiceId: "vs-dinner", days: daysWith(hoursOf(1020, 1380), ...ALL_DAYS) },
      { venueServiceId: "vs-lunch", days: daysWith(hoursOf(690, 900), ...ALL_DAYS) },
    ];
    const rows = encodeWeek(week, ALL_DAYS);
    expect(rows.map((r) => [r.venueServiceId, r.weekdays, r.dayHours.sets])).toEqual([
      ["vs-dinner", [], []],
      ["vs-lunch", [], []],
    ]);
  });

  it("encodes the demo week to one row per service with the later close as one set", () => {
    const dinner = hoursOf(1020, 1380);
    const lateDinner = hoursOf(1020, 1440);
    const week: Week = [
      { venueServiceId: "vs-lunch", days: daysWith(hoursOf(690, 900), 1, 2, 3, 4, 5) },
      {
        venueServiceId: "vs-dinner",
        days: dayList([
          [[2, 3, 4, 0], dinner],
          [[5, 6], lateDinner],
        ]),
      },
      { venueServiceId: "vs-brunch", days: daysWith(hoursOf(600, 840), 6, 0) },
    ];
    const rows = encodeWeek(week, ALL_DAYS);
    expect(rows).toEqual([
      {
        venueServiceId: "vs-lunch",
        ...hoursOf(690, 900),
        weekdays: [1, 2, 3, 4, 5],
        dayHours: { version: 1, sets: [] },
      },
      {
        venueServiceId: "vs-dinner",
        ...dinner,
        weekdays: [2, 3, 4, 0],
        dayHours: { version: 1, sets: [{ weekdays: [5, 6], ...lateDinner }] },
      },
      {
        venueServiceId: "vs-brunch",
        ...hoursOf(600, 840),
        weekdays: [6, 0],
        dayHours: { version: 1, sets: [] },
      },
    ]);
  });

  it("makes the base the hours most days share, and leaves weekdays empty when the base is every other covered day", () => {
    const [row] = encodeWeek(
      [
        {
          venueServiceId: "vs-dinner",
          days: dayList([
            [[1, 2, 3, 4, 0], hoursOf(1020, 1380)],
            [[5, 6], hoursOf(1020, 1440)],
          ]),
        },
      ],
      ALL_DAYS
    );
    expect(row?.closesAt).toBe(1380);
    expect(row?.weekdays).toEqual([]);
  });

  it("gives a tie to the group holding the earliest Monday-first day", () => {
    const [row] = encodeWeek(
      [
        {
          venueServiceId: "vs-dinner",
          days: dayList([
            [[1, 2], hoursOf(1020, 1380)],
            [[5, 6], hoursOf(1020, 1440)],
          ]),
        },
      ],
      [1, 2, 5, 6]
    );
    expect(row?.closesAt).toBe(1380);
    expect(row?.dayHours.sets.map((s) => s.weekdays)).toEqual([[5, 6]]);
  });

  it("orders sets by their first Monday-first day", () => {
    const [row] = encodeWeek(
      [
        {
          venueServiceId: "vs-dinner",
          days: dayList([
            [[1, 2, 3, 4], hoursOf(1020, 1380)],
            [[0], hoursOf(1000, 1300)],
            [[5], hoursOf(1020, 1440)],
          ]),
        },
      ],
      ALL_DAYS.filter((d) => d !== 6)
    );
    expect(row?.dayHours.sets.map((s) => s.weekdays)).toEqual([[5], [0]]);
  });

  const HOURS_POOL = [hoursOf(690, 900), hoursOf(1020, 1380), hoursOf(1020, 1440)];
  const weekArb = fc.subarray(ALL_DAYS, { minLength: 1 }).chain((covered) =>
    fc
      .array(
        fc
          .array(fc.option(fc.constantFrom(...HOURS_POOL), { nil: null }), {
            minLength: 7,
            maxLength: 7,
          })
          .map((days) => days.map((h, d) => (covered.includes(d) ? h : null)))
          .filter((days) => days.some((h) => h !== null)),
        { minLength: 1, maxLength: 3 }
      )
      .map((all): { covered: number[]; week: Week } => ({
        covered,
        week: all.map((days, i) => ({ venueServiceId: `vs-${i}`, days })),
      }))
  );

  it("round-trips: decodeWeek(encodeWeek(w, days), days) equals w, and re-encoding returns identical rows", () => {
    fc.assert(
      fc.property(weekArb, ({ covered, week }) => {
        const rows = encodeWeek(week, covered);
        const decoded = decodeWeek(rows, covered);
        expect(decoded).toEqual(week);
        expect(encodeWeek(decoded, covered)).toEqual(rows);
      }),
      { numRuns: 300 }
    );
  });

  it("produces rows no weekday claims twice and that resolve to the week", () => {
    fc.assert(
      fc.property(weekArb, ({ covered, week }) => {
        for (const row of encodeWeek(week, covered)) {
          const claimed = [...row.weekdays, ...row.dayHours.sets.flatMap((s) => s.weekdays)];
          expect(new Set(claimed).size).toBe(claimed.length);
        }
      }),
      { numRuns: 200 }
    );
  });

  it("drops a service that runs on none of the covered days", () => {
    const rows = [
      {
        venueServiceId: "vs-lunch",
        ...hoursOf(690, 900),
        weekdays: [6],
        dayHours: { version: 1 as const, sets: [] },
      },
    ];
    expect(decodeWeek(rows, [1, 2, 3, 4, 5])).toEqual([]);
  });
});
