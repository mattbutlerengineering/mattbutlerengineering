import { describe, it, expect } from "vitest";
import { formatHourLabel } from "./format.js";

describe("formatHourLabel", () => {
  it.each([
    ["en-US", 19, false, "7 PM"],
    ["en-US", 0, false, "12 AM"],
    ["fr-CA", 19, false, "19 h"],
    ["es-MX", 19, false, "7 p.m."],
    ["en-US", 19, true, "7"],
    ["fr-CA", 19, true, "19"],
  ] as const)("%s hour %i (compact=%s) → %s", (locale, hour, compact, expected) => {
    expect(formatHourLabel(hour, locale, compact).replace(/\s/g, " ")).toBe(expected);
  });
});
