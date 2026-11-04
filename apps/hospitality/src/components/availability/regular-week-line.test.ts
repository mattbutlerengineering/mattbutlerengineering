import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { DEMO_WEEK_CONFIG } from "../../utils/demo-week.fixture.js";
import { regularWeekLine } from "./regular-week-line.js";

const byName = (config: AvailabilityConfig) =>
  Object.fromEntries(regularWeekLine(config).services.map((s) => [s.name, s]));

describe("regularWeekLine", () => {
  it("reads the demo week as each service's days, Monday first", () => {
    const services = byName(DEMO_WEEK_CONFIG);
    expect(services.Lunch?.days).toEqual([1, 2, 3, 4, 5]);
    expect(services.Dinner?.days).toEqual([2, 3, 4, 5, 6, 0]);
    expect(services.Brunch?.days).toEqual([6, 0]);
  });

  it("says Dinner closes later on Fri and Sat", () => {
    expect(byName(DEMO_WEEK_CONFIG).Dinner?.changes).toEqual([{ weekdays: [5, 6], kind: "later" }]);
    expect(byName(DEMO_WEEK_CONFIG).Lunch?.changes).toEqual([]);
  });

  it("says earlier for an earlier close and different for other hours", () => {
    const dinner = DEMO_WEEK_CONFIG.scheduleServices.find((s) => s.id === "demo-ss-dinner")!;
    const set = dinner.dayHours.sets[0]!;
    const withSet = (patch: Partial<typeof set>): AvailabilityConfig => ({
      ...DEMO_WEEK_CONFIG,
      scheduleServices: DEMO_WEEK_CONFIG.scheduleServices.map((s) =>
        s.id === dinner.id ? { ...s, dayHours: { version: 1, sets: [{ ...set, ...patch }] } } : s
      ),
    });
    expect(byName(withSet({ closesAt: 1320, lastSeatingAt: 1260 })).Dinner?.changes[0]?.kind).toBe(
      "earlier"
    );
    expect(
      byName(withSet({ closesAt: dinner.closesAt, lastSeatingAt: 1260, opensAt: 960 })).Dinner
        ?.changes[0]?.kind
    ).toBe("different");
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
    const line = regularWeekLine(uniform);
    expect(line.uniform).toBe(true);
    expect(line.services[0]?.days).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(regularWeekLine(DEMO_WEEK_CONFIG).uniform).toBe(false);
  });

  it("lists no schedule or assignment, and ignores archived or non-regular schedules", () => {
    const other: AvailabilityConfig = {
      ...DEMO_WEEK_CONFIG,
      schedules: [
        ...DEMO_WEEK_CONFIG.schedules,
        { id: "holiday", name: "Holiday", kind: "alternate", isRegular: false },
      ],
    };
    expect(regularWeekLine(other)).toEqual(regularWeekLine(DEMO_WEEK_CONFIG));
    expect(regularWeekLine({ ...DEMO_WEEK_CONFIG, scheduleServices: [] }).services).toEqual([]);
  });
});
