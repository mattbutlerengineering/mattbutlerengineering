import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonthsToIso,
  addMonthsToMonth,
  buildWeeks,
  daysInMonth,
  monthLabel,
  monthOfIso,
  parseIsoDate,
  resolveWeekStart,
  startOfWeek,
  toIsoDate,
  weekdayLabels,
} from "./date-grid";

describe("parseIsoDate", () => {
  it("parses a valid date", () => {
    expect(parseIsoDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
  });

  it("rejects an impossible calendar date", () => {
    expect(parseIsoDate("2024-02-31")).toBeNull();
    expect(parseIsoDate("2023-02-29")).toBeNull();
    expect(parseIsoDate("2024-13-01")).toBeNull();
  });

  it("rejects malformed strings", () => {
    expect(parseIsoDate("2024-2-3")).toBeNull();
    expect(parseIsoDate("not-a-date")).toBeNull();
  });
});

describe("toIsoDate", () => {
  it("zero-pads and normalises overflow", () => {
    expect(toIsoDate(2024, 0, 5)).toBe("2024-01-05");
    expect(toIsoDate(2024, 12, 1)).toBe("2025-01-01");
    expect(toIsoDate(2024, 0, 0)).toBe("2023-12-31");
  });
});

describe("daysInMonth", () => {
  it("returns 29 for February in a leap year and 28 otherwise", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2023, 1)).toBe(28);
    expect(daysInMonth(1900, 1)).toBe(28);
    expect(daysInMonth(2000, 1)).toBe(29);
  });

  it("returns 31 and 30 for long and short months", () => {
    expect(daysInMonth(2024, 0)).toBe(31);
    expect(daysInMonth(2024, 3)).toBe(30);
  });
});

describe("addDays", () => {
  it("crosses Feb 28 -> Feb 29 in a leap year", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-02-29", 1)).toBe("2024-03-01");
  });

  it("crosses Feb 28 -> Mar 1 in a non-leap year", () => {
    expect(addDays("2023-02-28", 1)).toBe("2023-03-01");
  });

  it("wraps across year boundaries in both directions", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2025-01-01", -1)).toBe("2024-12-31");
  });
});

describe("addMonthsToMonth", () => {
  it("wraps December into January of the next year", () => {
    expect(addMonthsToMonth({ year: 2024, month: 11 }, 1)).toEqual({ year: 2025, month: 0 });
  });

  it("wraps January back into December of the previous year", () => {
    expect(addMonthsToMonth({ year: 2024, month: 0 }, -1)).toEqual({ year: 2023, month: 11 });
  });

  it("handles multi-year deltas", () => {
    expect(addMonthsToMonth({ year: 2024, month: 5 }, 30)).toEqual({ year: 2026, month: 11 });
    expect(addMonthsToMonth({ year: 2024, month: 5 }, -30)).toEqual({ year: 2021, month: 11 });
  });
});

describe("addMonthsToIso", () => {
  it("wraps December into January of the next year", () => {
    expect(addMonthsToIso("2024-12-15", 1)).toBe("2025-01-15");
  });

  it("clamps the day to the target month's length", () => {
    expect(addMonthsToIso("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsToIso("2023-01-31", 1)).toBe("2023-02-28");
  });
});

describe("monthOfIso", () => {
  it("returns a zero-based month", () => {
    expect(monthOfIso("2024-03-10")).toEqual({ year: 2024, month: 2 });
  });
});

describe("startOfWeek", () => {
  it("returns the Sunday on or before a date when weeks start on Sunday", () => {
    expect(startOfWeek("2024-03-13", 0)).toBe("2024-03-10"); // Wednesday
    expect(startOfWeek("2024-03-10", 0)).toBe("2024-03-10"); // already Sunday
  });

  it("returns the Monday on or before a date when weeks start on Monday", () => {
    expect(startOfWeek("2024-03-10", 1)).toBe("2024-03-04"); // Sunday
  });
});

describe("buildWeeks", () => {
  it("builds a 6x7 grid that starts on the requested weekday and contains the month", () => {
    const weeks = buildWeeks({ year: 2024, month: 1 }, 1);
    expect(weeks).toHaveLength(6);
    for (const row of weeks) expect(row).toHaveLength(7);
    expect(weeks[0]?.[0]).toBe("2024-01-29"); // Monday on/before Feb 1 2024 (Thu)
    expect(weeks.flat()).toContain("2024-02-29");
    expect(weeks[5]?.[6]).toBe("2024-03-10");
  });
});

describe("resolveWeekStart", () => {
  it("honours an explicit weekStartsOn over the locale", () => {
    expect(resolveWeekStart("en-US", 3)).toBe(3);
    expect(resolveWeekStart("de-DE", 0)).toBe(0);
  });

  it("derives different week starts from different locales", () => {
    expect(resolveWeekStart("en-US", undefined)).toBe(0);
    expect(resolveWeekStart("de-DE", undefined)).toBe(1);
  });

  it("falls back to Monday for an invalid locale", () => {
    expect(resolveWeekStart("not_a_locale!!", undefined)).toBe(1);
  });
});

describe("weekdayLabels", () => {
  it("rotates labels to start on the requested weekday", () => {
    const labels = weekdayLabels("en-US", 1);
    expect(labels).toHaveLength(7);
    expect(labels[0]).toEqual({ short: "Mon", long: "Monday" });
    expect(labels[6]).toEqual({ short: "Sun", long: "Sunday" });
  });

  it("starts with Sunday when weekStartsOn is 0", () => {
    expect(weekdayLabels("en-US", 0)[0]?.long).toBe("Sunday");
  });
});

describe("monthLabel", () => {
  it("formats a locale-aware month and year", () => {
    expect(monthLabel({ year: 2024, month: 1 }, "en-US")).toBe("February 2024");
  });
});
