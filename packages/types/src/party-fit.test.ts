import { describe, expect, it } from "vitest";
import { partyFitsTable, tableMaxCovers } from "./party-fit.js";

describe("partyFitsTable", () => {
  it.each([
    // [capacity, minCovers, maxCovers, party, fits]
    [2, 1, null, 12, false], // onboarding 2-top (null maxCovers) never seats 12
    [2, 1, null, 2, true],
    [2, 1, null, 1, true],
    [4, 2, null, 1, false], // below minCovers
    [4, 1, 6, 6, true], // explicit maxCovers wins over capacity
    [4, 1, 6, 7, false],
    [8, 1, 4, 5, false], // maxCovers below capacity is the ceiling
  ])("capacity %i min %i max %s party %i -> %s", (capacity, minCovers, maxCovers, party, fits) => {
    expect(partyFitsTable({ capacity, minCovers, maxCovers }, party)).toBe(fits);
  });
});

describe("tableMaxCovers", () => {
  it("falls back to capacity when maxCovers is null", () => {
    expect(tableMaxCovers({ capacity: 2, maxCovers: null })).toBe(2);
    expect(tableMaxCovers({ capacity: 2, maxCovers: 5 })).toBe(5);
  });
});
