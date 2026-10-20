import { describe, it, expect } from "vitest";
import { shouldAnnounce, ANNOUNCE_INTERVAL_MS } from "./should-announce";

describe("shouldAnnounce", () => {
  it("never announces at 240x", () => {
    expect(shouldAnnounce(null, 1_000_000, 240, false)).toBe(false);
    expect(shouldAnnounce(0, 1_000_000, 240, false)).toBe(false);
  });

  it("announces at 15x and 60x when nothing was announced yet", () => {
    expect(shouldAnnounce(null, 5, 15, false)).toBe(true);
    expect(shouldAnnounce(null, 5, 60, false)).toBe(true);
  });

  it("announces at most once per 10 real seconds at 15x and 60x", () => {
    expect(ANNOUNCE_INTERVAL_MS).toBe(10_000);
    expect(shouldAnnounce(1_000, 10_999, 60, false)).toBe(false);
    expect(shouldAnnounce(1_000, 11_000, 60, false)).toBe(true);
    expect(shouldAnnounce(1_000, 5_000, 15, false)).toBe(false);
  });

  it("announces once per step when motion is reduced, whatever the timing or speed", () => {
    expect(shouldAnnounce(1_000, 1_001, 60, true)).toBe(true);
    expect(shouldAnnounce(1_000, 1_001, 240, true)).toBe(true);
    expect(shouldAnnounce(null, 0, 15, true)).toBe(true);
  });
});
