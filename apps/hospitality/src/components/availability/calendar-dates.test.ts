import { describe, it, expect } from "vitest";
import { shiftAnchor, visibleDates } from "./calendar-dates.js";

describe("visibleDates", () => {
  it("month view runs Monday to Sunday over the whole month", () => {
    const dates = visibleDates("month", "2026-10-15");
    expect(dates[0]).toBe("2026-09-28"); // Oct 1, 2026 is a Thursday
    expect(dates.at(-1)).toBe("2026-11-01");
    expect(dates).toHaveLength(35);
  });

  it("month view never exceeds the API's 62-day range", () => {
    expect(visibleDates("month", "2026-08-15").length).toBeLessThanOrEqual(62);
  });

  it("week view is the Monday-to-Sunday week holding the anchor", () => {
    expect(visibleDates("week", "2026-10-30")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("a Sunday anchor stays in the week that ends on it", () => {
    expect(visibleDates("week", "2026-11-01")[0]).toBe("2026-10-26");
  });
});

describe("shiftAnchor", () => {
  it("moves a week by seven days", () => {
    expect(shiftAnchor("week", "2026-10-30", 1)).toBe("2026-11-06");
    expect(shiftAnchor("week", "2026-10-30", -1)).toBe("2026-10-23");
  });

  it("moves a month keeping the day, clamped to the shorter month", () => {
    expect(shiftAnchor("month", "2026-10-31", 1)).toBe("2026-11-30");
    expect(shiftAnchor("month", "2026-01-15", -1)).toBe("2025-12-15");
  });
});
