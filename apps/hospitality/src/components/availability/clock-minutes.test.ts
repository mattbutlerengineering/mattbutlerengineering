import { describe, it, expect } from "vitest";
import { closeFromClock, lastSeatingFromClock, toClock } from "./clock-minutes.js";

describe("clock-minutes", () => {
  it("writes a service-day minute as a 24h clock, wrapping past midnight", () => {
    expect(toClock(690)).toBe("11:30");
    expect(toClock(1500)).toBe("01:00");
  });

  it("reads a close earlier than the open as the next day", () => {
    expect(closeFromClock("23:00", 1020)).toBe(1380);
    expect(closeFromClock("01:00", 1020)).toBe(1500);
    expect(closeFromClock("17:00", 1020)).toBe(2460);
  });

  it("reads a last seating earlier than the open as the next day, and one at the open as the open", () => {
    expect(lastSeatingFromClock("21:15", 1020)).toBe(1275);
    expect(lastSeatingFromClock("00:30", 1020)).toBe(1470);
    expect(lastSeatingFromClock("17:00", 1020)).toBe(1020);
  });
});
