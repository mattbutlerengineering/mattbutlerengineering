import { describe, it, expect } from "vitest";
import { calendarSequence, toVenueLocalTime } from "./venue-time.js";

describe("toVenueLocalTime — bare HH:MM", () => {
  it("passes the wall time through with the fallback date and no UTC instant", () => {
    const t = toVenueLocalTime("19:30", "America/New_York", "2026-05-10");
    expect(t).toEqual({
      date: "2026-05-10",
      time: "19:30",
      display: "7:30 PM",
      icalLocal: "20260510T193000",
      icalUtc: null,
    });
  });

  it("ignores the timezone for a bare time", () => {
    const a = toVenueLocalTime("08:15", "America/New_York", "2026-05-10");
    const b = toVenueLocalTime("08:15", "Asia/Tokyo", "2026-05-10");
    expect(a).toEqual(b);
  });
});

describe("toVenueLocalTime — invalid input", () => {
  it("throws on an unparseable instant", () => {
    expect(() => toVenueLocalTime("not-a-time", "America/New_York", "2026-05-10")).toThrow(
      "Invalid booking time: not-a-time"
    );
  });
});

describe("toVenueLocalTime — 12-hour boundary", () => {
  it("reads hour 0 as 12:00 AM", () => {
    // 2026-05-10T04:00Z is midnight in New York (EDT, UTC-4).
    const t = toVenueLocalTime("2026-05-10T04:00:00.000Z", "America/New_York", "2026-05-10");
    expect(t).toMatchObject({ date: "2026-05-10", time: "00:00", display: "12:00 AM" });
  });

  it("reads hour 12 as 12:00 PM", () => {
    const t = toVenueLocalTime("2026-05-10T16:00:00.000Z", "America/New_York", "2026-05-10");
    expect(t).toMatchObject({ time: "12:00", display: "12:00 PM" });
  });

  it("reads 12:30 AM and 11:59 PM correctly", () => {
    expect(toVenueLocalTime("00:30", "UTC", "2026-05-10").display).toBe("12:30 AM");
    expect(toVenueLocalTime("23:59", "UTC", "2026-05-10").display).toBe("11:59 PM");
  });
});

describe("calendarSequence", () => {
  it("returns epoch seconds", () => {
    expect(calendarSequence("1970-01-01T00:01:00.000Z")).toBe(60);
  });

  it("throws on an unparseable updatedAt", () => {
    expect(() => calendarSequence("garbage")).toThrow("Invalid updatedAt: garbage");
  });
});
