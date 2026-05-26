import { describe, it, expect } from "vitest";
import { ordinalVisit } from "./ordinal.js";

describe("ordinalVisit", () => {
  it("returns '2nd visit' for 2", () => {
    expect(ordinalVisit(2)).toBe("2nd visit");
  });

  it("returns '3rd visit' for 3", () => {
    expect(ordinalVisit(3)).toBe("3rd visit");
  });

  it("returns '4th visit' for 4", () => {
    expect(ordinalVisit(4)).toBe("4th visit");
  });

  it("returns '11th visit' for 11 (teen exception)", () => {
    expect(ordinalVisit(11)).toBe("11th visit");
  });

  it("returns '12th visit' for 12 (teen exception)", () => {
    expect(ordinalVisit(12)).toBe("12th visit");
  });

  it("returns '13th visit' for 13 (teen exception)", () => {
    expect(ordinalVisit(13)).toBe("13th visit");
  });

  it("returns '21st visit' for 21", () => {
    expect(ordinalVisit(21)).toBe("21st visit");
  });

  it("returns '22nd visit' for 22", () => {
    expect(ordinalVisit(22)).toBe("22nd visit");
  });

  it("returns '5th visit' for 5", () => {
    expect(ordinalVisit(5)).toBe("5th visit");
  });
});
