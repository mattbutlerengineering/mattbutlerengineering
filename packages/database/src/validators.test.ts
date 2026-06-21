import { describe, it, expect } from "vitest";
import {
  validateDateString,
  validatePartySize,
  validatePagination,
  validateDateRange,
  validateEnum,
} from "./validators.js";

describe("validateDateString", () => {
  it("returns valid with Date for YYYY-MM-DD string", () => {
    const result = validateDateString("2024-06-15");
    expect(result.valid).toBe(true);
    expect(result.value).toBeInstanceOf(Date);
    expect(result.error).toBeUndefined();
  });

  it("returns invalid for wrong format", () => {
    const result = validateDateString("15/06/2024");
    expect(result.valid).toBe(false);
    expect(result.value).toBeUndefined();
    expect(result.error).toMatch(/YYYY-MM-DD/);
  });

  it("returns invalid for empty string", () => {
    const result = validateDateString("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for undefined", () => {
    const result = validateDateString(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for date with wrong separators", () => {
    const result = validateDateString("2024.06.15");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for impossible calendar date (month 13)", () => {
    const result = validateDateString("2024-13-01");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for impossible calendar date (day 32)", () => {
    const result = validateDateString("2024-01-32");
    expect(result.valid).toBe(false);
  });

  it("rejects ISO datetime strings (not date-only)", () => {
    const result = validateDateString("2024-06-15T10:00:00Z");
    expect(result.valid).toBe(false);
  });

  it("returns valid Date with correct year/month/day", () => {
    const result = validateDateString("2024-03-20");
    expect(result.valid).toBe(true);
    const d = result.value as Date;
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(2); // 0-indexed
    expect(d.getUTCDate()).toBe(20);
  });
});

describe("validatePartySize", () => {
  it("returns valid with number for '4'", () => {
    const result = validatePartySize("4");
    expect(result.valid).toBe(true);
    expect(result.value).toBe(4);
  });

  it("returns invalid for '0'", () => {
    const result = validatePartySize("0");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for negative string", () => {
    const result = validatePartySize("-1");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for non-numeric string", () => {
    const result = validatePartySize("abc");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for undefined", () => {
    const result = validatePartySize(undefined);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for empty string", () => {
    const result = validatePartySize("");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for fractional number string", () => {
    const result = validatePartySize("2.5");
    expect(result.valid).toBe(false);
  });

  it("returns valid for boundary value '1'", () => {
    const result = validatePartySize("1");
    expect(result.valid).toBe(true);
    expect(result.value).toBe(1);
  });

  it("returns invalid for Infinity", () => {
    const result = validatePartySize("Infinity");
    expect(result.valid).toBe(false);
  });
});

describe("validatePagination", () => {
  it("returns defaults when no params provided", () => {
    const result = validatePagination();
    expect(result.valid).toBe(true);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("parses valid page and limit", () => {
    const result = validatePagination("2", "50");
    expect(result.valid).toBe(true);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(50);
  });

  it("floors page to 1 for page=0", () => {
    const result = validatePagination("0");
    expect(result.valid).toBe(true);
    expect(result.page).toBe(1);
  });

  it("floors page to 1 for negative page", () => {
    const result = validatePagination("-3");
    expect(result.valid).toBe(true);
    expect(result.page).toBe(1);
  });

  it("caps limit at 100", () => {
    const result = validatePagination("1", "999");
    expect(result.valid).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("floors limit to 1 for limit=0", () => {
    const result = validatePagination("1", "0");
    expect(result.valid).toBe(true);
    expect(result.limit).toBe(1);
  });

  it("returns valid with defaults for non-numeric strings", () => {
    const result = validatePagination("abc", "xyz");
    expect(result.valid).toBe(true);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts boundary limit=100", () => {
    const result = validatePagination("1", "100");
    expect(result.valid).toBe(true);
    expect(result.limit).toBe(100);
  });

  it("accepts boundary limit=1", () => {
    const result = validatePagination("1", "1");
    expect(result.valid).toBe(true);
    expect(result.limit).toBe(1);
  });
});

describe("validateDateRange", () => {
  it("returns valid for equal start and end", () => {
    const result = validateDateRange("2024-06-15", "2024-06-15");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("returns valid for start before end", () => {
    const result = validateDateRange("2024-06-01", "2024-06-30");
    expect(result.valid).toBe(true);
  });

  it("returns invalid when start is after end", () => {
    const result = validateDateRange("2024-06-30", "2024-06-01");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for invalid start date format", () => {
    const result = validateDateRange("bad-date", "2024-06-30");
    expect(result.valid).toBe(false);
  });

  it("returns invalid for invalid end date format", () => {
    const result = validateDateRange("2024-06-01", "not-a-date");
    expect(result.valid).toBe(false);
  });

  it("returns invalid when range exceeds maxDays", () => {
    const result = validateDateRange("2024-01-01", "2024-12-31", 30);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/30/);
  });

  it("returns valid when range is exactly maxDays", () => {
    const result = validateDateRange("2024-06-01", "2024-07-01", 30);
    expect(result.valid).toBe(true);
  });

  it("ignores maxDays when not provided", () => {
    const result = validateDateRange("2024-01-01", "2025-12-31");
    expect(result.valid).toBe(true);
  });
});

describe("validateEnum", () => {
  it("returns valid for a value in the allowed list", () => {
    const result = validateEnum("CONFIRMED", ["PENDING", "CONFIRMED", "CANCELLED"] as const);
    expect(result.valid).toBe(true);
    expect(result.value).toBe("CONFIRMED");
  });

  it("returns invalid for a value not in the allowed list", () => {
    const result = validateEnum("UNKNOWN", ["PENDING", "CONFIRMED"] as const);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it("returns invalid for empty string", () => {
    const result = validateEnum("", ["PENDING", "CONFIRMED"] as const);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for undefined", () => {
    const result = validateEnum(undefined, ["PENDING", "CONFIRMED"] as const);
    expect(result.valid).toBe(false);
  });

  it("is case-sensitive", () => {
    const result = validateEnum("confirmed", ["PENDING", "CONFIRMED"] as const);
    expect(result.valid).toBe(false);
  });

  it("returns valid for single-item allowed list", () => {
    const result = validateEnum("ACTIVE", ["ACTIVE"] as const);
    expect(result.valid).toBe(true);
    expect(result.value).toBe("ACTIVE");
  });

  it("includes allowed values in error message", () => {
    const result = validateEnum("BAD", ["FOO", "BAR"] as const);
    expect(result.error).toMatch(/FOO|BAR/);
  });
});
