import { describe, expect, it } from "vitest";
import { AssignTableBodySchema } from "./reservation-requests.js";

// AssignTableBodySchema's shapeMetadata validated only "is this a JSON
// object" (JsonObjectSchema), unlike CreateTableBodySchema/UpdateTableBodySchema
// which validate against the real TableShapeMetadata shape (#7319, #7321) — so
// the assign-table endpoint could persist shapeMetadata the floor-plan canvas
// can't render.
describe("AssignTableBodySchema", () => {
  it("accepts a full, valid shapeMetadata", () => {
    const body = {
      floorPlanId: "fp-1",
      shapeMetadata: { x: 10, y: 20, width: 80, height: 60, shape: "rectangle" },
    };
    expect(AssignTableBodySchema.safeParse(body).success).toBe(true);
  });

  it("still allows omitting shapeMetadata entirely", () => {
    expect(AssignTableBodySchema.safeParse({ floorPlanId: "fp-1" }).success).toBe(true);
  });

  it("rejects shapeMetadata missing required fields", () => {
    const body = { floorPlanId: "fp-1", shapeMetadata: { x: 10 } };
    expect(AssignTableBodySchema.safeParse(body).success).toBe(false);
  });

  it("rejects an invalid shape enum value", () => {
    const body = {
      floorPlanId: "fp-1",
      shapeMetadata: { x: 0, y: 0, width: 50, height: 50, shape: "triangle" },
    };
    expect(AssignTableBodySchema.safeParse(body).success).toBe(false);
  });
});
