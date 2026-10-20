import { describe, it, expect } from "vitest";
import type { FloorPlan, Table } from "@mbe/types";
import { pickFloorPlan } from "./pick-floor-plan";

const plan = (id: string, isActive: boolean): FloorPlan => ({
  id,
  venueId: "v",
  name: id,
  isActive,
  layoutJson: { width: 800, height: 600 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
});
const table = (id: string, floorPlanId: string | null, isActive = true): Table =>
  ({ id, floorPlanId, isActive }) as Table;

describe("pickFloorPlan", () => {
  const plans = [plan("a", true), plan("b", true), plan("c", false)];

  it("uses the requested plan when it exists", () => {
    expect(pickFloorPlan(plans, [], "c")?.id).toBe("c");
  });

  it("falls back to the active plan with the most active tables", () => {
    const tables = [table("1", "a"), table("2", "b"), table("3", "b"), table("4", "b", false)];
    expect(pickFloorPlan(plans, tables, undefined)?.id).toBe("b");
  });

  it("ignores an unknown requested id", () => {
    const tables = [table("1", "a")];
    expect(pickFloorPlan(plans, tables, "zzz")?.id).toBe("a");
  });

  it("keeps list order on a tie", () => {
    const tables = [table("1", "a"), table("2", "b")];
    expect(pickFloorPlan(plans, tables, undefined)?.id).toBe("a");
  });

  it("uses any plan when none is active, and null when there are none", () => {
    expect(pickFloorPlan([plan("c", false)], [], undefined)?.id).toBe("c");
    expect(pickFloorPlan([], [], undefined)).toBeNull();
  });
});
