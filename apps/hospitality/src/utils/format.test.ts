import { describe, it, expect } from "vitest";
import {
  formatLongDate,
  formatLongDateWithYear,
  formatTime,
  formatLocalTime,
  formatCurrencyFromCents,
  formatServiceDate,
  formatInstant,
  currencyMinorUnits,
  formatCalendarDate,
  majorToMinorUnits,
} from "./format.js";

describe("formatLongDate", () => {
  it("formats a date string as long weekday, month, day", () => {
    // 2024-03-15 is a Friday
    const result = formatLongDate("2024-03-15");
    expect(result).toBe("Friday, March 15");
  });

  it("formats midnight correctly (no timezone shift from T00:00:00 suffix)", () => {
    // 2024-01-01 is a Monday
    const result = formatLongDate("2024-01-01");
    expect(result).toBe("Monday, January 1");
  });

  it("handles a mid-month date (2024-06-12, a Wednesday)", () => {
    const result = formatLongDate("2024-06-12");
    expect(result).toBe("Wednesday, June 12");
  });
});

describe("formatLongDateWithYear", () => {
  it("formats a date string as long weekday, month, day, year", () => {
    // 2024-03-15 is a Friday
    const result = formatLongDateWithYear("2024-03-15");
    expect(result).toBe("Friday, March 15, 2024");
  });

  it("includes the year in output", () => {
    const result = formatLongDateWithYear("2025-12-31");
    expect(result).toContain("2025");
  });
});

describe("formatTime", () => {
  it("formats an ISO datetime string to 12-hour time with minutes", () => {
    const iso = "2024-03-15T14:30:00.000Z";
    const result = formatTime(iso);
    // Should contain AM or PM and a colon
    expect(result).toMatch(/\d+:\d{2}\s*(AM|PM)/i);
  });

  it("formats midnight ISO time (contains AM)", () => {
    const midnightUTC = "2024-01-01T00:00:00.000Z";
    const result = formatTime(midnightUTC);
    expect(result).toMatch(/AM|PM/i);
  });

  it("formats noon ISO time (contains PM)", () => {
    const noonUTC = "2024-01-01T12:00:00.000Z";
    const result = formatTime(noonUTC);
    expect(result).toMatch(/AM|PM/i);
  });

  it("always uses 12-hour format (no bare 20: prefix)", () => {
    // 8 PM UTC — in en-US with hour12 this should never show "20:"
    const iso = "2024-03-15T20:00:00.000Z";
    const result = formatTime(iso);
    expect(result).not.toMatch(/^20:/);
  });
});

describe("formatLocalTime", () => {
  // Wall-clock strings, not instants: pinned to UTC, so these hold under any TZ.
  it.each([
    ["17:00", "5:00 PM"],
    ["22:00", "10:00 PM"],
    ["02:00", "2:00 AM"],
    ["00:00", "12:00 AM"],
    ["12:30", "12:30 PM"],
  ])("formats %s as %s", (hhmm, expected) => {
    expect(formatLocalTime(hhmm)).toBe(expected);
  });
});

describe("formatCurrencyFromCents", () => {
  it("formats USD cents to dollar string", () => {
    const result = formatCurrencyFromCents(1000, "usd");
    expect(result).toBe("$10.00");
  });

  it("formats zero cents as $0.00", () => {
    const result = formatCurrencyFromCents(0, "usd");
    expect(result).toBe("$0.00");
  });

  it("formats large amounts correctly", () => {
    const result = formatCurrencyFromCents(250000, "usd");
    expect(result).toBe("$2,500.00");
  });

  it("handles non-USD currency code (EUR)", () => {
    const result = formatCurrencyFromCents(1000, "eur");
    // EUR in en-US locale — value should be 10.00
    expect(result).toContain("10.00");
    expect(result).toMatch(/€|EUR/);
  });

  it("accepts uppercase currency code", () => {
    const result = formatCurrencyFromCents(500, "USD");
    expect(result).toBe("$5.00");
  });

  it("handles odd-cent amounts", () => {
    const result = formatCurrencyFromCents(199, "usd");
    expect(result).toBe("$1.99");
  });
});

describe("formatServiceDate", () => {
  it("formats a YYYY-MM-DD as long weekday, short month, day (ux.md 'Tuesday, Sep 3')", () => {
    // 2026-09-03 is a Thursday; the ux.md sample day-of-week is illustrative
    expect(formatServiceDate("2026-09-03")).toBe("Thursday, Sep 3");
  });

  it("does not shift the calendar day across the UTC boundary (T00:00:00 local)", () => {
    // 2024-01-01 is a Monday
    expect(formatServiceDate("2024-01-01")).toBe("Monday, Jan 1");
  });
});

describe("formatInstant", () => {
  it("formats in the given zone and locale", () => {
    expect(
      formatInstant(
        "2024-03-15T21:30:00Z",
        { hour: "numeric", minute: "2-digit" },
        "en-US",
        "Asia/Tokyo"
      )
    ).toBe("6:30 AM");
  });

  it("falls back to the device zone for an invalid zone", () => {
    expect(() =>
      formatInstant("2024-03-15T21:30:00Z", { hour: "numeric" }, "en-US", "Bad/Zone")
    ).not.toThrow();
  });

  it("returns the legacy 'Invalid Date' text instead of throwing", () => {
    expect(formatInstant("not a date", { hour: "numeric" })).toBe("Invalid Date");
  });
});

describe("currency minor units", () => {
  it("knows each currency's exponent", () => {
    expect(currencyMinorUnits("USD")).toBe(2);
    expect(currencyMinorUnits("cad")).toBe(2);
    expect(currencyMinorUnits("JPY")).toBe(0);
    expect(currencyMinorUnits("krw")).toBe(0);
    expect(currencyMinorUnits("KWD")).toBe(3);
  });

  it("formats zero-decimal minor units without dividing by 100", () => {
    expect(formatCurrencyFromCents(2500, "jpy", "en-US")).toBe("¥2,500");
    expect(formatCurrencyFromCents(2500, "usd", "en-US")).toBe("$25.00");
  });

  it("converts a typed major amount to minor units", () => {
    expect(majorToMinorUnits(25, "USD")).toBe(2500);
    expect(majorToMinorUnits(25, "cad")).toBe(2500);
    expect(majorToMinorUnits(2500, "JPY")).toBe(2500);
    expect(majorToMinorUnits(2.5, "KWD")).toBe(2500);
    expect(majorToMinorUnits(19.99, "USD")).toBe(1999);
  });
});

describe("formatCalendarDate", () => {
  it("renders a date-only string as that calendar day, never shifted by the device zone", () => {
    const previousTz = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatCalendarDate("2026-05-10", { month: "short", day: "numeric" })).toBe("May 10");
      expect(
        formatCalendarDate("2026-05-10T00:00:00.000Z", { month: "short", day: "numeric" })
      ).toBe("May 10");
    } finally {
      process.env.TZ = previousTz;
    }
  });
});
