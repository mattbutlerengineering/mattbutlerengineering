import { describe, it, expect } from "vitest";
import { venueWallTimeToInstant, wallTimeInputValue } from "./venue-wall-time.js";

const LA = "America/Los_Angeles";

describe("venueWallTimeToInstant", () => {
  it("reads 7:00 PM on 2026-05-10 in Los Angeles as 2026-05-11T02:00Z", () => {
    expect(venueWallTimeToInstant("2026-05-10", "19:00", LA).toISOString()).toBe(
      "2026-05-11T02:00:00.000Z"
    );
  });

  it("uses the offset in force on that date: spring-forward 2026-03-08", () => {
    // PST (-8) the day before, PDT (-7) from 03:00 on the 8th.
    expect(venueWallTimeToInstant("2026-03-07", "12:00", LA).toISOString()).toBe(
      "2026-03-07T20:00:00.000Z"
    );
    expect(venueWallTimeToInstant("2026-03-08", "12:00", LA).toISOString()).toBe(
      "2026-03-08T19:00:00.000Z"
    );
    expect(venueWallTimeToInstant("2026-03-08", "01:30", LA).toISOString()).toBe(
      "2026-03-08T09:30:00.000Z"
    );
  });

  it("uses the offset in force on that date: fall-back 2026-11-01", () => {
    expect(venueWallTimeToInstant("2026-10-31", "12:00", LA).toISOString()).toBe(
      "2026-10-31T19:00:00.000Z"
    );
    expect(venueWallTimeToInstant("2026-11-01", "12:00", LA).toISOString()).toBe(
      "2026-11-01T20:00:00.000Z"
    );
  });

  it("handles a zone ahead of UTC (Tokyo) and a half-hour zone (Kolkata)", () => {
    expect(venueWallTimeToInstant("2026-05-10", "03:00", "Asia/Tokyo").toISOString()).toBe(
      "2026-05-09T18:00:00.000Z"
    );
    expect(venueWallTimeToInstant("2026-05-10", "12:00", "Asia/Kolkata").toISOString()).toBe(
      "2026-05-10T06:30:00.000Z"
    );
  });

  it("falls back to the device clock when the zone is missing or invalid", () => {
    const device = new Date("2026-05-10T19:00:00").toISOString();
    expect(venueWallTimeToInstant("2026-05-10", "19:00", undefined).toISOString()).toBe(device);
    expect(venueWallTimeToInstant("2026-05-10", "19:00", "").toISOString()).toBe(device);
    expect(venueWallTimeToInstant("2026-05-10", "19:00", "Bad/Zone").toISOString()).toBe(device);
  });
});

describe("wallTimeInputValue", () => {
  it("shows an instant as the venue's HH:MM", () => {
    expect(wallTimeInputValue("2026-05-11T02:00:00Z", LA)).toBe("19:00");
    expect(wallTimeInputValue("2026-05-11T02:05:00Z", LA)).toBe("19:05");
    expect(wallTimeInputValue("2026-05-10T07:00:00Z", LA)).toBe("00:00");
  });

  it("round-trips through venueWallTimeToInstant", () => {
    const iso = venueWallTimeToInstant("2026-11-01", "12:15", LA).toISOString();
    expect(wallTimeInputValue(iso, LA)).toBe("12:15");
  });
});
