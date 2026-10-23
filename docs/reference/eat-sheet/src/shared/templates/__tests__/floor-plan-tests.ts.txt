import { describe, it, expect } from "vitest";
import { TEMPLATES, TEMPLATE_SIZES, type FloorPlanTemplate, type TemplateSize } from "../floor-plan";

describe("TEMPLATES", () => {
  it("exports exactly 7 templates", () => {
    expect(TEMPLATES).toHaveLength(7);
  });

  it("each template has required fields: name, description, icon, build", () => {
    for (const t of TEMPLATES) {
      expect(typeof t.name).toBe("string");
      expect(t.name.length).toBeGreaterThan(0);
      expect(typeof t.description).toBe("string");
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.icon).toBe("string");
      expect(t.icon.length).toBeGreaterThan(0);
      expect(typeof t.build).toBe("function");
    }
  });

  it("FloorPlanTemplate type is correctly shaped (compile-time check via assignment)", () => {
    // If this compiles, the type is correct
    const _t: FloorPlanTemplate = TEMPLATES[0]!;
    expect(_t).toBeDefined();
  });
});

describe("TEMPLATE_SIZES", () => {
  it("exports exactly 4 sizes", () => {
    expect(TEMPLATE_SIZES).toHaveLength(4);
  });

  it("each size has label, sub, width, and height", () => {
    for (const s of TEMPLATE_SIZES) {
      expect(typeof s.label).toBe("string");
      expect(s.label.length).toBeGreaterThan(0);
      expect(typeof s.sub).toBe("string");
      expect(typeof s.width).toBe("number");
      expect(s.width).toBeGreaterThan(0);
      expect(typeof s.height).toBe("number");
      expect(s.height).toBeGreaterThan(0);
    }
  });

  it("TemplateSize type is correctly shaped (compile-time check via assignment)", () => {
    const _s: TemplateSize = TEMPLATE_SIZES[0]!;
    expect(_s).toBeDefined();
  });

  it("contains Cozy, Standard, Spacious, Grand in order", () => {
    expect(TEMPLATE_SIZES.map((s) => s.label)).toEqual(["Cozy", "Standard", "Spacious", "Grand"]);
  });
});

describe("Fine Dining template", () => {
  const fineDining = TEMPLATES.find((t) => t.name === "Fine Dining");

  it("exists", () => {
    expect(fineDining).toBeDefined();
  });

  it("build produces a valid SaveFloorPlanPayload at 1200x800", () => {
    const result = fineDining!.build(1200, 800);
    expect(result.canvasWidth).toBe(1200);
    expect(result.canvasHeight).toBe(800);
    expect(Array.isArray(result.tables)).toBe(true);
    expect(result.tables.length).toBeGreaterThan(0);
    expect(Array.isArray(result.sections)).toBe(true);
    expect(result.sections.length).toBeGreaterThan(0);
    expect(Array.isArray(result.walls)).toBe(true);
    expect(result.walls.length).toBeGreaterThan(0);
  });

  it("each table has required fields with valid values", () => {
    const result = fineDining!.build(1200, 800);
    for (const table of result.tables) {
      expect(typeof table.id).toBe("string");
      expect(table.id.length).toBeGreaterThan(0);
      expect(typeof table.label).toBe("string");
      expect(typeof table.x).toBe("number");
      expect(typeof table.y).toBe("number");
      expect(typeof table.width).toBe("number");
      expect(typeof table.height).toBe("number");
      expect(["circle", "square", "rectangle"]).toContain(table.shape);
    }
  });

  it("each wall has required fields", () => {
    const result = fineDining!.build(1200, 800);
    for (const wall of result.walls) {
      expect(typeof wall.id).toBe("string");
      expect(typeof wall.x1).toBe("number");
      expect(typeof wall.y1).toBe("number");
      expect(typeof wall.x2).toBe("number");
      expect(typeof wall.y2).toBe("number");
      expect(typeof wall.thickness).toBe("number");
    }
  });
});

describe("Fractional coordinate scaling", () => {
  it("Fine Dining scales to different canvas sizes proportionally", () => {
    const fineDining = TEMPLATES.find((t) => t.name === "Fine Dining")!;

    const small = fineDining.build(800, 600);
    const large = fineDining.build(2000, 1200);

    // Same number of tables regardless of canvas size
    expect(small.tables.length).toBe(large.tables.length);

    // Canvas dimensions match what was passed
    expect(small.canvasWidth).toBe(800);
    expect(small.canvasHeight).toBe(600);
    expect(large.canvasWidth).toBe(2000);
    expect(large.canvasHeight).toBe(1200);
  });

  it("all 7 templates build without throwing at each of the 4 standard sizes", () => {
    for (const template of TEMPLATES) {
      for (const size of TEMPLATE_SIZES) {
        expect(() => template.build(size.width, size.height)).not.toThrow();
      }
    }
  });
});
