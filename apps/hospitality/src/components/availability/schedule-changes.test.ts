import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay, validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, Schedule, ScheduleAssignment } from "@mbe/types";
import { demoDraft, draftBlock, draftService } from "./quick-setup-demo.fixture.js";
import { draftFromConfig, draftToConfig, type QuickSetupDraft } from "./quick-setup-draft.js";
import {
  buildDeleteScheduleChanges,
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  buildRegularWeekChanges,
  isScheduleUnused,
  overlappingSchedules,
  datesOfUse,
  replacesRegularWeek,
  weekdayRuns,
} from "./schedule-changes.js";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";

const NOW = "2026-10-25T00:00:00.000Z";
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

function resolve(config: AvailabilityConfig, date: string) {
  return resolveDay({ timezone: FIXTURE_TIMEZONE, config }, date);
}

/** The regular week as Change regular week opens it: `draftFromConfig`. */
function weekDraft(config: AvailabilityConfig): QuickSetupDraft {
  let n = 0;
  return draftFromConfig(config, () => `draft-${++n}`);
}
/** A schedule's services as the editor opens them, with the days a new use would cover. */
function scheduleDraft(
  config: AvailabilityConfig,
  days?: readonly number[],
  scheduleId = "regular"
): QuickSetupDraft {
  let n = 0;
  const draft = draftFromConfig(config, () => `draft-${++n}`, scheduleId);
  return days ? { ...draft, days } : draft;
}

/** A dated alternate schedule already in the venue (Patio season, Nov 1 – Nov 30). */
function withPatio(): AvailabilityConfig {
  const base = fixtureConfig();
  const patio: Schedule = {
    id: "patio",
    name: "Patio season",
    kind: "alternate",
    isRegular: false,
  };
  const assignment: ScheduleAssignment = {
    id: "as-patio",
    scheduleId: "patio",
    weekdays: EVERY_DAY,
    startsOn: "2026-11-01",
    endsOn: "2026-11-30",
    precedence: 1,
  };
  return {
    ...base,
    schedules: [...base.schedules, patio],
    scheduleServices: [
      ...base.scheduleServices,
      ...base.scheduleServices
        .filter((s) => s.scheduleId === "regular")
        .map((s) => ({ ...s, id: `${s.id}-patio`, scheduleId: "patio" })),
    ],
    assignments: [...base.assignments, assignment],
  };
}

describe("weekdayRuns", () => {
  it("groups consecutive days Monday first, so Sunday joins Saturday", () => {
    expect(weekdayRuns([1, 2, 3, 4])).toEqual([[1, 4]]);
    expect(weekdayRuns([5, 6, 0])).toEqual([[5, 0]]);
    expect(weekdayRuns([1, 3, 4])).toEqual([
      [1, 1],
      [3, 4],
    ]);
    expect(weekdayRuns([])).toEqual([]);
  });
});

describe("isScheduleUnused", () => {
  it("is used where an assignment points at it, and for the regular week", () => {
    const config = withPatio();
    expect(isScheduleUnused(config, "patio")).toBe(false);
    expect(isScheduleUnused(config, "regular")).toBe(false);
  });

  it("is unused once nothing assigns it and no date rule uses it", () => {
    const config = { ...withPatio(), assignments: fixtureConfig().assignments };
    expect(isScheduleUnused(config, "patio")).toBe(true);
    const used = {
      ...config,
      dateRules: [
        {
          id: "r-use",
          kind: "use_schedule" as const,
          targetKind: "venue" as const,
          startsOn: "2026-12-24",
          endsOn: "2026-12-24",
          useScheduleId: "patio",
        },
      ],
    };
    expect(isScheduleUnused(used, "patio")).toBe(false);
  });

  it("deleting an unused schedule removes only that schedule", () => {
    expect(buildDeleteScheduleChanges("patio").remove).toEqual({ schedules: ["patio"] });
  });
});

