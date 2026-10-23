import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";
import { CreateTableBodySchema } from "./reservation-requests.js";
import type { CreateTableRequest } from "../reservation.js";

// #7321 (sibling of #7319/#7320, create path): tableService.create consumes
// every CreateTableRequest field, and useAddTable sends floorPlanId +
// shapeMetadata TODAY — they passed validation only because
// toRequestJsonSchema strips additionalProperties, so tightening request
// validation would have broken table creation from the floor-plan editor.

describe("CreateTableBodySchema (#7321)", () => {
  const FULL_PAYLOAD: Required<{ [K in keyof CreateTableRequest]: CreateTableRequest[K] }> = {
    name: "Patio 1",
    tableNumber: "12",
    capacity: 6,
    minCovers: 2,
    maxCovers: 6,
    location: "Patio",
    priority: 3,
    venueId: "venue-1",
    floorPlanId: "fp-1",
    shapeMetadata: { x: 10, y: 20, width: 80, height: 60, shape: "circle" },
  };

  it("declares every field tableService.create consumes — nothing is silently stripped", () => {
    const parsed = CreateTableBodySchema.parse(FULL_PAYLOAD);
    expect(parsed).toEqual(FULL_PAYLOAD);
  });

  it("keeps the minimal payload working (service supplies the defaults)", () => {
    const parsed = CreateTableBodySchema.parse({ name: "T1", capacity: 2 });
    expect(parsed).toEqual({ name: "T1", capacity: 2 });
  });

  it("still rejects invalid values on the newly declared fields", () => {
    const base = { name: "T1", capacity: 2 };
    expect(CreateTableBodySchema.safeParse({ ...base, minCovers: 0 }).success).toBe(false);
    expect(CreateTableBodySchema.safeParse({ ...base, maxCovers: 0 }).success).toBe(false);
    expect(CreateTableBodySchema.safeParse({ ...base, priority: -1 }).success).toBe(false);
    expect(CreateTableBodySchema.safeParse({ ...base, tableNumber: 12 }).success).toBe(false);
    expect(
      CreateTableBodySchema.safeParse({ ...base, shapeMetadata: { shape: "hexagon" } }).success
    ).toBe(false);
  });

  it("stays assignable to CreateTableRequest, so schema/type drift is a compile error", () => {
    expectTypeOf<z.infer<typeof CreateTableBodySchema>>().toExtend<CreateTableRequest>();
    expectTypeOf<keyof CreateTableRequest>().toExtend<
      keyof z.infer<typeof CreateTableBodySchema>
    >();
  });
});
