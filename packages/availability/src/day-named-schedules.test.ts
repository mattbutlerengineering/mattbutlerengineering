import type {
  AvailabilityConfig,
  DateRule,
  Schedule,
  ScheduleAssignment,
  ScheduleService,
} from "@mbe/types";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyChanges } from "./apply-draft.js";
import {
  collapseDayNamedSchedules as collapseWith,
  weekdayRangeLabel,
} from "./day-named-schedules.js";
import { resolveDay } from "./resolve-day.js";
import { validateConfig } from "./validate-config.js";

// 2026-11-01 is a Sunday: DATES[d] is the date of weekday d (0 = Sunday).
const DATES = [
  "2026-11-01",
  "2026-11-02",
  "2026-11-03",
  "2026-11-04",
  "2026-11-05",
  "2026-11-06",
  "2026-11-07",
] as const;
const NOW = "2026-11-01T00:00:00.000Z";

function collapseDayNamedSchedules(config: AvailabilityConfig, newId?: () => string) {
  let n = 0;
  return collapseWith(config, newId ?? (() => `new-${++n}`));
}

const hours = (opensAt: number, closesAt: number) => ({
  opensAt,
  lastSeatingAt: closesAt - 45,
  closesAt,
  seating: { version: 1 as const, interval: 15 },
  bookingTypes: ["online" as const, "phone" as const],
});

const row = (
  id: string,
  scheduleId: string,
  venueServiceId: string,
  opensAt: number,
  closesAt: number,
  scope: Partial<Pick<ScheduleService, "weekdays" | "dayHours">> = {}
): ScheduleService => ({
  id,
  scheduleId,
  venueServiceId,
  ...hours(opensAt, closesAt),
  weekdays: [],
  dayHours: { version: 1, sets: [] },
  ...scope,
});

const schedule = (
  id: string,
  name: string,
  kind: Schedule["kind"],
  isRegular = false
): Schedule => ({
  id,
  name,
  kind,
  isRegular,
});

const assignment = (
  id: string,
  scheduleId: string,
  weekdays: number[],
  precedence = 0,
  dates: Partial<Pick<ScheduleAssignment, "startsOn" | "endsOn">> = {}
): ScheduleAssignment => ({ id, scheduleId, weekdays, precedence, ...dates });

const venueServices = [
  { id: "vs-dinner", name: "Dinner", position: 0 },
  { id: "vs-brunch", name: "Brunch", position: 1 },
];

/** Regular Mon–Wed plus the old backfill's "Thu–Fri hours". */
const migrated = (): AvailabilityConfig => ({
  schedules: [
    schedule("regular", "Regular week", "regular", true),
    schedule("thu-fri", "Thu–Fri hours", "alternate"),
  ],
  venueServices,
  scheduleServices: [
    row("ss-reg", "regular", "vs-dinner", 1020, 1320),
    row("ss-alt", "thu-fri", "vs-dinner", 1020, 1380),
  ],
  assignments: [assignment("a-reg", "regular", [1, 2, 3]), assignment("a-alt", "thu-fri", [4, 5])],
  dateRules: [],
});

const comparable = (config: AvailabilityConfig) =>
  DATES.map((date) => {
    const day = resolveDay({ timezone: "UTC", config }, date);
    return {
      services: day.services.map(({ scheduleServiceId: _id, ...s }) => s),
      bookingOpen: day.bookingOpen,
      closed: day.scheduleId === null,
    };
  });

describe("weekdayRangeLabel", () => {
  it("joins runs with an en dash and gaps with commas, Monday first", () => {
    expect(weekdayRangeLabel([4, 5])).toBe("Thu–Fri");
    expect(weekdayRangeLabel([6])).toBe("Sat");
    expect(weekdayRangeLabel([1, 3])).toBe("Mon, Wed");
    expect(weekdayRangeLabel([0, 6, 5])).toBe("Fri–Sun");
  });
});

