import { afterEach, describe, expect, it } from "vitest";
import { addDays, weekdayIndexOf, weekdayOf } from "./civil-date.js";
import { WEEKDAYS } from "./types.js";

const ORIGINAL_TZ = process.env.TZ;

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

const WEEKDAY_CASES: [string, string][] = [
  ["2026-12-25", "friday"],
  ["2026-09-25", "friday"],
  ["2026-03-08", "sunday"],
  ["2026-11-01", "sunday"],
  ["2028-02-29", "tuesday"],
  ["2027-01-01", "friday"],
  ["2026-12-28", "monday"],
];

const ADD_DAYS_CASES: [string, number, string][] = [
  ["2026-12-25", 0, "2026-12-25"],
  ["2026-12-25", 1, "2026-12-26"],
  ["2026-01-31", 1, "2026-02-01"], // month
  ["2026-12-31", 1, "2027-01-01"], // year
  ["2028-02-28", 1, "2028-02-29"], // leap day
  ["2028-02-29", 1, "2028-03-01"],
  ["2027-02-28", 1, "2027-03-01"], // non-leap
  ["2027-01-01", -1, "2026-12-31"], // negative across year
  ["2028-03-01", -1, "2028-02-29"], // negative across leap day
  ["2026-03-08", 1, "2026-03-09"], // US DST spring forward
  ["2026-11-01", 1, "2026-11-02"], // US DST fall back
  ["2026-03-29", -30, "2026-02-27"],
  ["2026-01-01", 365, "2027-01-01"],
];

describe.each(["UTC", "America/Los_Angeles", "Asia/Kolkata"])("civil dates with TZ=%s", (tz) => {
  it("weekdayOf reads the weekday from the date digits", () => {
    process.env.TZ = tz;
    for (const [date, weekday] of WEEKDAY_CASES) {
      expect(weekdayOf(date), date).toBe(weekday);
    }
  });

  it("addDays crosses month, year and leap day, and is negative-safe", () => {
    process.env.TZ = tz;
    for (const [date, n, expected] of ADD_DAYS_CASES) {
      expect(addDays(date, n), `${date} + ${n}`).toBe(expected);
    }
  });
});

describe("weekday vocabulary", () => {
  it("lists weekdays Monday first", () => {
    expect(WEEKDAYS).toEqual([
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]);
  });
});

describe("weekdayIndexOf", () => {
  it("numbers weekdays from Sunday = 0, as stored", () => {
    expect(weekdayIndexOf("2026-10-25")).toBe(0);
    expect(weekdayIndexOf("2026-10-26")).toBe(1);
    expect(weekdayIndexOf("2026-10-31")).toBe(6);
  });
});
