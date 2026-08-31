import { describe, it, expect } from "vitest";
import type { CreateTableRequest } from "@mbe/types";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  SHAPE_DEFAULTS,
} from "../floor-plan/floor-plan-geometry.js";
import {
  DRAFT_ID,
  DUPLICATE_TABLE_NAME_MESSAGE,
  EMPTY_FLOOR_PLAN_DRAFT,
  draftToCanvasTables,
  draftToCanvasFloorPlan,
  draftTableFromCreateRequest,
  draftTableToCreateRequest,
  findDuplicateName,
} from "./floor-plan-draft.js";
import type { DraftTable, DraftTableShape, FloorPlanDraft } from "./floor-plan-draft.js";

function makeDraftTable(overrides: Partial<DraftTable> = {}): DraftTable {
  return {
    localId: "T1",
    name: "T1",
    capacity: 4,
    minCovers: 1,
    shape: "rectangle",
    x: 100,
    y: 100,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<FloorPlanDraft> = {}): FloorPlanDraft {
  return {
    templateId: "template-1",
    planName: "Main Floor",
    tables: [makeDraftTable()],
    pristine: false,
    ...overrides,
  };
}

describe("floor-plan-draft", () => {
  describe("constants", () => {
    it("EMPTY_FLOOR_PLAN_DRAFT is an empty, pristine draft", () => {
      expect(EMPTY_FLOOR_PLAN_DRAFT).toEqual({
        templateId: null,
        planName: "",
        tables: [],
        pristine: true,
      });
    });

    it("DRAFT_ID is a loud sentinel, not an empty string", () => {
      expect(DRAFT_ID).toBe("__draft__");
    });

    it("DUPLICATE_TABLE_NAME_MESSAGE matches the server's rejection string verbatim", () => {
      expect(DUPLICATE_TABLE_NAME_MESSAGE).toBe("A table with this name already exists");
    });
  });

  describe("draftTableToCreateRequest / draftTableFromCreateRequest round trip", () => {
    const shapes: DraftTableShape[] = ["rectangle", "square", "circle"];

    it.each(shapes)("round-trips a %s draft table", (shape) => {
      const table = makeDraftTable({ shape, localId: `local-${shape}` });
      const request = draftTableToCreateRequest(table, "v1", "fp1");
      const roundTripped = draftTableFromCreateRequest(request, table.localId);
      expect(roundTripped).toEqual(table);
    });

    it("draftTableToCreateRequest output contains no localId key", () => {
      const table = makeDraftTable();
      const request = draftTableToCreateRequest(table, "v1", "fp1");
      expect(Object.keys(request)).not.toContain("localId");
    });

    it("JSON.stringify of draftTableToCreateRequest never contains the DRAFT_ID sentinel", () => {
      const request: CreateTableRequest = {
        name: "T1",
        capacity: 4,
        minCovers: 1,
        venueId: DRAFT_ID,
        floorPlanId: DRAFT_ID,
        shapeMetadata: { shape: "rectangle", x: 100, y: 100, width: 80, height: 60 },
      };
      const table = draftTableFromCreateRequest(request, "local-1");
      const output = draftTableToCreateRequest(table, "v1", "fp1");
      expect(JSON.stringify(output)).not.toContain(DRAFT_ID);
    });

    it("draftTableFromCreateRequest discards request.venueId and request.floorPlanId", () => {
      const request: CreateTableRequest = {
        name: "T1",
        capacity: 4,
        minCovers: 1,
        venueId: DRAFT_ID,
        floorPlanId: DRAFT_ID,
        shapeMetadata: { shape: "circle", x: 200, y: 150, width: 70, height: 70 },
      };
      const table = draftTableFromCreateRequest(request, "local-1");
      expect(table).not.toHaveProperty("venueId");
      expect(table).not.toHaveProperty("floorPlanId");
    });

    it("draftTableFromCreateRequest reads shape/x/y from request.shapeMetadata", () => {
      const request: CreateTableRequest = {
        name: "T1",
        capacity: 4,
        minCovers: 1,
        venueId: "v1",
        floorPlanId: "fp1",
        shapeMetadata: { shape: "square", x: 220, y: 340, width: 60, height: 60 },
      };
      const table = draftTableFromCreateRequest(request, "local-1");
      expect(table.shape).toBe("square");
      expect(table.x).toBe(220);
      expect(table.y).toBe(340);
    });
  });

  describe("draftToCanvasTables", () => {
    it("maps one draft table to one Table with matching id, dims, and null venue/floorPlan ids", () => {
      const draft = makeDraft({
        tables: [makeDraftTable({ localId: "T1", shape: "circle" })],
      });
      const [canvasTable] = draftToCanvasTables(draft);
      expect(canvasTable).toBeDefined();
      expect(canvasTable?.id).toBe("T1");
      expect(canvasTable?.shapeMetadata?.width).toBe(SHAPE_DEFAULTS.circle.width);
      expect(canvasTable?.shapeMetadata?.height).toBe(SHAPE_DEFAULTS.circle.height);
      expect(canvasTable?.venueId).toBeNull();
      expect(canvasTable?.floorPlanId).toBeNull();
    });

    it("is referentially stable in output value across repeated calls (no new Date() inside)", () => {
      const draft = makeDraft();
      const first = draftToCanvasTables(draft);
      const second = draftToCanvasTables(draft);
      expect(first).toEqual(second);
    });
  });

  describe("draftToCanvasFloorPlan", () => {
    it("projects planName and isActive: false", () => {
      const draft = makeDraft({ planName: "Patio" });
      const floorPlan = draftToCanvasFloorPlan(draft);
      expect(floorPlan.name).toBe("Patio");
      expect(floorPlan.isActive).toBe(false);
    });

    it("projects layoutJson from the single geometry source", () => {
      const draft = makeDraft();
      const floorPlan = draftToCanvasFloorPlan(draft);
      expect(floorPlan.layoutJson).toEqual({
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        gridSize: GRID_SIZE,
        showGrid: true,
      });
    });

    it("is referentially stable in output value across repeated calls (no new Date() inside)", () => {
      const draft = makeDraft();
      const first = draftToCanvasFloorPlan(draft);
      const second = draftToCanvasFloorPlan(draft);
      expect(first).toEqual(second);
    });
  });

  describe("findDuplicateName", () => {
    const tables = [
      makeDraftTable({ localId: "a", name: "T1" }),
      makeDraftTable({ localId: "b", name: "T2" }),
    ];

    it("is exact on the trimmed name", () => {
      expect(findDuplicateName(tables, "  T1  ")).toBe(true);
    });

    it("returns false on an empty list", () => {
      expect(findDuplicateName([], "T1")).toBe(false);
    });

    it("returns false for the table named by ignoreLocalId", () => {
      expect(findDuplicateName(tables, "T1", "a")).toBe(false);
    });

    it("returns false for a name that does not collide", () => {
      expect(findDuplicateName(tables, "T3")).toBe(false);
    });
  });

  describe("module boundaries", () => {
    it("does not import react, react-konva, or @mbe/api-client", async () => {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const source = await fs.readFile(path.join(dir, "floor-plan-draft.ts"), "utf-8");
      expect(source).not.toMatch(/from ["']react["']/);
      expect(source).not.toMatch(/from ["']react-konva["']/);
      expect(source).not.toMatch(/from ["']@mbe\/api-client["']/);
    });
  });
});
