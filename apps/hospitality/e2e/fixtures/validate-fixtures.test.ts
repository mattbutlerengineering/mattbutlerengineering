import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  UserSchema,
  VenueSchema,
  TableSchema,
  ReservationSchema,
  GuestSchema,
  GuestSegmentSchema,
  FloorPlanSchema,
  PaginationSchema,
} from "@mbe/types/schemas";
import { z } from "zod";

const FIXTURES_DIR = join(import.meta.dirname, ".");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.json`), "utf-8"));
}

const PaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    pagination: PaginationSchema,
  });

const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
  });

describe("E2E fixture validation against Zod schemas", () => {
  it("user-me matches UserSchema", () => {
    const fixture = loadFixture("user-me") as { data: unknown };
    expect(() => UserSchema.parse(fixture.data)).not.toThrow();
  });

  it("venues-list matches PaginatedResponse<Venue>", () => {
    const fixture = loadFixture("venues-list");
    expect(() => PaginatedSchema(VenueSchema).parse(fixture)).not.toThrow();
  });

  it("tables-list matches PaginatedResponse<Table>", () => {
    const fixture = loadFixture("tables-list");
    expect(() => PaginatedSchema(TableSchema).parse(fixture)).not.toThrow();
  });

  it("reservations-list matches PaginatedResponse<Reservation>", () => {
    const fixture = loadFixture("reservations-list");
    expect(() => PaginatedSchema(ReservationSchema).parse(fixture)).not.toThrow();
  });

  it("guests-list matches PaginatedResponse<Guest>", () => {
    const fixture = loadFixture("guests-list");
    expect(() => PaginatedSchema(GuestSchema).parse(fixture)).not.toThrow();
  });

  it("guest-segments matches ApiResponse<GuestSegment[]>", () => {
    const fixture = loadFixture("guest-segments");
    expect(() => ApiResponseSchema(z.array(GuestSegmentSchema)).parse(fixture)).not.toThrow();
  });

  it("floor-plans-list matches PaginatedResponse<FloorPlan>", () => {
    const fixture = loadFixture("floor-plans-list");
    expect(() => PaginatedSchema(FloorPlanSchema).parse(fixture)).not.toThrow();
  });

  it("availability-slots has valid shape", () => {
    const TimeSlotSchema = z.object({
      time: z.string(),
      available: z.boolean(),
      tables: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            capacity: z.number(),
            minCovers: z.number(),
            maxCovers: z.number().nullable(),
          })
        )
        .optional(),
    });
    const fixture = loadFixture("availability-slots");
    expect(() => ApiResponseSchema(z.array(TimeSlotSchema)).parse(fixture)).not.toThrow();
  });
});
