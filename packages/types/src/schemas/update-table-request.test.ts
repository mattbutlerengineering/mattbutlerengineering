import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { UpdateTableBodySchema } from "./reservation-requests.js";
import type { UpdateTableRequest } from "../reservation.js";

// #7319: tableService.update persists every UpdateTableRequest field, but the
// body schema used to declare only four of them — the other six passed
// validation solely because toRequestJsonSchema strips additionalProperties,
// so any future schema tightening would have silently dropped them from the
// PATCH payload while the request still 200'd.

describe("UpdateTableBodySchema (#7319)", () => {
  const FULL_PAYLOAD: Required<{ [K in keyof UpdateTableRequest]: UpdateTableRequest[K] }> = {
    name: "Patio 1",
    tableNumber: "12",
    capacity: 6,
    minCovers: 2,
    maxCovers: 6,
    location: "Patio",
    isActive: true,
    priority: 3,
    floorPlanId: "fp-1",
    shapeMetadata: { x: 10, y: 20, width: 80, height: 60, shape: "rectangle" },
  };

  it("declares every field tableService.update persists — nothing is silently stripped", () => {
    const parsed = UpdateTableBodySchema.parse(FULL_PAYLOAD);
    expect(parsed).toEqual(FULL_PAYLOAD);
  });

  it("accepts the nullable clears the service supports (floorPlanId, shapeMetadata)", () => {
    const parsed = UpdateTableBodySchema.parse({ floorPlanId: null, shapeMetadata: null });
    expect(parsed.floorPlanId).toBeNull();
    expect(parsed.shapeMetadata).toBeNull();
  });

  it("still rejects invalid values on the newly declared fields", () => {
    expect(UpdateTableBodySchema.safeParse({ minCovers: 0 }).success).toBe(false);
    expect(UpdateTableBodySchema.safeParse({ maxCovers: 0 }).success).toBe(false);
    expect(UpdateTableBodySchema.safeParse({ priority: -1 }).success).toBe(false);
    expect(UpdateTableBodySchema.safeParse({ tableNumber: 12 }).success).toBe(false);
  });

  it("stays assignable to UpdateTableRequest, so schema/type drift is a compile error", () => {
    expectTypeOf<z.infer<typeof UpdateTableBodySchema>>().toExtend<UpdateTableRequest>();
    // And the reverse: every request field is representable in the schema.
    expectTypeOf<keyof UpdateTableRequest>().toExtend<
      keyof z.infer<typeof UpdateTableBodySchema>
    >();
  });
});
