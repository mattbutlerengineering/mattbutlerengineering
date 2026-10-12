import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  deviceDate,
  deviceHour,
  isDeviceToday,
  venueDate,
  venueWallClock,
} from "./service-day.js";

// Pin the device zone so the device-vs-UTC split is exercised identically on a Pacific laptop
// and on UTC CI.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe("deviceDate", () => {
  it.each([
    ["2026-09-04T06:30:00Z", "2026-09-03"],
    ["2026-09-05T06:30:00Z", "2026-09-04"], // 23:30 PDT, UTC already rolled
    ["2026-09-05T07:30:00Z", "2026-09-05"], // 00:30 PDT, local midnight passed
    ["2026-01-01T01:00:00Z", "2025-12-31"], // PST (UTC-8)
  ])("%s -> %s", (instant, expected) => {
    expect(deviceDate(new Date(instant))).toBe(expected);
  });

  it("returns an empty string for an invalid Date", () => {
    expect(deviceDate(new Date(Number.NaN))).toBe("");
  });
});

describe("deviceHour / isDeviceToday", () => {
  it("reads the device hour", () => {
    expect(deviceHour(new Date("2026-09-04T06:30:00Z"))).toBe(23);
    expect(deviceHour(new Date("2026-09-05T07:30:00Z"))).toBe(0);
  });

  it("matches only the device calendar day, false on invalid input", () => {
    const now = new Date("2026-09-04T06:30:00Z");
    expect(isDeviceToday("2026-09-03", now)).toBe(true);
    expect(isDeviceToday("2026-09-04", now)).toBe(false);
    expect(isDeviceToday("garbage", now)).toBe(false);
    expect(isDeviceToday("", new Date(Number.NaN))).toBe(false);
  });
});

describe("venueDate (zone, instant) table", () => {
  it.each([
    ["America/Los_Angeles", "2026-01-01T04:30:00Z", "2025-12-31"],
    ["America/Los_Angeles", "2026-07-01T06:59:00Z", "2026-06-30"],
    ["America/Los_Angeles", "2026-07-01T07:00:00Z", "2026-07-01"],
    ["Asia/Tokyo", "2026-04-05T15:00:00Z", "2026-04-06"],
    ["Pacific/Kiritimati", "2026-04-05T10:00:00Z", "2026-04-06"],
    ["UTC", "2026-04-05T23:59:00Z", "2026-04-05"],
  ])("%s @ %s -> %s", (zone, instant, expected) => {
    expect(venueDate(new Date(instant), zone)).toBe(expected);
  });

  it("falls back to the device day (never UTC) with no zone or an unresolvable one", () => {
    const now = new Date("2026-09-04T06:30:00Z");
    expect(venueDate(now)).toBe("2026-09-03");
    expect(venueDate(now, "Not/A_Zone")).toBe("2026-09-03");
  });
});

describe("addDays", () => {
  it("shifts across month and year boundaries", () => {
    expect(addDays("2026-12-25", 30)).toBe("2027-01-24");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
  it("returns an empty string for malformed input", () => {
    expect(addDays("nope", 1)).toBe("");
  });
});

describe("venueWallClock", () => {
  it("reads the venue weekday and minute-of-day", () => {
    expect(venueWallClock("America/Los_Angeles", new Date("2026-09-05T06:30:00Z"))).toEqual({
      weekday: "friday",
      nowMin: 23 * 60 + 30,
    });
  });
  it("is null for an unresolvable zone", () => {
    expect(venueWallClock("Not/A_Zone", new Date())).toBeNull();
  });
});
