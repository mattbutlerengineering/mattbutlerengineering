import { describe, expect, it } from "vitest";
import { addDays, resolveDay } from "@mbe/availability";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { FIXTURE_TIMEZONE, fixtureConfig } from "./resolved-day-fixtures.js";
import { saveRegularWeek as save, supersededWeekOf } from "./superseded-fixtures.js";
import { isSupersededRegularWeek, visibleSchedules } from "./superseded-schedules.js";

const TODAY = "2026-10-30"; // a Friday, the fixture's one open weekday
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

function resolve(config: AvailabilityConfig, date: string) {
  return resolveDay({ timezone: FIXTURE_TIMEZONE, config }, date);
}

/** What a day shows: its schedule and services (not the `regularWeek` flag, which moves with the week). */
function shown(config: AvailabilityConfig, date: string) {
  const { scheduleId, services, closures, bookingOpen } = resolve(config, date);
  return { scheduleId, services, closures, bookingOpen };
}

/** The fixture week on every day, Dinner running to 2:00 AM. */
function overnight(): AvailabilityConfig {
  const base = fixtureConfig();
  return {
    ...base,
    scheduleServices: base.scheduleServices.map((s) =>
      s.venueServiceId === "vs-dinner" ? { ...s, closesAt: 1560 } : s
    ),
    assignments: base.assignments.map((a) => ({ ...a, weekdays: EVERY_DAY })),
  };
}

const visibleOthers = (config: AvailabilityConfig, serviceDate: string) =>
  visibleSchedules(config, serviceDate).filter((s) => !s.isRegular);

describe("a superseded regular week", () => {
  it("is hidden once nothing reaches it from the service date on, so three saves leave no row", () => {
    let config = fixtureConfig();
    for (const run of [1, 2, 3]) {
      config = save(config, TODAY, `run${run}`);
      expect(visibleOthers(config, TODAY)).toEqual([]);
    }
    // It is only hidden, not removed: History and Undo still read the record.
    expect(config.schedules.filter((s) => !s.archivedAt && !s.isRegular)).toHaveLength(3);
    expect(visibleSchedules(config, TODAY).map((s) => s.isRegular)).toEqual([true]);
  });

  it("leaves every date, past ones too, resolving exactly as before the save", () => {
    const before = fixtureConfig();
    const after = save(before, TODAY);
    for (const date of [addDays(TODAY, -7), addDays(TODAY, -14), addDays(TODAY, -35)]) {
      const was = resolve(before, date);
      expect(was.services.length).toBeGreaterThan(0);
      expect(shown(after, date)).toEqual(shown(before, date));
      expect(resolve(after, date).scheduleId).toBe("regular");
    }
    expect(after.schedules.every((s) => !s.archivedAt)).toBe(true);
  });

  it("keeps running, and listed, until a later start date has passed", () => {
    const config = save(fixtureConfig(), "2026-11-06");
    const old = config.schedules.find((s) => s.kind === "regular" && !s.isRegular);
    expect(old).toBeDefined();
    // Its assignment runs to Nov 5: still reaching the service date before that.
    expect(isSupersededRegularWeek(config, old!, "2026-11-05")).toBe(false);
    expect(isSupersededRegularWeek(config, old!, "2026-11-06")).toBe(true);
    expect(visibleOthers(config, "2026-11-06")).toEqual([]);
  });

  it("stays visible while a date rule uses it", () => {
    const config = save(fixtureConfig(), TODAY);
    const old = config.schedules.find((s) => !s.isRegular)!;
    const used: AvailabilityConfig = {
      ...config,
      dateRules: [
        {
          id: "use-old",
          kind: "use_schedule",
          targetKind: "venue",
          startsOn: "2026-12-04",
          endsOn: "2026-12-04",
          useScheduleId: old.id,
        },
      ],
    };
    expect(visibleOthers(used, TODAY).map((s) => s.id)).toEqual([old.id]);
  });

  describe("and the date rules that use it", () => {
    const useOld = (
      config: AvailabilityConfig,
      startsOn: string,
      endsOn: string | null
    ): AvailabilityConfig => ({
      ...config,
      dateRules: [
        {
          id: "use-old",
          kind: "use_schedule",
          targetKind: "venue",
          startsOn,
          endsOn,
          useScheduleId: supersededWeekOf(config).id,
        } satisfies DateRule,
      ],
    });

    it("hides it when the only rule that used it is over", () => {
      const used = useOld(save(fixtureConfig(), TODAY), "2026-10-02", "2026-10-02");
      expect(visibleOthers(used, TODAY)).toEqual([]);
    });

    it("shows it while a rule runs on the service date itself", () => {
      const config = save(fixtureConfig(), TODAY);
      const used = useOld(config, "2026-10-23", TODAY);
      expect(visibleOthers(used, TODAY).map((s) => s.id)).toEqual([supersededWeekOf(config).id]);
    });

    it("shows it while an open-ended rule uses it, however long ago it started", () => {
      const config = save(fixtureConfig(), TODAY);
      const used = useOld(config, "2026-09-04", null);
      expect(visibleOthers(used, TODAY).map((s) => s.id)).toEqual([supersededWeekOf(config).id]);
    });
  });

  it("shows a demoted week whose assignment has no end date", () => {
    const config = save(fixtureConfig(), TODAY);
    const old = supersededWeekOf(config);
    const openEnded: AvailabilityConfig = {
      ...config,
      assignments: config.assignments.map((a) =>
        a.scheduleId === old.id ? { ...a, endsOn: null } : a
      ),
    };
    expect(isSupersededRegularWeek(openEnded, old, TODAY)).toBe(false);
    expect(visibleOthers(openEnded, TODAY).map((s) => s.id)).toEqual([old.id]);
  });

  it("never hides a schedule the Manager made", () => {
    const base = fixtureConfig();
    const named: AvailabilityConfig = {
      ...base,
      schedules: [
        ...base.schedules,
        { id: "wk", name: "Weeknight", kind: "alternate", isRegular: false },
      ],
    };
    expect(visibleOthers(named, TODAY).map((s) => s.id)).toEqual(["wk"]);
  });

  describe("on an overnight venue", () => {
    // 00:30 Saturday Oct 31: the calendar date is the 31st, but Friday's service is still running.
    const SERVICE_DATE = "2026-10-30";
    const CALENDAR_DATE = "2026-10-31";

    it("still lists last night's week at 00:30, so a 1:00 AM booking keeps its service", () => {
      const before = overnight();
      const after = save(before, CALENDAR_DATE);
      const old = after.schedules.find((s) => s.kind === "regular" && !s.isRegular)!;
      expect(isSupersededRegularWeek(after, old, SERVICE_DATE)).toBe(false);
      expect(isSupersededRegularWeek(after, old, CALENDAR_DATE)).toBe(true);
      // The night's service is untouched: it still runs past 1:00 AM (minute 1500 of Friday).
      const friday = resolve(after, SERVICE_DATE);
      expect(shown(after, SERVICE_DATE)).toEqual(shown(before, SERVICE_DATE));
      expect(friday.services.some((s) => s.opensAt <= 1500 && 1500 < s.closesAt)).toBe(true);
    });
  });
});
