/**
 * Unit tests for the pure time-grid helpers: parsing, formatting, slot
 * generation, and the disabled predicate (predicate wins over bounds).
 */
import { describe, it, expect } from "vitest";
import {
  buildTimeSlots,
  formatTimeDisplay,
  isTimeSlotDisabled,
  parseTime,
  toTimeString,
} from "./time-grid";

describe("parseTime", () => {
  it("parses a valid HH:mm string into minutes since midnight", () => {
    expect(parseTime("00:00")).toBe(0);
    expect(parseTime("09:30")).toBe(9 * 60 + 30);
    expect(parseTime("23:45")).toBe(23 * 60 + 45);
  });

  it("returns null for malformed or out-of-range input", () => {
    expect(parseTime("9:30")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("12:60")).toBeNull();
    expect(parseTime("noon")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
});

describe("toTimeString", () => {
  it("zero-pads minutes since midnight into HH:mm", () => {
    expect(toTimeString(0)).toBe("00:00");
    expect(toTimeString(9 * 60 + 5)).toBe("09:05");
    expect(toTimeString(23 * 60 + 45)).toBe("23:45");
  });
});

describe("buildTimeSlots", () => {
  it("builds a full day of slots at the given step", () => {
    expect(buildTimeSlots(15)).toHaveLength(96);
    expect(buildTimeSlots(60)).toHaveLength(24);
    expect(buildTimeSlots(30)).toHaveLength(48);
  });

  it("starts at 00:00 and never reaches 24:00", () => {
    const slots = buildTimeSlots(60);
    expect(slots[0]).toBe("00:00");
    expect(slots.at(-1)).toBe("23:00");
  });

  it("guards against a non-positive step", () => {
    expect(buildTimeSlots(0)).toHaveLength(24 * 60);
  });
});

describe("formatTimeDisplay", () => {
  it("formats an HH:mm string locale-aware via Intl", () => {
    const display = formatTimeDisplay("09:30", "en-US");
    expect(display).toContain("9:30");
    expect(display).toMatch(/AM/i);
  });

  it("returns an empty string for an invalid value", () => {
    expect(formatTimeDisplay("bogus", "en-US")).toBe("");
  });
});

describe("isTimeSlotDisabled", () => {
  it("honours min/max bounds when no predicate is supplied", () => {
    expect(isTimeSlotDisabled("08:00", { min: "09:00", max: "17:00" })).toBe(true);
    expect(isTimeSlotDisabled("18:00", { min: "09:00", max: "17:00" })).toBe(true);
    expect(isTimeSlotDisabled("12:00", { min: "09:00", max: "17:00" })).toBe(false);
  });

  it("lets the predicate win over bounds when both are supplied", () => {
    const isTimeDisabled = (t: string) => t === "12:00";
    // Predicate authoritative: out-of-bounds 08:00 is allowed, in-bounds 12:00 disabled.
    expect(isTimeSlotDisabled("08:00", { min: "09:00", max: "17:00", isTimeDisabled })).toBe(false);
    expect(isTimeSlotDisabled("12:00", { min: "09:00", max: "17:00", isTimeDisabled })).toBe(true);
  });
});
