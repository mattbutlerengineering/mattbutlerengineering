import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, ScheduleService } from "@mbe/types";
import {
  closureDetail,
  configSavedDetail,
  readDetail,
  reopenedDetail,
  revertedDetail,
  tonightDetail,
  tonightEndedDetail,
} from "./availability-change-detail.js";

const TODAY = "2026-11-03";
const EMPTY: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

describe("change detail builders", () => {
  it("counts the rows of a config save", () => {
    const part = (n: number) => ({ schedules: new Array(n).fill({}) });
    expect(
      configSavedDetail(
        { create: part(2), update: part(0), remove: part(1) } as never,
        EMPTY,
        EMPTY,
        TODAY
      )
    ).toEqual({ code: "config_saved", added: 2, changed: 0, removed: 1 });
  });

  it("words a closure with its span and what became of the bookings", () => {
    const counts = { cancel: 2, move: 1, keep_notify: 3, keep_silent: 1 } as never;
    expect(
      closureDetail(
        { kind: "closure", startsOn: "2026-12-24", endsOn: "2026-12-26" } as never,
        counts
      )
    ).toEqual({
      code: "closure_saved",
      startsOn: "2026-12-24",
      endsOn: "2026-12-26",
      cancelled: 2,
      moved: 1,
      kept: 4,
    });
  });

  it("gives a close-early its own code, and an open end as null", () => {
    const counts = { cancel: 0, move: 0, keep_notify: 0, keep_silent: 0 } as never;
    expect(
      closureDetail({ kind: "tonight", startsOn: "2026-12-24", endsOn: undefined } as never, counts)
    ).toMatchObject({ code: "close_early_saved", endsOn: null });
  });

  it("names a reopened closure by its first and last day, null for an open end", () => {
    expect(reopenedDetail({ startsOn: "2026-12-24", endsOn: "2026-12-24" } as never)).toEqual({
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: "2026-12-24",
    });
    expect(reopenedDetail({ startsOn: "2026-12-24", endsOn: undefined } as never)).toEqual({
      code: "closure_reopened",
      startsOn: "2026-12-24",
      endsOn: null,
    });
  });

  it("gives each Tonight change a code, with the number it needs", () => {
    expect(tonightDetail({ type: "pause_online" } as never)).toEqual({
      code: "tonight_pause_online",
    });
    expect(tonightDetail({ type: "close_early" } as never)).toEqual({
      code: "tonight_close_early",
    });
    expect(tonightDetail({ type: "stop_window" } as never)).toEqual({
      code: "tonight_stop_window",
    });
    expect(tonightDetail({ type: "block_tables", tableIds: ["a", "b"] } as never)).toEqual({
      code: "tonight_block_tables",
      tables: 2,
    });
    expect(tonightDetail({ type: "pacing", covers: 12 } as never)).toEqual({
      code: "tonight_pacing",
      covers: 12,
    });
    expect(tonightEndedDetail()).toEqual({ code: "tonight_ended" });
  });

  it("marks a revert of a change that has a detail, and gives none for one that has not", () => {
    expect(revertedDetail({ code: "config_saved", added: 1, changed: 0, removed: 0 })).toEqual({
      code: "config_saved",
      added: 1,
      changed: 0,
      removed: 0,
      reverted: true,
    });
    expect(revertedDetail(null)).toBeNull();
    expect(revertedDetail("garbage")).toBeNull();
  });

  describe("a save that changes the regular week", () => {
    const hours = { opensAt: 1020, lastSeatingAt: 1260, closesAt: 1320 };
    const row = (over: Partial<ScheduleService>): ScheduleService => ({
      id: "ss-1",
      scheduleId: "reg",
      venueServiceId: "vs-dinner",
      ...hours,
      seating: { version: 1, interval: 15 },
      bookingTypes: ["online", "phone"],
      weekdays: [],
      dayHours: { version: 1, sets: [] },
      ...over,
    });
    const config = (
      rows: ScheduleService[],
      over: Partial<AvailabilityConfig> = {}
    ): AvailabilityConfig => ({
      schedules: [{ id: "reg", name: "Regular", kind: "regular", isRegular: true }],
      venueServices: [{ id: "vs-dinner", name: "Dinner", position: 0 }],
      scheduleServices: rows,
      assignments: [
        { id: "as-1", scheduleId: "reg", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
      ],
      dateRules: [],
      ...over,
    });
    const diff = { create: {}, update: { scheduleServices: [{}] }, remove: {} } as never;
    const fridayLater = (closesAt: number) =>
      row({
        weekdays: [0, 1, 2, 3, 4, 6],
        dayHours: {
          version: 1,
          sets: [
            {
              weekdays: [5],
              ...hours,
              closesAt,
              seating: { version: 1, interval: 15 },
              bookingTypes: ["online", "phone"],
            },
          ],
        },
      });

    it("names Friday alone when only Friday's close changed", () => {
      expect(
        configSavedDetail(diff, config([fridayLater(1380)]), config([fridayLater(1410)]), TODAY)
      ).toMatchObject({ code: "regular_week_changed", startsOn: TODAY, weekdays: [5] });
    });

    it("names every weekday a saved uniform week newly runs on", () => {
      expect(configSavedDetail(diff, EMPTY, config([row({})]), TODAY)).toMatchObject({
        code: "regular_week_changed",
        startsOn: TODAY,
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      });
    });

    it("starts a later-dated regular version on its own start date", () => {
      const after = config([row({ closesAt: 1380 })], {
        assignments: [
          {
            id: "as-1",
            scheduleId: "reg",
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            startsOn: "2026-12-01",
            precedence: 0,
          },
        ],
      });
      expect(configSavedDetail(diff, config([row({})]), after, TODAY)).toMatchObject({
        code: "regular_week_changed",
        startsOn: "2026-12-01",
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      });
    });

    it("is config_saved when a service is only renamed", () => {
      const before = config([row({})]);
      const after = config([row({})], {
        venueServices: [{ id: "vs-dinner", name: "Supper", position: 0 }],
      });
      expect(
        configSavedDetail(
          { create: {}, update: { venueServices: [{}] }, remove: {} } as never,
          before,
          after,
          TODAY
        )
      ).toEqual({ code: "config_saved", added: 0, changed: 1, removed: 0 });
    });

    it("is config_saved when only a non-regular schedule's hours change", () => {
      const alternate = (closesAt: number) =>
        config([row({}), row({ id: "ss-2", scheduleId: "alt", closesAt })], {
          schedules: [
            { id: "reg", name: "Regular", kind: "regular", isRegular: true },
            { id: "alt", name: "Summer", kind: "alternate", isRegular: false },
          ],
          assignments: [
            { id: "as-1", scheduleId: "reg", weekdays: [0, 1, 2, 3, 4, 5, 6], precedence: 0 },
            {
              id: "as-2",
              scheduleId: "alt",
              weekdays: [5],
              startsOn: "2026-12-01",
              endsOn: "2026-12-31",
              precedence: 1,
            },
          ],
        });
      expect(configSavedDetail(diff, alternate(1380), alternate(1410), TODAY)).toMatchObject({
        code: "config_saved",
      });
    });

    it("ignores a regular schedule row's id and encoding: the same week saved again is config_saved", () => {
      const again = row({ id: "ss-other", scheduleId: "reg" });
      expect(configSavedDetail(diff, config([row({})]), config([again]), TODAY)).toMatchObject({
        code: "config_saved",
      });
    });
  });

  it("reads a stored detail, and refuses what is not one", () => {
    expect(readDetail({ code: "tonight_ended" })).toEqual({ code: "tonight_ended" });
    expect(readDetail(null)).toBeNull();
    expect(readDetail({ nope: 1 })).toBeNull();
  });
});
