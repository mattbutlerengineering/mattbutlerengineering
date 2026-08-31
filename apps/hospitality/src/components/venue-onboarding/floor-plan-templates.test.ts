import { describe, it, expect } from "vitest";
import type { CreateTableRequest } from "@mbe/types";
import { CreateTableBodySchema } from "@mbe/types";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  SHAPE_DEFAULTS,
} from "../floor-plan/floor-plan-geometry.js";
import { draftTableToCreateRequest } from "./floor-plan-draft.js";
import { FLOOR_PLAN_TEMPLATES, templateById, tablesForTemplate } from "./floor-plan-templates.js";
import type { TemplateId } from "./floor-plan-templates.js";

/** Parses "N tables · M seats" out of a summary string. Blank's "No tables" yields {count: 0, seats: 0}. */
function parseSummary(summary: string): { count: number; seats: number } {
  if (summary === "No tables") {
    return { count: 0, seats: 0 };
  }
  const match = summary.match(/^(\d+) tables? · (\d+) seats?$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`parseSummary: could not parse "${summary}"`);
  }
  return { count: Number(match[1]), seats: Number(match[2]) };
}

describe("floor-plan-templates", () => {
  describe("FLOOR_PLAN_TEMPLATES", () => {
    it("is in picker order: restaurant, cafe, bar, patio, blank", () => {
      expect(FLOOR_PLAN_TEMPLATES.map((t) => t.id)).toEqual([
        "restaurant",
        "cafe",
        "bar",
        "patio",
        "blank",
      ]);
    });

    it("templateById returns each template", () => {
      const ids: TemplateId[] = ["restaurant", "cafe", "bar", "patio", "blank"];
      for (const id of ids) {
        expect(templateById(id).id).toBe(id);
      }
    });
  });

  describe.each(FLOOR_PLAN_TEMPLATES.map((t) => [t.id, t] as const))("%s", (_id, template) => {
    const tables = tablesForTemplate(template);
    const isBlank = template.id === "blank";

    it(isBlank ? "holds zero tables" : "holds 4-20 tables", () => {
      if (isBlank) {
        expect(tables).toEqual([]);
      } else {
        expect(tables.length).toBeGreaterThanOrEqual(4);
        expect(tables.length).toBeLessThanOrEqual(20);
      }
    });

    it("has unique table names", () => {
      const names = tables.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it("has valid capacity/minCovers on every table", () => {
      for (const table of tables) {
        expect(table.capacity).toBeGreaterThanOrEqual(1);
        expect(table.minCovers).toBeGreaterThanOrEqual(1);
        expect(table.minCovers).toBeLessThanOrEqual(table.capacity);
      }
    });

    it("has a valid shape with matching projected dimensions on every table", () => {
      for (const table of tables) {
        expect(["rectangle", "square", "circle"]).toContain(table.shape);
        const dims = SHAPE_DEFAULTS[table.shape];
        expect(dims).toBeDefined();
      }
    });

    it("has x/y as multiples of GRID_SIZE on every table", () => {
      for (const table of tables) {
        expect(table.x % GRID_SIZE).toBe(0);
        expect(table.y % GRID_SIZE).toBe(0);
      }
    });

    it("keeps every table's bounding box inside the canvas", () => {
      for (const table of tables) {
        const dims = SHAPE_DEFAULTS[table.shape];
        const left = table.x - dims.width / 2;
        const right = table.x + dims.width / 2;
        const top = table.y - dims.height / 2;
        const bottom = table.y + dims.height / 2;
        expect(left).toBeGreaterThanOrEqual(0);
        expect(right).toBeLessThanOrEqual(CANVAS_WIDTH);
        expect(top).toBeGreaterThanOrEqual(0);
        expect(bottom).toBeLessThanOrEqual(CANVAS_HEIGHT);
      }
    });

    it("has no two bounding boxes that intersect", () => {
      const boxes = tables.map((table) => {
        const dims = SHAPE_DEFAULTS[table.shape];
        return {
          left: table.x - dims.width / 2,
          right: table.x + dims.width / 2,
          top: table.y - dims.height / 2,
          bottom: table.y + dims.height / 2,
        };
      });
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i];
          const b = boxes[j];
          if (!a || !b) continue;
          const overlaps =
            a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
          expect(overlaps).toBe(false);
        }
      }
    });

    it("has every table parse against CreateTableBodySchema when projected", () => {
      for (const table of tables) {
        const request: CreateTableRequest = draftTableToCreateRequest(table, "v1", "fp1");
        expect(() => CreateTableBodySchema.parse(request)).not.toThrow();
      }
    });

    it("has localId === name on every table", () => {
      for (const table of tables) {
        expect(table.localId).toBe(table.name);
      }
    });

    it("matches the summary's table count and seat total", () => {
      const { count, seats } = parseSummary(template.summary);
      expect(tables.length).toBe(count);
      expect(tables.reduce((sum, t) => sum + t.capacity, 0)).toBe(seats);
    });
  });

  describe("restaurant", () => {
    it("matches the 14 derived coordinates exactly, in order", () => {
      const tables = tablesForTemplate(templateById("restaurant"));
      const coords = tables.map((t) => [t.name, t.x, t.y]);
      expect(coords).toEqual([
        ["W1", 100, 80],
        ["W2", 220, 80],
        ["W3", 340, 80],
        ["W4", 460, 80],
        ["T1", 120, 220],
        ["T2", 280, 220],
        ["T3", 440, 220],
        ["T4", 120, 360],
        ["T5", 280, 360],
        ["T6", 440, 360],
        ["R1", 660, 220],
        ["R2", 660, 360],
        ["B1", 120, 500],
        ["B2", 240, 500],
      ]);
    });
  });

  describe("blank", () => {
    it("has no zones and tablesForTemplate returns []", () => {
      const template = templateById("blank");
      expect(template.zones).toEqual([]);
      expect(tablesForTemplate(template)).toEqual([]);
    });
  });

  describe("module boundaries", () => {
    it("does not import react, react-konva, or @mbe/api-client", async () => {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const dir = path.dirname(fileURLToPath(import.meta.url));
      const source = await fs.readFile(path.join(dir, "floor-plan-templates.ts"), "utf-8");
      expect(source).not.toMatch(/from ["']react["']/);
      expect(source).not.toMatch(/from ["']react-konva["']/);
      expect(source).not.toMatch(/from ["']@mbe\/api-client["']/);
    });
  });
});
