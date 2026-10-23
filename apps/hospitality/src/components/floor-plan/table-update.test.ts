import { describe, it, expect } from "vitest";
import type { Table } from "@mbe/types";
import { buildTableUpdate, tableToFormValues } from "./table-update.js";

const TABLE: Table = {
  id: "table-a",
  name: "Table A",
  tableNumber: "A1",
  capacity: 4,
  minCovers: 1,
  maxCovers: 4,
  location: "Window",
  isActive: true,
  priority: 0,
  status: "AVAILABLE",
  venueId: "venue-1",
  floorPlanId: "fp-1",
  shapeMetadata: { x: 100, y: 200, width: 80, height: 60, shape: "rectangle" },
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
};

describe("tableToFormValues", () => {
  it("seeds every editable field from the table", () => {
    expect(tableToFormValues(TABLE)).toEqual({
      name: "Table A",
      tableNumber: "A1",
      capacity: "4",
      minCovers: "1",
      maxCovers: "4",
      location: "Window",
      isActive: true,
    });
  });

  it("renders absent optional fields as empty strings, never 'null' or 'undefined'", () => {
    const values = tableToFormValues({ ...TABLE, tableNumber: null, location: null });
    expect(values.tableNumber).toBe("");
    expect(values.location).toBe("");
  });

  // A table with no explicit maximum still needs a value in a numeric input.
  // Seeding it from capacity keeps the field meaningful, and because the delta
  // is computed against these seeded values rather than the table itself,
  // leaving it alone still writes nothing.
  it("seeds maxCovers from capacity when the table has no explicit maximum", () => {
    expect(tableToFormValues({ ...TABLE, maxCovers: null }).maxCovers).toBe("4");
  });
});

describe("buildTableUpdate", () => {
  it("returns no changes when nothing was touched", () => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, seeded)).toEqual({});
  });

  it("returns no changes for a table whose optional fields are all absent", () => {
    const seeded = tableToFormValues({
      ...TABLE,
      tableNumber: null,
      location: null,
      maxCovers: null,
    });
    expect(buildTableUpdate(seeded, seeded)).toEqual({});
  });

  it("sends only the fields that changed", () => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, { ...seeded, name: "Booth 1", location: "Patio" })).toEqual({
      name: "Booth 1",
      location: "Patio",
    });
  });

  it("parses numeric fields to numbers", () => {
    const seeded = tableToFormValues(TABLE);
    expect(
      buildTableUpdate(seeded, { ...seeded, capacity: "6", minCovers: "2", maxCovers: "8" })
    ).toEqual({ capacity: 6, minCovers: 2, maxCovers: 8 });
  });

  it("trims text fields and ignores whitespace-only edits", () => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, { ...seeded, name: "  Table A  " })).toEqual({});
    expect(buildTableUpdate(seeded, { ...seeded, name: "  Booth 1  " })).toEqual({
      name: "Booth 1",
    });
  });

  it("clears an optional text field to an empty string", () => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, { ...seeded, location: "" })).toEqual({ location: "" });
  });

  it("sends isActive when the table is deactivated", () => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, { ...seeded, isActive: false })).toEqual({ isActive: false });
  });

  // The form validates before submitting, but the builder is a boundary of its
  // own: an unparseable number must never reach the API as NaN.
  it.each(["", "0", "-3", "abc", "2.5"])("omits a numeric field holding %o", (raw) => {
    const seeded = tableToFormValues(TABLE);
    expect(buildTableUpdate(seeded, { ...seeded, capacity: raw })).toEqual({});
  });
});
