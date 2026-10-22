import { describe, expect, it } from "vitest";
import {
  FloorPlanLayoutSchema,
  FloorPlanSchema,
  SectionLayoutSchema,
  TableSchema,
} from "./floor-plan.js";
import {
  AssignSectionTablesRequestSchema,
  CreateFloorPlanSectionRequestSchema,
  FloorPlanSectionSchema,
  UpdateFloorPlanSectionRequestSchema,
} from "./floor-plan-section.js";

const zone = { id: "s1", x: 10, y: 20, width: 200, height: 150 };
const ts = "2026-10-22T00:00:00.000Z";

describe("sections in the floor plan layout", () => {
  it("accepts a zone rectangle", () => {
    expect(SectionLayoutSchema.safeParse(zone).success).toBe(true);
  });

  it("rejects a zone with a non-positive size", () => {
    expect(SectionLayoutSchema.safeParse({ ...zone, width: 0 }).success).toBe(false);
    expect(SectionLayoutSchema.safeParse({ ...zone, height: -1 }).success).toBe(false);
  });

  it("round-trips sections through the layout schema instead of stripping them", () => {
    const layout = { width: 800, height: 600, sections: [zone] };
    expect(FloorPlanLayoutSchema.parse(layout).sections).toEqual([zone]);
  });

  it("still parses a layout saved before sections existed", () => {
    const parsed = FloorPlanLayoutSchema.parse({ width: 800, height: 600 });
    expect(parsed.sections).toBeUndefined();
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

  it("lets a table carry a section assignment but not require one", () => {
    const table = {
      id: "t1",
      name: "T1",
      tableNumber: null,
      capacity: 2,
      minCovers: 1,
      maxCovers: null,
      location: null,
      isActive: true,
      priority: 0,
      status: "AVAILABLE",
      venueId: "v",
      floorPlanId: "f",
      shapeMetadata: null,
      createdAt: ts,
      updatedAt: ts,
    };
    expect(TableSchema.safeParse(table).success).toBe(true);
    expect(TableSchema.parse({ ...table, sectionId: "s1" }).sectionId).toBe("s1");
    expect(TableSchema.parse({ ...table, sectionId: null }).sectionId).toBeNull();
  });
});

describe("floor-plan section schemas", () => {
  it("accepts a valid section row", () => {
    const section = {
      id: "s1",
      venueId: "v1",
      floorPlanId: "f1",
      name: "Patio",
      color: "#3366cc",
      displayOrder: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    expect(FloorPlanSectionSchema.parse(section)).toEqual(section);
  });

  it("requires a name and floor plan on create, and a hex colour when given", () => {
    expect(CreateFloorPlanSectionRequestSchema.safeParse({ name: "Patio" }).success).toBe(false);
    expect(
      CreateFloorPlanSectionRequestSchema.safeParse({ floorPlanId: "f1", name: "" }).success
    ).toBe(false);
    expect(
      CreateFloorPlanSectionRequestSchema.safeParse({
        floorPlanId: "f1",
        name: "Patio",
        color: "blue",
      }).success
    ).toBe(false);
    expect(
      CreateFloorPlanSectionRequestSchema.safeParse({
        floorPlanId: "f1",
        name: "Patio",
        color: "#3366cc",
      }).success
    ).toBe(true);
  });

  it("strips mass-assignment keys on update and cannot re-parent a section", () => {
    const parsed = UpdateFloorPlanSectionRequestSchema.parse({
      name: "Bar",
      id: "x",
      venueId: "other",
      floorPlanId: "other",
    });
    expect(parsed).toEqual({ name: "Bar" });
  });

  it("assigns a list of tables, allowing an empty list to clear a section", () => {
    expect(AssignSectionTablesRequestSchema.safeParse({ tableIds: [] }).success).toBe(true);
    expect(AssignSectionTablesRequestSchema.safeParse({ tableIds: ["t1"] }).success).toBe(true);
    expect(AssignSectionTablesRequestSchema.safeParse({}).success).toBe(false);
  });
});
