import { describe, it, expect } from "vitest";
import {
  columnDates,
  dateRange,
  datesUsingSchedule,
  toggleDate,
  weekdayDatesInMonth,
} from "./selection.js";
import { visibleDates } from "./calendar-dates.js";

describe("dateRange", () => {
  it("is inclusive and ordered whichever way it is dragged", () => {
    expect(dateRange("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(dateRange("2026-11-02", "2026-10-30")).toEqual(dateRange("2026-10-30", "2026-11-02"));
  });

  it("is one date when both ends match", () => {
    expect(dateRange("2026-10-30", "2026-10-30")).toEqual(["2026-10-30"]);
  });
});

describe("toggleDate", () => {
  it("adds a missing date and keeps the list sorted", () => {
    expect(toggleDate(["2026-10-30"], "2026-10-28")).toEqual(["2026-10-28", "2026-10-30"]);
  });

  it("removes a present date without mutating the input", () => {
    const before = ["2026-10-28", "2026-10-30"] as const;
    expect(toggleDate(before, "2026-10-28")).toEqual(["2026-10-30"]);
    expect(before).toEqual(["2026-10-28", "2026-10-30"]);
  });
});

describe("columnDates", () => {
  it("takes one Monday-first column of the anchor month, not its padding days", () => {
    const grid = visibleDates("month", "2026-10-15");
    expect(columnDates(grid, 4, "month", "2026-10-15")).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-16",
      "2026-10-23",
      "2026-10-30",
    ]);
  });

  it("takes the single visible date of a week column", () => {
    const grid = visibleDates("week", "2026-10-30");
    expect(columnDates(grid, 4, "week", "2026-10-30")).toEqual(["2026-10-30"]);
  });
});

describe("weekdayDatesInMonth", () => {
  it("lists every date in the month on the anchor's weekday", () => {
    expect(weekdayDatesInMonth("2026-12-04")).toEqual([
      "2026-12-04",
      "2026-12-11",
      "2026-12-18",
      "2026-12-25",
    ]);
  });
});

describe("datesUsingSchedule", () => {
  it("picks the loaded dates governed by one schedule", () => {
    const days = [
      { serviceDate: "2026-10-30", scheduleId: "a" },
      { serviceDate: "2026-10-31", scheduleId: "b" },
      { serviceDate: "2026-11-01", scheduleId: null },
      { serviceDate: "2026-10-29", scheduleId: "a" },
    ];
    expect(datesUsingSchedule(days, "a")).toEqual(["2026-10-29", "2026-10-30"]);
  });
});
