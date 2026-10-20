import { describe, it, expect, vi, afterEach } from "vitest";
import {
  REHEARSAL_PATH,
  freshSeed,
  parseRehearsalState,
  rehearsalNavigation,
} from "./rehearsal-route";

afterEach(() => {
  vi.useRealTimers();
});

describe("parseRehearsalState", () => {
  it("accepts a profile and integer seed, with an optional floor plan", () => {
    expect(parseRehearsalState({ profile: "friday", seed: 7 })).toEqual({
      profile: "friday",
      seed: 7,
    });
    expect(parseRehearsalState({ profile: "weeknight", seed: 0, floorPlanId: "fp-1" })).toEqual({
      profile: "weeknight",
      seed: 0,
      floorPlanId: "fp-1",
    });
  });

  it.each([
    ["absent", null],
    ["undefined", undefined],
    ["a string", "friday"],
    ["unknown profile", { profile: "brunch", seed: 1 }],
    ["fractional seed", { profile: "friday", seed: 1.5 }],
    ["string seed", { profile: "friday", seed: "1" }],
    ["missing seed", { profile: "friday" }],
    ["non-string floor plan", { profile: "friday", seed: 1, floorPlanId: 3 }],
  ])("rejects %s", (_name, value) => {
    expect(parseRehearsalState(value)).toBeNull();
  });
});

describe("freshSeed and rehearsalNavigation", () => {
  it("produces a 32-bit unsigned integer from the clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    const seed = freshSeed();
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
    expect(seed).toBe(new Date("2026-10-19T12:00:00Z").getTime() >>> 0);
  });

  it("builds the path and navigation state for an entry point", () => {
    const [path, options] = rehearsalNavigation({ profile: "friday", floorPlanId: "fp-9" });
    expect(path).toBe(REHEARSAL_PATH);
    expect(parseRehearsalState(options.state)).toMatchObject({
      profile: "friday",
      floorPlanId: "fp-9",
    });
  });

  it("omits the floor plan when none is given and can replace history", () => {
    const [, options] = rehearsalNavigation({ profile: "weeknight", replace: true });
    expect(options.replace).toBe(true);
    expect(options.state).not.toHaveProperty("floorPlanId");
  });
});
