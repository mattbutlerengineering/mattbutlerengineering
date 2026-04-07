import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TableShapeMetadataSchema,
  TableSchema,
  ReservationSchema,
  PaginationSchema,
  ErrorSchema,
  VenueGroupSchema,
  VenueSchema,
  GuestSchema,
  GuestSegmentSchema,
  FloorPlanLayoutSchema,
  FloorPlanSchema,
} from "./index.js";
import { compareSchema } from "@mbe/types/schema-compat";

const __dirname = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  readFileSync(join(__dirname, "schema-baseline.json"), "utf-8")
);

const allSchemas = {
  TableShapeMetadataSchema,
  TableSchema,
  ReservationSchema,
  PaginationSchema,
  ErrorSchema,
  VenueGroupSchema,
  VenueSchema,
  GuestSchema,
  GuestSegmentSchema,
  FloorPlanLayoutSchema,
  FloorPlanSchema,
};

describe("Reservation service schemas", () => {
  it("TableShapeMetadataSchema matches snapshot", () => {
    expect(TableShapeMetadataSchema).toMatchSnapshot();
  });

  it("TableSchema matches snapshot", () => {
    expect(TableSchema).toMatchSnapshot();
  });

  it("ReservationSchema matches snapshot", () => {
    expect(ReservationSchema).toMatchSnapshot();
  });

  it("PaginationSchema matches snapshot", () => {
    expect(PaginationSchema).toMatchSnapshot();
  });

  it("ErrorSchema matches snapshot", () => {
    expect(ErrorSchema).toMatchSnapshot();
  });

  it("VenueGroupSchema matches snapshot", () => {
    expect(VenueGroupSchema).toMatchSnapshot();
  });

  it("VenueSchema matches snapshot", () => {
    expect(VenueSchema).toMatchSnapshot();
  });

  it("GuestSchema matches snapshot", () => {
    expect(GuestSchema).toMatchSnapshot();
  });

  it("GuestSegmentSchema matches snapshot", () => {
    expect(GuestSegmentSchema).toMatchSnapshot();
  });

  it("FloorPlanLayoutSchema matches snapshot", () => {
    expect(FloorPlanLayoutSchema).toMatchSnapshot();
  });

  it("FloorPlanSchema matches snapshot", () => {
    expect(FloorPlanSchema).toMatchSnapshot();
  });
});

describe("Reservation service schema backward compatibility", () => {
  for (const [name, schema] of Object.entries(allSchemas)) {
    const schemaId = schema.$id;

    it(`${name} has no breaking changes`, () => {
      const base = baseline[schemaId];
      if (!base) return; // New schema, no baseline to compare

      const { breaking } = compareSchema(schemaId, base, schema);
      if (breaking.length > 0) {
        throw new Error(
          `Breaking schema changes detected:\n${breaking.map((b) => `  - ${b}`).join("\n")}` +
            "\n\nIf intentional, update baselines: pnpm schema:baseline"
        );
      }
    });
  }
});