describe("collapseDayNamedSchedules", () => {
  it("folds a migrated pair into the regular week", () => {
    const config = migrated();
    const changes = collapseDayNamedSchedules(config);
    expect(changes).not.toBeNull();
    const next = applyChanges(config, changes!, NOW);

    expect(comparable(next)).toEqual(comparable(config));
    expect(next.schedules.find((s) => s.id === "thu-fri")?.archivedAt).toBe(NOW);
    expect(next.assignments.map((a) => a.id)).toEqual(["a-reg"]);
    expect(next.assignments[0]?.weekdays).toEqual([1, 2, 3, 4, 5]);
    expect(next.scheduleServices.filter((r) => r.scheduleId === "regular")).toHaveLength(1);
    expect(collapseDayNamedSchedules(next)).toBeNull();
  });

  it("leaves a Manager-made schedule with another name alone", () => {
    const config = migrated();
    const renamed = {
      ...config,
      schedules: config.schedules.map((s) =>
        s.id === "thu-fri" ? { ...s, name: "Late nights" } : s
      ),
    };
    expect(collapseDayNamedSchedules(renamed)).toBeNull();
  });

  it("returns null for a dated assignment or a use_schedule reference", () => {
    const config = migrated();
    const dated = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.id === "a-alt" ? { ...a, startsOn: "2026-12-01" } : a
      ),
    };
    expect(collapseDayNamedSchedules(dated)).toBeNull();

    const rule: DateRule = {
      id: "dr-1",
      kind: "use_schedule",
      targetKind: "venue",
      startsOn: "2026-12-24",
      useScheduleId: "thu-fri",
    };
    expect(collapseDayNamedSchedules({ ...config, dateRules: [rule] })).toBeNull();
  });

  it("returns null when the regular schedule or a collapsible schedule is archived", () => {
    const config = migrated();
    const archived = {
      ...config,
      schedules: config.schedules.map((s) => (s.id === "thu-fri" ? { ...s, archivedAt: NOW } : s)),
    };
    expect(collapseDayNamedSchedules(archived)).toBeNull();
  });

  it("collapses an alternate that overlaps the regular week at higher precedence", () => {
    const config: AvailabilityConfig = {
      ...migrated(),
      schedules: [
        schedule("regular", "Regular week", "regular", true),
        schedule("fri-sat", "Fri–Sat hours", "alternate"),
      ],
      scheduleServices: [
        row("ss-reg", "regular", "vs-dinner", 1020, 1320),
        row("ss-alt", "fri-sat", "vs-dinner", 1020, 1380),
      ],
      assignments: [
        assignment("a-reg", "regular", [1, 2, 3, 4, 5]),
        assignment("a-alt", "fri-sat", [5, 6], 1),
      ],
    };
    const changes = collapseDayNamedSchedules(config);
    expect(changes).not.toBeNull();
    const next = applyChanges(config, changes!, NOW);
    expect(comparable(next)).toEqual(comparable(config));
    const rows = next.scheduleServices.filter((r) => r.scheduleId === "regular");
    // The regular-only hours run on Mon–Thu (the covered days minus the set's, so `weekdays` is
    // empty); Fri–Sat carry the later close as a set.
    expect(rows).toHaveLength(1);
    expect(rows[0]?.closesAt).toBe(1320);
    expect(rows[0]?.weekdays).toEqual([]);
    expect(rows[0]?.dayHours.sets).toEqual([expect.objectContaining({ weekdays: [5, 6] })]);
    expect(validateConfig(next).map((i) => i.code)).not.toContain("precedence_tie");
  });

  it("adds a service only the folded schedule ran, with an id from newId", () => {
    const config = migrated();
    const withBrunch = {
      ...config,
      scheduleServices: [
        ...config.scheduleServices,
        row("ss-brunch", "thu-fri", "vs-brunch", 600, 840),
      ],
    };
    const changes = collapseDayNamedSchedules(withBrunch, () => "new-row");
    const next = applyChanges(withBrunch, changes!, NOW);
    expect(comparable(next)).toEqual(comparable(withBrunch));
    expect(next.scheduleServices.find((r) => r.id === "new-row")).toMatchObject({
      scheduleId: "regular",
      venueServiceId: "vs-brunch",
      weekdays: [4, 5],
    });
  });

  it("refuses a collapse that would reorder a third assignment", () => {
    const config = migrated();
    const between = {
      ...config,
      schedules: [...config.schedules, schedule("other", "Patio", "alternate")],
      assignments: [
        assignment("a-reg", "regular", [1, 2, 3]),
        assignment("a-alt", "thu-fri", [4, 5], 5),
        assignment("a-other", "other", [4], 3),
      ],
    };
    expect(collapseDayNamedSchedules(between)).toBeNull();
  });

  it("refuses two undated assignments tying on a weekday", () => {
    const config = migrated();
    const tied = {
      ...config,
      assignments: [
        assignment("a-reg", "regular", [1, 2, 3, 4]),
        assignment("a-alt", "thu-fri", [4, 5]),
      ],
    };
    expect(collapseDayNamedSchedules(tied)).toBeNull();
  });
});

