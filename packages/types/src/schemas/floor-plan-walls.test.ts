import { describe, expect, it } from "vitest";
import { FloorPlanLayoutSchema, FloorPlanSchema, WallLayoutSchema } from "./floor-plan.js";

const wall = { id: "w1", x1: 0, y1: 0, x2: 100, y2: 0, thickness: 8 };

describe("walls in the floor plan layout", () => {
  it("accepts a wall and a window", () => {
    expect(WallLayoutSchema.safeParse(wall).success).toBe(true);
    expect(WallLayoutSchema.safeParse({ ...wall, wallType: "window" }).success).toBe(true);
  });

  it("rejects an unknown wallType and a non-positive thickness", () => {
    expect(WallLayoutSchema.safeParse({ ...wall, wallType: "door" }).success).toBe(false);
    expect(WallLayoutSchema.safeParse({ ...wall, thickness: 0 }).success).toBe(false);
  });

  it("round-trips walls through the layout schema instead of stripping them", () => {
    const layout = { width: 800, height: 600, walls: [wall] };
    expect(FloorPlanLayoutSchema.parse(layout).walls).toEqual([wall]);
  });

  it("still parses a layout saved before walls existed", () => {
    const parsed = FloorPlanLayoutSchema.parse({ width: 800, height: 600 });
    expect(parsed.walls).toBeUndefined();
    expect(
      FloorPlanSchema.safeParse({
        id: "f",
        venueId: "v",
        name: "n",
        isActive: true,
        layoutJson: { width: 800, height: 600 },
        createdAt: "",
        updatedAt: "",
      }).success
    ).toBe(true);
  });
});
