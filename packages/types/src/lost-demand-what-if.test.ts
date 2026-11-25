import { describe, expect, it } from "vitest";
import type { LostDemand } from "./endpoints/lost-demand.js";
import { busiestTurnedAwaySlot, countWeekday } from "./lost-demand-what-if.js";

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

describe("countWeekday", () => {
  it("counts the weekday's nights in the window", () => {
    expect(countWeekday("2026-11-01", "2026-11-28", 5)).toBe(4);
    expect(countWeekday("2026-11-01", "2026-11-28", 0)).toBe(4);
    expect(countWeekday("2026-11-01", "2026-11-02", 1)).toBe(1);
    expect(countWeekday("2026-11-01", "2026-11-02", 3)).toBe(0);
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
