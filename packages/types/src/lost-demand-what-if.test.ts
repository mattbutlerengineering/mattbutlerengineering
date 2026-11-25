import { describe, expect, it } from "vitest";
import type { LostDemand } from "./endpoints/lost-demand.js";
import { busiestTurnedAwaySlot, estimateAddedSeating } from "./lost-demand-what-if.js";

// 2026-11-01 is a Sunday: the window below holds four Fridays (6, 13, 20, 27).
const demand: LostDemand = {
  venueId: "v1",
  from: "2026-11-01",
  to: "2026-11-28",
  total: 17,
  cells: [
    { weekday: 5, hour: 21, searches: 8 },
    { weekday: 5, hour: 20, searches: 3 },
    { weekday: 6, hour: 21, searches: 4 },
  ],
  anyTime: [{ weekday: 5, searches: 2 }],
};

describe("estimateAddedSeating", () => {
  it("counts the searches for the seating's weekday and hour", () => {
    expect(estimateAddedSeating(demand, { weekday: 5, minute: 21 * 60 + 30 })).toEqual({
      searches: 8,
      nights: 4,
      perNight: 2,
    });
  });

  it("never counts another weekday, another hour or searches that named no time", () => {
    expect(estimateAddedSeating(demand, { weekday: 1, minute: 21 * 60 }).searches).toBe(0);
    expect(estimateAddedSeating(demand, { weekday: 5, minute: 19 * 60 }).searches).toBe(0);
  });

  it("counts the weekday's nights in the window", () => {
    expect(estimateAddedSeating(demand, { weekday: 0, minute: 0 }).nights).toBe(4);
    expect(
      estimateAddedSeating({ ...demand, to: "2026-11-02" }, { weekday: 1, minute: 0 }).nights
    ).toBe(1);
  });
});

describe("busiestTurnedAwaySlot", () => {
  it("returns the weekday and hour with the most searches", () => {
    expect(busiestTurnedAwaySlot(demand)).toEqual({ weekday: 5, minute: 21 * 60 });
  });

  it("returns null when nobody named a time", () => {
    expect(busiestTurnedAwaySlot({ ...demand, cells: [] })).toBeNull();
  });
});
