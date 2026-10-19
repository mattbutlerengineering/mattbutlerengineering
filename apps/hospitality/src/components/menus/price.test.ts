import { describe, it, expect } from "vitest";
import { parsePriceToCents, formatCentsForInput } from "./price.js";

describe("parsePriceToCents", () => {
  it.each([
    ["12.50", 1250],
    ["12.5", 1250],
    ["12", 1200],
    ["0", 0],
    ["0.07", 7],
    [" 8.00 ", 800],
  ])("parses %s to %i cents", (text, cents) => {
    expect(parsePriceToCents(text)).toBe(cents);
  });

  it.each(["-1", "-0.50", "12.345", "1.", ".5", "", "abc", "1,50", "1e3"])("rejects %j", (text) => {
    expect(parsePriceToCents(text)).toBeNull();
  });
});

describe("formatCentsForInput", () => {
  it("renders integer cents as a two-decimal string", () => {
    expect(formatCentsForInput(1250)).toBe("12.50");
    expect(formatCentsForInput(7)).toBe("0.07");
    expect(formatCentsForInput(0)).toBe("0.00");
  });

  it("round-trips with parsePriceToCents", () => {
    for (const cents of [0, 1, 99, 100, 1250, 99999]) {
      expect(parsePriceToCents(formatCentsForInput(cents))).toBe(cents);
    }
  });
});
