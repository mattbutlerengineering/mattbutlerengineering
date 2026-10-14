import { describe, it, expect } from "vitest";
import { classifyGuestSegment } from "./guest-segment.js";

describe("classifyGuestSegment", () => {
  it.each([
    [0, null, "New"],
    [1, [], "New"],
    [2, [], "Repeat"],
    [7, ["regular"], "Repeat"],
    [9, null, "Repeat"],
    [10, null, "VIP"],
    [2, ["vip"], "VIP"],
    [0, ["VIP"], "VIP"],
    [1, ["Vip", "x"], "VIP"],
  ] as const)("%i visits, tags %j -> %s", (visits, tags, expected) => {
    expect(classifyGuestSegment(visits, tags)).toBe(expected);
  });
});
