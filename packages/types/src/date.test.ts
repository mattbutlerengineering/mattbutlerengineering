import { describe, it, expect } from "vitest";
import { toDateString } from "./date.js";

describe("toDateString", () => {
  it("formats a date as YYYY-MM-DD", () => {
    const date = new Date("2026-04-05T15:30:00.000Z");
    expect(toDateString(date)).toBe("2026-04-05");
  });

  it("pads single-digit months and days", () => {
    const date = new Date("2026-01-09T00:00:00.000Z");
    expect(toDateString(date)).toBe("2026-01-09");
  });

  it("handles end of year", () => {
    const date = new Date("2026-12-31T23:59:59.999Z");
    expect(toDateString(date)).toBe("2026-12-31");
  });

  it("handles start of year", () => {
    const date = new Date("2026-01-01T00:00:00.000Z");
    expect(toDateString(date)).toBe("2026-01-01");
  });

  it("returns ISO date portion regardless of time component", () => {
    const morning = new Date("2026-05-10T08:00:00.000Z");
    const evening = new Date("2026-05-10T23:59:59.999Z");
    expect(toDateString(morning)).toBe("2026-05-10");
    expect(toDateString(evening)).toBe("2026-05-10");
  });
});
