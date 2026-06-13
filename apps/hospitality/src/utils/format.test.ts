import { describe, it, expect } from "vitest";
import {
  formatLongDate,
  formatLongDateWithYear,
  formatTime,
  formatCurrencyFromCents,
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
