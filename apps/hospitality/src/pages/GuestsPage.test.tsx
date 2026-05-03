import { describe, it, expect } from "vitest";
import { SEGMENT_ACCENT_COLORS } from "./GuestsPage.js";

describe("SEGMENT_ACCENT_COLORS", () => {
  it("has exactly 6 entries to cover all segments without repetition", () => {
    expect(SEGMENT_ACCENT_COLORS).toHaveLength(6);
  });

  it("contains only unique colors", () => {
    const unique = new Set(SEGMENT_ACCENT_COLORS);
    expect(unique.size).toBe(SEGMENT_ACCENT_COLORS.length);
  });

  it("uses only rialto CSS custom properties", () => {
    for (const color of SEGMENT_ACCENT_COLORS) {
      expect(color).toMatch(/^var\(--rialto-/);
    }
  });
});