describe("new and duplicated schedules", () => {
  it("creates the schedule, its services and an assignment that beats the regular week", () => {
    const config = fixtureConfig();
    const changes = buildNewScheduleChanges({
      config,
      name: "Weeknight",
      draft: scheduleDraft(config, [1, 2, 3, 4]),
      useOn: { weekdays: [1, 2, 3, 4], startsOn: null, endsOn: null },
      winner: "new",
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(validateConfig(next)).toEqual([]);
    const weeknight = next.schedules.find((s) => s.name === "Weeknight");
    expect(weeknight?.kind).toBe("alternate");
    // Mon-Thu now run the new schedule; the regular week's Friday is untouched.
    expect(resolve(next, "2026-10-26").scheduleId).toBe(weeknight?.id);
    expect(resolve(next, "2026-10-30").scheduleId).toBe("regular");
    // The source schedule's service rows were copied, not moved.
    expect(next.scheduleServices.filter((s) => s.scheduleId === "regular")).toHaveLength(2);
  });

  it("a copy used nowhere has no assignment", () => {
    const config = fixtureConfig();
    const changes = buildNewScheduleChanges({
      config,
      name: "Weekend (copy)",
      draft: scheduleDraft(config, []),
      useOn: { weekdays: [], startsOn: null, endsOn: null },
      winner: "new",
      makeId: counter(),
    });
    expect(changes.upsert.assignments ?? []).toEqual([]);
    const id = changes.upsert.schedules![0]!.id;
    expect(isScheduleUnused(applyChanges(config, changes, NOW), id)).toBe(true);
  });

  it("renaming and re-timing a schedule edits its own rows", () => {
    const config = fixtureConfig();
    const draft = scheduleDraft(config);
    const changes = buildEditScheduleChanges({
      config,
      scheduleId: "regular",
      name: "Regular week",
      draft: {
        ...draft,
        services: draft.services.map((s) =>
          s.name === "Dinner" ? { ...s, lastSeating: "21:00", closes: "22:00" } : s
        ),
      },
      makeId: counter(),
      baseline: config,
    });
    const next = applyChanges(config, changes, NOW);
    expect(next.schedules[0]?.name).toBe("Regular week");
    expect(resolve(next, "2026-10-30").services.at(-1)?.closesAt).toBe(1320);
    // Each service keeps its stored row.
    expect(changes.upsert.scheduleServices?.map((s) => s.id).sort()).toEqual([
      "ss-dinner",
      "ss-lunch",
    ]);
  });

  it("a schedule with one service Mon–Fri and later hours Fri saves its sets and reads them back", () => {
    const config = fixtureConfig();
    const base = scheduleDraft(config, [1, 2, 3, 4, 5, 6]);
    const draft: QuickSetupDraft = {
      ...base,
      services: [
        {
          ...draftService("d", "Dinner", ["17:00", "21:00", "23:00"], { days: [1, 2, 3, 4, 5] }),
          blocks: [draftBlock("late", [5], ["17:00", "22:00", "00:00"])],
        },
      ],
    };
    const changes = buildNewScheduleChanges({
      config,
      name: "Late Fridays",
      draft,
      useOn: { weekdays: [1, 2, 3, 4, 5], startsOn: null, endsOn: null },
      winner: "new",
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(validateConfig(next)).toEqual([]);
    const [row] = next.scheduleServices.filter((s) => s.scheduleId === "new-1");
    expect(row?.dayHours.sets).toHaveLength(1);
    expect(row?.dayHours.sets[0]?.weekdays).toEqual([5]);
    // Reopened, the same service, days and block come back.
    const reopened = draftFromConfig(next, () => "x", "new-1");
    expect(reopened.services).toHaveLength(1);
    expect(reopened.services[0]).toMatchObject({
      name: "Dinner",
      opens: "17:00",
      closes: "23:00",
      blocks: [{ days: [5], closes: "00:00" }],
    });
    expect(resolve(next, "2026-10-30").services.at(-1)?.closesAt).toBe(1440);
  });
});

describe("overlap precedence", () => {
  const dates = { startsOn: "2026-11-10", endsOn: "2026-12-10" };

  it("names the other dated schedules a new one overlaps, never the regular week", () => {
    const config = withPatio();
    const overlaps = overlappingSchedules(config, { weekdays: EVERY_DAY, ...dates });
    expect(overlaps.map((s) => s.id)).toEqual(["patio"]);
    expect(
      overlappingSchedules(config, { weekdays: EVERY_DAY, startsOn: "2026-12-01", endsOn: null })
    ).toEqual([]);
  });

  it.each([
    ["new", "new-1"],
    ["existing", "patio"],
  ] as const)("when %s wins, the overlap resolves to that schedule", (winner, expected) => {
    const config = withPatio();
    const changes = buildNewScheduleChanges({
      config,
      name: "Summer",
      draft: scheduleDraft(config, EVERY_DAY),
      useOn: { weekdays: EVERY_DAY, ...dates },
      winner,
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(validateConfig(next)).toEqual([]);
    // new-1 is the first id handed out: the schedule itself.
    expect(resolve(next, "2026-11-13").scheduleId).toBe(expected);
    // Outside the overlap each keeps its own dates.
    expect(resolve(next, "2026-12-05").scheduleId).toBe("new-1");
    expect(resolve(next, "2026-11-05").scheduleId).toBe("patio");
  });
});

// The regular week always gives way to a schedule, so one with no end on all its days would
// leave nothing that Change regular week could reach. The fixture's regular week runs Fridays.
describe("a new schedule that would take the regular week over", () => {
  const TODAY = "2026-10-25";
  const everyDay = (): AvailabilityConfig => ({
    ...fixtureConfig(),
    assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: EVERY_DAY, precedence: 0 }],
  });

  it("is refused with no end date when it runs on every day the regular week does", () => {
    const config = fixtureConfig();
    expect(replacesRegularWeek(config, { weekdays: [1, 2, 3, 4, 5] }, TODAY)).toBe(true);
    // A later start only moves when the takeover begins.
    expect(
      replacesRegularWeek(config, { weekdays: [5], startsOn: "2026-12-01", endsOn: null }, TODAY)
    ).toBe(true);
  });

  it("is allowed with an end date, on days that leave the regular week some of its own, or on none", () => {
    const config = everyDay();
    expect(replacesRegularWeek(config, { weekdays: [5, 6, 0] }, TODAY)).toBe(false);
    expect(
      replacesRegularWeek(
        config,
        { weekdays: EVERY_DAY, startsOn: null, endsOn: "2026-12-31" },
        TODAY
      )
    ).toBe(false);
    expect(replacesRegularWeek(config, { weekdays: [] }, TODAY)).toBe(false);
  });

  it("counts only versions of the regular week that have not ended", () => {
    // Change regular week superseded an every-day version yesterday; the live one runs Fridays.
    const base = fixtureConfig();
    const config: AvailabilityConfig = {
      ...base,
      schedules: [
        ...base.schedules,
        { id: "old", name: "Regular week", kind: "regular", isRegular: false },
      ],
      assignments: [
        ...base.assignments,
        {
          id: "as-old",
          scheduleId: "old",
          weekdays: EVERY_DAY,
          endsOn: "2026-10-24",
          precedence: 0,
        },
      ],
    };
    expect(replacesRegularWeek(config, { weekdays: [5] }, TODAY)).toBe(true);
  });
});

describe("Change regular week", () => {
  const draftOf = (config: AvailabilityConfig): QuickSetupDraft => {
    const draft = weekDraft(config);
    return {
      ...draft,
      services: draft.services.map((s) =>
        s.name === "Dinner"
          ? { ...s, lastSeating: "21:30", closes: "23:30", lastSeatingLinked: false }
          : s
      ),
    };
  };

  it("an ending date: the new hours run for the period, then the regular week returns", () => {
    const config = fixtureConfig();
    const changes = buildRegularWeekChanges({
      config,
      name: "Summer hours",
      draft: draftOf(config),
      startsOn: "2026-10-26",
      endsOn: "2026-11-01",
      winner: "new",
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(validateConfig(next)).toEqual([]);
    expect(resolve(next, "2026-10-30").services.at(-1)?.closesAt).toBe(1410);
    expect(resolve(next, "2026-10-30").scheduleId).toBe("new-1");
    // After the end date the regular week is back with no action.
    expect(resolve(next, "2026-11-06").scheduleId).toBe("regular");
    expect(resolve(next, "2026-11-06").services.at(-1)?.closesAt).toBe(1380);
    expect(next.schedules.find((s) => s.isRegular)?.id).toBe("regular");
  });

  it("no end date: the new week becomes the regular week from the start date", () => {
    const config = fixtureConfig();
    const changes = buildRegularWeekChanges({
      config,
      name: "Winter hours",
      draft: draftOf(config),
      startsOn: "2026-11-02",
      endsOn: null,
      winner: "new",
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(validateConfig(next)).toEqual([]);
    expect(next.schedules.filter((s) => s.isRegular && !s.archivedAt)).toHaveLength(1);
    expect(next.schedules.find((s) => s.isRegular)?.id).toBe("new-1");
    expect(resolve(next, "2026-10-30").scheduleId).toBe("regular");
    expect(resolve(next, "2026-11-06").scheduleId).toBe("new-1");
    // The handover: the day before still reads the old week.
    expect(resolve(next, "2026-10-30").services.at(-1)?.closesAt).toBe(1380);
  });

  it("no end date on a legacy venue: an open-ended alternate at precedence 0 still wins its days", () => {
    // Legacy migration gives every hours group's assignment precedence 0.
    const base = fixtureConfig();
    const alternate: Schedule = {
      id: "alt-1",
      name: "Alternate week 1",
      kind: "alternate",
      isRegular: false,
    };
    const config: AvailabilityConfig = {
      ...base,
      schedules: [...base.schedules, alternate],
      scheduleServices: [
        ...base.scheduleServices,
        ...base.scheduleServices
          .filter((s) => s.scheduleId === "regular")
          .map((s) => ({ ...s, id: `${s.id}-alt`, scheduleId: "alt-1" })),
      ],
      assignments: [
        { id: "as-regular", scheduleId: "regular", weekdays: [1, 2, 3, 4, 5], precedence: 0 },
        { id: "as-alt", scheduleId: "alt-1", weekdays: [0, 6], precedence: 0 },
      ],
    };
    expect(validateConfig(config)).toEqual([]);
    const next = applyChanges(
      config,
      buildRegularWeekChanges({
        config,
        name: "Winter hours",
        draft: draftOf(config),
        startsOn: "2026-12-01",
        endsOn: null,
        winner: "new",
        makeId: counter(),
      }),
      NOW
    );
    expect(validateConfig(next)).toEqual([]);
    expect(next.schedules.find((s) => s.isRegular)?.id).toBe("new-1");
    // Sat Dec 5 and Sun Dec 6 still read the alternate; weekdays read the new regular week.
    expect(resolve(next, "2026-12-05").scheduleId).toBe("alt-1");
    expect(resolve(next, "2026-12-06").scheduleId).toBe("alt-1");
    expect(resolve(next, "2026-12-04").scheduleId).toBe("new-1");
    // Before the start date: the old weekdays and the alternate weekend are unchanged.
    expect(resolve(next, "2026-11-27").scheduleId).toBe("regular");
    expect(resolve(next, "2026-11-28").scheduleId).toBe("alt-1");
  });

  it("an overlap with another dated schedule can go either way", () => {
    const config = withPatio();
    const make = (winner: "new" | "existing") =>
      applyChanges(
        config,
        buildRegularWeekChanges({
          config,
          name: "Summer hours",
          draft: draftOf(config),
          startsOn: "2026-11-10",
          endsOn: "2026-12-10",
          winner,
          makeId: counter(),
        }),
        NOW
      );
    expect(resolve(make("new"), "2026-11-13").scheduleId).toBe("new-1");
    expect(resolve(make("existing"), "2026-11-13").scheduleId).toBe("patio");
    expect(validateConfig(make("existing"))).toEqual([]);
  });
});

describe("Change regular week by weekday", () => {
  const MON = "2026-11-02";
  const FRI = "2026-11-06";
  const WEEK = [MON, "2026-11-03", "2026-11-04", "2026-11-05", FRI, "2026-11-07", "2026-11-08"];

  /** The PRD demo week, stored: lunch Mon–Fri, dinner Tue–Sun (later Fri–Sat), brunch Sat–Sun. */
  function demoConfig(): AvailabilityConfig {
    let n = 0;
    return draftToConfig(demoDraft(), () => `demo-${++n}`);
  }

  const timesOn = (config: AvailabilityConfig, date: string) =>
    resolve(config, date).services.map((s) => [s.name, s.opensAt, s.lastSeatingAt, s.closesAt]);

  const build = (
    config: AvailabilityConfig,
    draft: QuickSetupDraft,
    endsOn: string | null,
    startsOn = MON
  ) =>
    applyChanges(
      config,
      buildRegularWeekChanges({
        config,
        name: "Summer hours",
        draft,
        startsOn,
        endsOn,
        winner: "new",
        makeId: counter(),
      }),
      NOW
    );

  /** The demo week with Friday's dinner closing 11:30 PM instead of 12:00 AM. */
  function earlierFriday(config: AvailabilityConfig): QuickSetupDraft {
    const draft = weekDraft(config);
    const friday = {
      id: "fri",
      days: [5],
      opens: "17:00",
      lastSeating: "22:00",
      closes: "23:30",
      lastSeatingLinked: false,
    };
    return {
      ...draft,
      services: draft.services.map((s) =>
        s.name === "Dinner"
          ? {
              ...s,
              blocks: [
                ...s.blocks.map((b) => ({ ...b, days: b.days.filter((d) => d !== 5) })),
                friday,
              ].filter((b) => b.days.length > 0),
            }
          : s
      ),
    };
  }

  it("a no-end change of one weekday's hours leaves the other six unchanged and names no schedule", () => {
    const config = demoConfig();
    const next = build(config, earlierFriday(config), null);
    expect(validateConfig(next)).toEqual([]);
    for (const date of WEEK.filter((d) => d !== FRI)) {
      expect(timesOn(next, date)).toEqual(timesOn(config, date));
    }
    expect(resolve(next, FRI).services.find((s) => s.name === "Dinner")?.closesAt).toBe(1410);
    // One new regular version, called what the Manager already sees, and no other schedule.
    expect(next.schedules.map((s) => [s.name, s.kind])).toEqual([
      ["Regular week", "regular"],
      ["Regular week", "regular"],
    ]);
  });

  it("a closed weekday can be opened", () => {
    const config = demoConfig();
    const draft = weekDraft(config);
    // Brunch now runs Monday too; before, only Lunch did.
    const opened: QuickSetupDraft = {
      ...draft,
      services: draft.services.map((s) => (s.name === "Brunch" ? { ...s, days: [1, 6, 0] } : s)),
    };
    const next = build(config, opened, null);
    expect(resolve(next, MON).services.map((s) => s.name)).toEqual(["Brunch", "Lunch"]);
  });

  it("a weekday the regular week never ran is opened by a service that runs it", () => {
    const base = fixtureConfig(); // the regular week runs Friday only
    const draft = weekDraft(base);
    const next = build(base, { ...draft, days: [1, 5] }, null, "2026-10-26");
    expect(resolve(next, "2026-10-26").scheduleId).toBe("new-1");
  });

  it("with no end a weekday no service runs on is closed from the start date", () => {
    const config = demoConfig();
    const draft = weekDraft(config);
    // Tuesday: Lunch and Dinner both stop running on it.
    const closedTue: QuickSetupDraft = {
      ...draft,
      services: draft.services.map((s) => {
        if (s.name === "Lunch") return { ...s, days: [1, 3, 4, 5] };
        if (s.name === "Dinner") return { ...s, days: [3, 4, 5, 6, 0] };
        return s;
      }),
    };
    const next = build(config, closedTue, null, "2026-11-10");
    expect(validateConfig(next)).toEqual([]);
    expect(resolve(next, "2026-11-03").services.length).toBeGreaterThan(0);
    expect(resolve(next, "2026-11-10").scheduleId).toBeNull();
    expect(resolve(next, "2026-11-10").services).toEqual([]);
    expect(resolve(next, "2026-11-11").services.length).toBeGreaterThan(0);
  });

  it("with an end date the period covers the days the services run and the rest keep their hours", () => {
    const config = demoConfig();
    const next = build(config, earlierFriday(config), "2026-11-08");
    expect(validateConfig(next)).toEqual([]);
    expect(next.schedules.find((s) => s.name === "Summer hours")).toMatchObject({
      kind: "alternate",
      isRegular: false,
    });
    expect(resolve(next, FRI).services.find((s) => s.name === "Dinner")?.closesAt).toBe(1410);
    expect(timesOn(next, "2026-11-13")).toEqual(timesOn(config, "2026-11-13"));

    // A weekday no edited service runs on is outside the period and keeps what it had.
    const draft = weekDraft(config);
    const noLunch = { ...draft, services: draft.services.filter((s) => s.name !== "Lunch") };
    const quiet = build(config, noLunch, "2026-11-08");
    expect(timesOn(quiet, MON)).toEqual(timesOn(config, MON));
  });

  it("keeps a service's seating and booking types, which the week editor has no controls for", () => {
    const config = demoConfig();
    const phoneOnly = {
      seating: { version: 1 as const, fixed: [1050, 1140] },
      bookingTypes: ["phone" as const],
    };
    const stored: AvailabilityConfig = {
      ...config,
      scheduleServices: config.scheduleServices.map((row) => {
        const name = config.venueServices.find((v) => v.id === row.venueServiceId)?.name;
        return name === "Dinner"
          ? {
              ...row,
              ...phoneOnly,
              dayHours: {
                ...row.dayHours,
                sets: row.dayHours.sets.map((set) => ({ ...set, ...phoneOnly })),
              },
            }
          : row;
      }),
    };
    const next = build(stored, earlierFriday(stored), null);
    const dinner = next.scheduleServices.filter(
      (row) =>
        row.scheduleId === "new-1" &&
        next.venueServices.find((v) => v.id === row.venueServiceId)?.name === "Dinner"
    );
    expect(dinner).toHaveLength(1);
    expect(dinner[0]).toMatchObject(phoneOnly);
    expect(dinner[0]?.dayHours.sets.every((set) => set.bookingTypes.join() === "phone")).toBe(true);
  });
});

describe("Change regular week on a venue that is closed some days", () => {
  const TUE_SAT = [2, 3, 4, 5, 6];
  const SUN = "2026-11-01";
  const MON = "2026-10-26";
  const TUE = "2026-10-27";

  /** A Tue-Sat venue: Sunday and Monday have no assignment, so they resolve to no schedule. */
  function tueSat(): AvailabilityConfig {
    const base = fixtureConfig();
    return {
      ...base,
      assignments: [{ id: "as-regular", scheduleId: "regular", weekdays: TUE_SAT, precedence: 0 }],
    };
  }

  /** A migrated venue (#7738): Mon-Wed is the regular week, "Thu–Fri hours" runs its own hours. */
  function migrated(): AvailabilityConfig {
    const base = fixtureConfig();
    const alternate: Schedule = {
      id: "thu-fri",
      name: "Thu–Fri hours",
      kind: "alternate",
      isRegular: false,
    };
    return {
      ...base,
      schedules: [...base.schedules, alternate],
      scheduleServices: [
        ...base.scheduleServices,
        ...base.scheduleServices
          .filter((s) => s.scheduleId === "regular")
          .map((s) => ({
            ...s,
            id: `${s.id}-tf`,
            scheduleId: "thu-fri",
            // Thu-Fri dinner runs later than the regular week's.
            ...(s.venueServiceId === "vs-dinner" ? { closesAt: 1410 } : {}),
          })),
      ],
      assignments: [
        { id: "as-regular", scheduleId: "regular", weekdays: [1, 2, 3], precedence: 0 },
        { id: "as-tf", scheduleId: "thu-fri", weekdays: [4, 5], precedence: 0 },
      ],
    };
  }

  const input = (config: AvailabilityConfig, endsOn: string | null) => ({
    config,
    name: "Summer hours",
    draft: weekDraft(config),
    startsOn: "2026-10-26",
    endsOn,
    winner: "new" as const,
    makeId: counter(),
  });

  it("reads the weekdays the regular week is used on", () => {
    expect(weekDraft(tueSat()).days).toEqual(TUE_SAT);
    expect(weekDraft(migrated()).days).toEqual([1, 2, 3]);
  });

  it("with an end date, Sunday and Monday stay closed", () => {
    const config = tueSat();
    const next = applyChanges(config, buildRegularWeekChanges(input(config, "2026-11-08")), NOW);
    expect(validateConfig(next)).toEqual([]);
    expect(resolve(next, TUE).scheduleId).toBe("new-1");
    expect(resolve(next, MON).scheduleId).toBeNull();
    expect(resolve(next, SUN).scheduleId).toBeNull();
  });

  it("with no end date, Sunday and Monday stay closed", () => {
    const config = tueSat();
    const next = applyChanges(config, buildRegularWeekChanges(input(config, null)), NOW);
    expect(validateConfig(next)).toEqual([]);
    expect(resolve(next, TUE).scheduleId).toBe("new-1");
    expect(resolve(next, MON).scheduleId).toBeNull();
    expect(resolve(next, SUN).scheduleId).toBeNull();
  });

  it.each([["2026-11-30"], [null]])(
    "a day-named schedule keeps its own days and hours (ends %s)",
    (endsOn) => {
      const config = migrated();
      const next = applyChanges(config, buildRegularWeekChanges(input(config, endsOn)), NOW);
      expect(validateConfig(next)).toEqual([]);
      // Mon-Wed take the new hours; Thu-Fri still run "Thu–Fri hours"; the weekend stays closed.
      expect(resolve(next, MON).scheduleId).toBe("new-1");
      expect(resolve(next, "2026-10-29").scheduleId).toBe("thu-fri");
      expect(resolve(next, "2026-10-29").services.at(-1)?.closesAt).toBe(1410);
      expect(resolve(next, "2026-10-31").scheduleId).toBeNull();
      expect(resolve(next, SUN).scheduleId).toBeNull();
    }
  );
});

describe("datesOfUse", () => {
  it("lists the future dates a use covers, in a bounded range", () => {
    const dates = datesOfUse(
      { weekdays: [5], startsOn: "2026-10-26", endsOn: "2026-11-30" },
      "2026-10-25"
    );
    expect(dates).toEqual(["2026-10-30", "2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
  });

  it("does not list past dates", () => {
    expect(
      datesOfUse(
        { weekdays: EVERY_DAY, startsOn: "2026-10-01", endsOn: "2026-10-27" },
        "2026-10-25"
      )
    ).toEqual(["2026-10-25", "2026-10-26", "2026-10-27"]);
  });
});

describe("an hour set's own seating and booking types", () => {
  const SET_OWN = {
    seating: { version: 1 as const, fixed: [1140, 1200] },
    bookingTypes: ["phone" as const],
  };

  /** The demo week stored, with Dinner's Fri–Sat set seating differently from its base (a stored row the API or a collapse can make). */
  function storedWithOwnSet(): AvailabilityConfig {
    let n = 0;
    const config = draftToConfig(demoDraft(), () => `demo-${++n}`);
    return {
      ...config,
      scheduleServices: config.scheduleServices.map((row) =>
        config.venueServices.find((v) => v.id === row.venueServiceId)?.name === "Dinner"
          ? {
              ...row,
              dayHours: {
                ...row.dayHours,
                sets: row.dayHours.sets.map((set) => ({ ...set, ...SET_OWN })),
              },
            }
          : row
      ),
    };
  }

  const dinnerRow = (config: AvailabilityConfig, scheduleId: string) =>
    config.scheduleServices.find(
      (row) =>
        row.scheduleId === scheduleId &&
        config.venueServices.find((v) => v.id === row.venueServiceId)?.name === "Dinner"
    );

  it("Change regular week keeps the set's seating and booking types when only the base hours change", () => {
    const config = storedWithOwnSet();
    const baseSeating = dinnerRow(config, config.schedules[0]!.id)?.seating;
    const draft = weekDraft(config);
    const edited: QuickSetupDraft = {
      ...draft,
      services: draft.services.map((s) =>
        s.name === "Dinner" ? { ...s, closes: "22:30", lastSeating: "21:30" } : s
      ),
    };
    const next = applyChanges(
      config,
      buildRegularWeekChanges({
        config,
        name: "Regular week",
        draft: edited,
        startsOn: "2026-11-02",
        endsOn: null,
        winner: "new",
        makeId: counter(),
      }),
      NOW
    );
    const dinner = dinnerRow(next, "new-1");
    expect(dinner?.dayHours.sets).toHaveLength(1);
    expect(dinner?.dayHours.sets[0]).toMatchObject(SET_OWN);
    expect(dinner?.seating).toEqual(baseSeating);
    expect(dinner?.bookingTypes).toEqual(["online", "phone"]);
  });

  it("Edit schedule keeps the set's seating and booking types through a rename", () => {
    const config = storedWithOwnSet();
    const scheduleId = config.schedules[0]!.id;
    const changes = buildEditScheduleChanges({
      config,
      scheduleId,
      name: "Renamed week",
      draft: scheduleDraft(config, undefined, scheduleId),
      makeId: counter(),
      baseline: config,
    });
    const next = applyChanges(config, changes, NOW);
    const dinner = dinnerRow(next, scheduleId);
    expect(dinner?.dayHours.sets[0]).toMatchObject(SET_OWN);
    expect(dinner?.bookingTypes).toEqual(["online", "phone"]);
    expect(next.schedules[0]?.name).toBe("Renamed week");
  });
});