/** Disjoint or overlapping day-named schedules over generated hours; the config is built to be collapsible. */
const dayNamedConfigArb = fc
  .record({
    regularDays: fc.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1 }),
    regularOpen: fc.integer({ min: 8, max: 20 }).map((h) => h * 60),
    regularLength: fc.integer({ min: 2, max: 8 }).map((h) => h * 60),
    scoped: fc.boolean(),
    alternates: fc.array(
      fc.record({
        days: fc.subarray([0, 1, 2, 3, 4, 5, 6], { minLength: 1 }),
        open: fc.integer({ min: 8, max: 20 }).map((h) => h * 60),
        length: fc.integer({ min: 2, max: 8 }).map((h) => h * 60),
        precedence: fc.integer({ min: 0, max: 2 }),
        second: fc.boolean(),
      }),
      { minLength: 1, maxLength: 3 }
    ),
  })
  .map(({ regularDays, regularOpen, regularLength, scoped, alternates }): AvailabilityConfig => {
    const regularRows = [
      row("r-1", "regular", "vs-dinner", regularOpen, regularOpen + regularLength, {
        // A scoped regular row: later close on its first day.
        dayHours: scoped
          ? {
              version: 1,
              sets: [
                {
                  weekdays: regularDays.slice(0, 1),
                  ...hours(regularOpen, regularOpen + regularLength + 60),
                },
              ],
            }
          : { version: 1, sets: [] },
      }),
    ];
    const folded = alternates.map((alt, i) => ({
      schedule: schedule(`alt-${i}`, `${weekdayRangeLabel(alt.days)} hours`, "alternate"),
      rows: [
        row(`alt-${i}-1`, `alt-${i}`, "vs-dinner", alt.open, alt.open + alt.length),
        ...(alt.second ? [row(`alt-${i}-2`, `alt-${i}`, "vs-brunch", 480, 600)] : []),
      ],
      assignment: assignment(`a-alt-${i}`, `alt-${i}`, alt.days, alt.precedence),
    }));
    return {
      schedules: [
        schedule("regular", "Regular week", "regular", true),
        ...folded.map((f) => f.schedule),
      ],
      venueServices,
      scheduleServices: [...regularRows, ...folded.flatMap((f) => f.rows)],
      assignments: [
        assignment("a-reg", "regular", regularDays, 0),
        ...folded.map((f) => f.assignment),
      ],
      dateRules: [],
    };
  });

describe("collapseDayNamedSchedules (property)", () => {
  it("never changes what any weekday resolves to", () => {
    let collapsed = 0;
    fc.assert(
      fc.property(dayNamedConfigArb, (config) => {
        const changes = collapseDayNamedSchedules(config);
        if (changes === null) return;
        collapsed += 1;
        const next = applyChanges(config, changes, NOW);
        expect(comparable(next)).toEqual(comparable(config));
        expect(collapseDayNamedSchedules(next)).toBeNull();
        expect(validateConfig(next).map((i) => i.code)).not.toContain("precedence_tie");
      }),
      { numRuns: 300 }
    );
    expect(collapsed).toBeGreaterThan(0);
  });
});
