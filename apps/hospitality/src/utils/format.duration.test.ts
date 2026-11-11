import { describe, it, expect } from "vitest";
import { formatDurationLabel } from "./format.js";

const MIN = 60_000;

describe("formatDurationLabel", () => {
  it("joins hours and minutes", () => {
    expect(formatDurationLabel(135 * MIN, "en-US")).toBe("2 hr 15 min");
  });

  it("drops a zero minutes part after whole hours", () => {
    expect(formatDurationLabel(120 * MIN, "en-US")).toBe("2 hr");
  });

  it("shows minutes alone under an hour and floors the seconds", () => {
    expect(formatDurationLabel(14 * MIN + 59_000, "en-US")).toBe("14 min");
  });

  it("ignores the sign (callers choose before/after wording)", () => {
    expect(formatDurationLabel(-30 * MIN, "en-US")).toBe("30 min");
  });

  it("localizes the units", () => {
    expect(formatDurationLabel(135 * MIN, "fr-CA")).toContain("h");
    expect(formatDurationLabel(135 * MIN, "es-MX")).toMatch(/h/);
  });
});
