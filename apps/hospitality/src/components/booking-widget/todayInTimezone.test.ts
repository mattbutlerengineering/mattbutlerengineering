import { describe, it, expect } from "vitest";
import { todayInTimezone } from "./todayInTimezone.js";

describe("todayInTimezone", () => {
  it("formats the date as YYYY-MM-DD in the given IANA timezone", () => {
    // 2026-01-01T04:30:00Z is still 2025-12-31 in America/Los_Angeles (UTC-8).
    const now = new Date("2026-01-01T04:30:00Z");
    expect(todayInTimezone(now, "America/Los_Angeles")).toBe("2025-12-31");
  });

  it("falls back to the UTC date when no timezone is given", () => {
    const now = new Date("2026-04-05T12:00:00Z");
    expect(todayInTimezone(now)).toBe("2026-04-05");
  });

  it("falls back to the UTC date when the timezone is not a resolvable IANA name", () => {
    const now = new Date("2026-04-05T12:00:00Z");
    expect(todayInTimezone(now, "Not/A_Zone")).toBe("2026-04-05");
  });
});
