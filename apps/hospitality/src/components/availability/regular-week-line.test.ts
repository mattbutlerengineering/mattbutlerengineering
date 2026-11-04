import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../../utils/demo-week.fixture.js";
import { regularWeekLine, upcomingRegularWeek } from "./regular-week-line.js";

const TODAY = "2026-11-04";

const byName = (config: AvailabilityConfig, today = TODAY) =>
  Object.fromEntries(regularWeekLine(config, today).services.map((s) => [s.name, s]));

describe("regularWeekLine", () => {
  it("reads the demo week as each service's days, Monday first", () => {
    const services = byName(DEMO_WEEK_CONFIG);
    expect(services.Lunch?.days).toEqual([1, 2, 3, 4, 5]);
    expect(services.Dinner?.days).toEqual([2, 3, 4, 5, 6, 0]);
    expect(services.Brunch?.days).toEqual([6, 0]);
  });

  it("reads each service's base hours and Dinner's later close on Fri and Sat", () => {
    const { Dinner, Lunch } = byName(DEMO_WEEK_CONFIG);
    const dinner = DEMO_WEEK_CONFIG.scheduleServices.find((s) => s.id === "demo-ss-dinner")!;
    const set = dinner.dayHours.sets[0]!;
    expect(Dinner).toMatchObject({ opensAt: dinner.opensAt, closesAt: dinner.closesAt });
    expect(Dinner?.changes).toEqual([
      { weekdays: [5, 6], opensAt: set.opensAt, closesAt: set.closesAt },
    ]);
    expect(set.closesAt).toBeGreaterThan(dinner.closesAt);
    expect(Lunch?.changes).toEqual([]);
  });

  it("is uniform when every service runs the same days with no different hours", () => {
    const uniform: AvailabilityConfig = {
      ...DEMO_WEEK_CONFIG,
      venueServices: [DEMO_WEEK_CONFIG.venueServices[1]!],
      scheduleServices: [
        {
          ...DEMO_WEEK_CONFIG.scheduleServices[1]!,
          weekdays: [],
          dayHours: { version: 1, sets: [] },
        },
      ],
    };
    const line = regularWeekLine(uniform, TODAY);
    expect(line.uniform).toBe(true);
    expect(line.services[0]?.days).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(regularWeekLine(DEMO_WEEK_CONFIG, TODAY).uniform).toBe(false);
  });

  it("lists no schedule or assignment, and ignores archived or non-regular schedules", () => {
    const other: AvailabilityConfig = {
      ...DEMO_WEEK_CONFIG,
      schedules: [
        ...DEMO_WEEK_CONFIG.schedules,
        { id: "holiday", name: "Holiday", kind: "alternate", isRegular: false },
      ],
    };
    expect(regularWeekLine(other, TODAY)).toEqual(regularWeekLine(DEMO_WEEK_CONFIG, TODAY));
    expect(regularWeekLine({ ...DEMO_WEEK_CONFIG, scheduleServices: [] }, TODAY).services).toEqual(
      []
    );
  });

  it("reads the week in force today, not a dated Change regular week that starts later", () => {
    const dated = datedConfig();
    expect(byName(dated, TODAY).Dinner?.changes.map((c) => c.weekdays)).toEqual([[5, 6]]);
    expect(Object.keys(byName(dated, "2026-12-01"))).toEqual(["Dinner"]);
    expect(byName(dated, "2026-12-01").Dinner?.changes).toEqual([]);
  });
});

/** The demo week until Nov 30, then a Change regular week from Dec 1: Dinner every day, no later Fri–Sat. */
function datedConfig(): AvailabilityConfig {
  const old = DEMO_WEEK_CONFIG.schedules[0]!;
  const dinner = DEMO_WEEK_CONFIG.scheduleServices.find((r) => r.id === "demo-ss-dinner")!;
  return {
    ...DEMO_WEEK_CONFIG,
    schedules: [
      { ...old, isRegular: false },
      { ...old, id: "next", isRegular: true },
    ],
    scheduleServices: [
      ...DEMO_WEEK_CONFIG.scheduleServices,
      {
        ...dinner,
        id: "next-dinner",
        scheduleId: "next",
        weekdays: [],
        dayHours: { version: 1, sets: [] },
      },
    ],
    assignments: [
      { ...DEMO_WEEK_CONFIG.assignments[0]!, endsOn: "2026-11-30" },
      {
        id: "as-next",
        scheduleId: "next",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        precedence: 1,
        startsOn: "2026-12-01",
      },
    ],
  };
}

describe("upcomingRegularWeek", () => {
  it("reads the next dated change as it will read on its first day", () => {
    const next = upcomingRegularWeek(datedConfig(), TODAY);
    expect(next?.startsOn).toBe("2026-12-01");
    expect(next?.endsOn).toBeNull();
    expect(next?.line.services.map((s) => s.name)).toEqual(["Dinner"]);
    expect(next?.line.services[0]?.changes).toEqual([]);
  });

  it("is null once the change is in force, and with none scheduled", () => {
    expect(upcomingRegularWeek(datedConfig(), "2026-12-01")).toBeNull();
    expect(upcomingRegularWeek(DEMO_WEEK_CONFIG, TODAY)).toBeNull();
  });
});
