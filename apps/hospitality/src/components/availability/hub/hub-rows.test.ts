import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { AvailabilityConfig } from "@mbe/types";
import { hubRows } from "./hub-rows.js";
import {
  dinnerRow,
  EVERY_DAY,
  input,
  rowsOf,
  seasonal,
  valid,
  venue,
} from "./hub-rows-test-helpers.js";

const DINNER = {
  venueServiceId: "vs-dinner",
  name: "Dinner",
  opensAt: 1020,
  lastSeatingAt: 1260,
  closesAt: 1320,
  days: [1, 2, 3, 4, 5, 6, 0],
  changes: [],
};

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
    const config = valid({ ...venue(), scheduleServices: [] });
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

describe("the hub's pure modules are policy", () => {
  const modules = readdirSync(import.meta.dirname).filter(
    (name) => name.endsWith(".ts") && !/test/.test(name)
  );

  it("covers hub-rows.ts and the row modules it is built from", () => {
    expect(modules).toEqual(
      expect.arrayContaining(["hub-rows.ts", "hub-special-dates.ts", "hub-closures.ts"])
    );
  });

  it.each(modules)("%s imports no React, router or i18n", (name) => {
    const source = readFileSync(join(import.meta.dirname, name), "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.filter((from) => /react|router|i18n/i.test(from ?? ""))).toEqual([]);
  });
});
