import { describe, it, expect } from "vitest";
import { hasOperatingHours } from "./hasOperatingHours.js";

describe("hasOperatingHours", () => {
  it("returns false when operatingHours is null", () => {
    expect(hasOperatingHours(null)).toBe(false);
  });

  it("returns false when operatingHours is undefined", () => {
    expect(hasOperatingHours(undefined)).toBe(false);
  });

  it("returns false when operatingHours is an empty object", () => {
    expect(hasOperatingHours({})).toBe(false);
  });

  it("returns true when at least one day has an open schedule", () => {
    expect(hasOperatingHours({ monday: { open: "09:00", close: "22:00" } })).toBe(true);
  });

  it("returns false when every configured day is marked closed", () => {
    expect(
      hasOperatingHours({
        monday: { open: "09:00", close: "22:00", closed: true },
        tuesday: { open: "09:00", close: "22:00", closed: true },
      })
    ).toBe(false);
  });

  it("returns true when a mix of closed and open days is configured", () => {
    expect(
      hasOperatingHours({
        monday: { open: "09:00", close: "22:00", closed: true },
        friday: { open: "17:00", close: "23:00" },
      })
    ).toBe(true);
  });
});
