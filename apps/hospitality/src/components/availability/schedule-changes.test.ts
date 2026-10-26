import { describe, expect, it } from "vitest";
import { applyChanges, resolveDay, validateConfig } from "@mbe/availability";
import type { AvailabilityConfig, Schedule, ScheduleAssignment } from "@mbe/types";
import { seedServices, type DraftService } from "./draft-changes.js";
import {
  buildDeleteScheduleChanges,
  buildEditScheduleChanges,
  buildNewScheduleChanges,
  buildRegularWeekChanges,
  isScheduleUnused,
  overlappingSchedules,
  datesOfUse,
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

/** The fixture venue's regular week, as the rows a draft starts from. */
function regularDraft(config: AvailabilityConfig): DraftService[] {
  return seedServices(config, { services: [] }, { kind: "schedule", scheduleId: "regular" });
}

const asNew = (services: DraftService[]) =>
  services.map((s) => ({ ...s, scheduleServiceId: null }));

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
      services: asNew(regularDraft(config)),
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
      services: asNew(regularDraft(config)),
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
    const services = regularDraft(config).map((s) =>
      s.name === "Dinner" ? { ...s, closesAt: 1320, lastSeatingAt: 1260 } : s
    );
    const changes = buildEditScheduleChanges({
      config,
      scheduleId: "regular",
      name: "Regular week",
      services,
      makeId: counter(),
    });
    const next = applyChanges(config, changes, NOW);
    expect(next.schedules[0]?.name).toBe("Regular week");
    expect(resolve(next, "2026-10-30").services.at(-1)?.closesAt).toBe(1320);
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
      services: asNew(regularDraft(config)),
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

describe("Change regular week", () => {
  const draftOf = (config: AvailabilityConfig) =>
    regularDraft(config).map((s) =>
      s.name === "Dinner" ? { ...s, lastSeatingAt: 1290, closesAt: 1410 } : s
    );

  it("an ending date: the new hours run for the period, then the regular week returns", () => {
    const config = fixtureConfig();
    const changes = buildRegularWeekChanges({
      config,
      name: "Summer hours",
      services: draftOf(config),
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
      services: draftOf(config),
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
        services: draftOf(config),
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
          services: draftOf(config),
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
