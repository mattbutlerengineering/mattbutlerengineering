import { describe, expect, it } from "vitest";
import type { AvailabilityConfig, DateRule } from "@mbe/types";
import { holidayCountry, holidaysIn, upcomingHolidays } from "./holidays.js";

const dateOf = (country: "US" | "CA" | "MX", year: number, id: string) =>
  holidaysIn(country, year).find((h) => h.id === id)?.date;

const EMPTY: AvailabilityConfig = {
  schedules: [],
  venueServices: [],
  scheduleServices: [],
  assignments: [],
  dateRules: [],
};

const closure = (startsOn: string, extra: Partial<DateRule> = {}) =>
  ({
    id: `r-${startsOn}`,
    kind: "closure",
    targetKind: "venue",
    startsOn,
    endsOn: startsOn,
    ...extra,
  }) as DateRule;

describe("holidaysIn", () => {
  it("places the moving US holidays on their weekday", () => {
    expect(dateOf("US", 2026, "thanksgiving")).toBe("2026-11-26");
    expect(dateOf("US", 2027, "thanksgiving")).toBe("2027-11-25");
    expect(dateOf("US", 2026, "memorialDay")).toBe("2026-05-25");
    expect(dateOf("US", 2026, "laborDay")).toBe("2026-09-07");
    expect(dateOf("US", 2026, "juneteenth")).toBe("2026-06-19");
    expect(dateOf("CA", 2026, "juneteenth")).toBeUndefined();
    // Father's Day is the third Sunday of June in all three countries.
    expect(dateOf("US", 2026, "fathersDay")).toBe("2026-06-21");
    expect(dateOf("MX", 2027, "fathersDay")).toBe("2027-06-20");
    expect(dateOf("US", 2026, "mothersDay")).toBe("2026-05-10");
  });

  it("places Easter and the days hung on it", () => {
    expect(dateOf("US", 2026, "easter")).toBe("2026-04-05");
    expect(dateOf("US", 2027, "easter")).toBe("2027-03-28");
    expect(dateOf("CA", 2027, "goodFriday")).toBe("2027-03-26");
    expect(dateOf("MX", 2027, "holyThursday")).toBe("2027-03-25");
  });

  it("gives Canada its own Thanksgiving, Victoria Day and Boxing Day", () => {
    expect(dateOf("CA", 2026, "thanksgiving")).toBe("2026-10-12");
    // May 24, 2027 is a Monday: Victoria Day is that day; in 2026 it is the Monday before.
    expect(dateOf("CA", 2027, "victoriaDay")).toBe("2027-05-24");
    expect(dateOf("CA", 2026, "victoriaDay")).toBe("2026-05-18");
    expect(dateOf("CA", 2026, "boxingDay")).toBe("2026-12-26");
    expect(dateOf("US", 2026, "boxingDay")).toBeUndefined();
  });

  it("gives Mexico its fixed and Monday holidays", () => {
    expect(dateOf("MX", 2027, "constitutionDay")).toBe("2027-02-01");
    expect(dateOf("MX", 2027, "benitoJuarez")).toBe("2027-03-15");
    expect(dateOf("MX", 2026, "revolutionDay")).toBe("2026-11-16");
    expect(dateOf("MX", 2026, "mothersDay")).toBe("2026-05-10");
    expect(dateOf("MX", 2026, "independenceDay")).toBe("2026-09-16");
  });

  it("lists a year in date order", () => {
    const dates = holidaysIn("MX", 2026).map((h) => h.date);
    expect(dates).toEqual([...dates].sort());
  });
});

describe("upcomingHolidays", () => {
  it("lists from today to the horizon, across the new year", () => {
    const ids = upcomingHolidays("US", "2026-11-04", EMPTY).map((h) => `${h.id} ${h.date}`);
    expect(ids).toEqual([
      "thanksgiving 2026-11-26",
      "christmasEve 2026-12-24",
      "christmasDay 2026-12-25",
      "newYearsEve 2026-12-31",
      "newYearsDay 2027-01-01",
      "valentinesDay 2027-02-14",
    ]);
  });

  it("includes a holiday that is today", () => {
    expect(upcomingHolidays("US", "2026-11-26", EMPTY)[0]?.id).toBe("thanksgiving");
  });

  it("drops a date a rule already covers, and keeps one only a skip or Tonight touches", () => {
    const config: AvailabilityConfig = {
      ...EMPTY,
      dateRules: [
        closure("2026-12-24", { endsOn: "2026-12-26" }),
        closure("2026-11-26", { kind: "skip" } as Partial<DateRule>),
      ],
    };
    const ids = upcomingHolidays("US", "2026-11-04", config).map((h) => h.id);
    expect(ids).not.toContain("christmasEve");
    expect(ids).not.toContain("christmasDay");
    expect(ids).toContain("thanksgiving");
  });

  it("drops a date an open-ended or repeating rule covers on that weekday only", () => {
    // Thursdays closed from Nov 1 on: Thanksgiving is planned; Christmas Eve (a Thursday) too.
    const config: AvailabilityConfig = {
      ...EMPTY,
      dateRules: [closure("2026-11-01", { endsOn: null, repeat: { version: 1, weekdays: [4] } })],
    };
    const ids = upcomingHolidays("US", "2026-11-04", config).map((h) => h.id);
    expect(ids).not.toContain("thanksgiving");
    expect(ids).not.toContain("christmasEve");
    expect(ids).toContain("christmasDay");
  });
});

describe("holidayCountry", () => {
  it("prefers the address, then the language's region, and knows only US, CA and MX", () => {
    expect(holidayCountry("ca", "en-US")).toBe("CA");
    expect(holidayCountry(undefined, "es-MX")).toBe("MX");
    expect(holidayCountry(undefined, "en-US")).toBe("US");
    expect(holidayCountry("FR", "fr-CA")).toBeNull();
    expect(holidayCountry(undefined, "en")).toBeNull();
  });
});
