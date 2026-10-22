import { describe, it, expect } from "vitest";
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "./floor-plan-geometry.js";
import {
  ROOM_SIZES,
  ROOM_TEMPLATES,
  roomSizeById,
  roomTemplateById,
  type RoomLayout,
  type RoomSizeId,
  type RoomTemplate,
  type RoomTemplateId,
} from "./room-templates.js";
import { perimeterGaps, tableBounds } from "./room-geometry.js";

const EXPECTED_TEMPLATE_IDS: readonly RoomTemplateId[] = [
  "blank",
  "fine-dining",
  "casual-bistro",
  "bar-lounge",
  "cafe",
  "banquet-hall",
  "open-kitchen",
];

const EXPECTED_SIZES: readonly [RoomSizeId, number, number][] = [
  ["cozy", 800, 600],
  ["standard", 1200, 800],
  ["spacious", 1600, 1000],
  ["grand", 2000, 1200],
];

/** Every template at every size — the 28 combinations the invariants hold over. */
const COMBINATIONS: readonly { template: RoomTemplate; sizeId: RoomSizeId; layout: RoomLayout }[] =
  ROOM_TEMPLATES.flatMap((template) =>
    ROOM_SIZES.map((size) => ({
      template,
      sizeId: size.id,
      layout: template.build(size.width, size.height),
    }))
  );

function overlaps(a: ReturnType<typeof tableBounds>, b: ReturnType<typeof tableBounds>): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

describe("ROOM_TEMPLATES", () => {
  it("exports the seven ported templates in order", () => {
    expect(ROOM_TEMPLATES.map((template) => template.id)).toEqual(EXPECTED_TEMPLATE_IDS);
  });

  it("gives every template a plan name and a declared door width", () => {
    for (const template of ROOM_TEMPLATES) {
      expect(template.planName.length).toBeGreaterThan(0);
      expect(typeof template.build).toBe("function");
      if (template.id === "blank") {
        expect(template.doorWidth).toBeNull();
      } else {
        expect(template.doorWidth).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every id through roomTemplateById", () => {
    for (const id of EXPECTED_TEMPLATE_IDS) {
      expect(roomTemplateById(id).id).toBe(id);
    }
  });
});

describe("ROOM_SIZES", () => {
  it("exports Cozy, Standard, Spacious and Grand at their documented dimensions", () => {
    expect(ROOM_SIZES.map((size) => [size.id, size.width, size.height])).toEqual(
      EXPECTED_SIZES.map((size) => [...size])
    );
  });

  it("resolves every id through roomSizeById", () => {
    for (const [id] of EXPECTED_SIZES) {
      expect(roomSizeById(id).id).toBe(id);
    }
  });

  it("starts at the canvas default, so Cozy is the no-change size", () => {
    const cozy = roomSizeById("cozy");
    expect([cozy.width, cozy.height]).toEqual([CANVAS_WIDTH, CANVAS_HEIGHT]);
  });
});

describe("builders are pure", () => {
  it("returns a deep-equal layout on every call", () => {
    for (const { template, layout } of COMBINATIONS) {
      expect(template.build(layout.width, layout.height)).toEqual(layout);
    }
  });

  it("returns fresh arrays, so a caller mutating one cannot affect the next build", () => {
    const template = roomTemplateById("fine-dining");
    const first = template.build(1200, 800);
    (first.tables as unknown[]).length = 0;
    (first.walls as unknown[]).length = 0;
    (first.sections as unknown[]).length = 0;

    const second = template.build(1200, 800);
    expect(second.tables.length).toBeGreaterThan(0);
    expect(second.walls.length).toBeGreaterThan(0);
    expect(second.sections.length).toBeGreaterThan(0);
  });
});

describe("every template at every size", () => {
  it("reports the canvas it was asked for", () => {
    for (const { layout, sizeId } of COMBINATIONS) {
      const size = roomSizeById(sizeId);
      expect([layout.width, layout.height]).toEqual([size.width, size.height]);
    }
  });

  it("keeps every table inside the canvas bounds", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      for (const table of layout.tables) {
        const bounds = tableBounds(table);
        const where = `${template.id}@${sizeId}/${table.name}`;
        expect({ where, inside: bounds.left >= 0 }).toEqual({ where, inside: true });
        expect({ where, inside: bounds.top >= 0 }).toEqual({ where, inside: true });
        expect({ where, inside: bounds.right <= layout.width }).toEqual({ where, inside: true });
        expect({ where, inside: bounds.bottom <= layout.height }).toEqual({ where, inside: true });
      }
    }
  });

  it("never overlaps two tables", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      const colliding: string[] = [];
      const bounds = layout.tables.map(tableBounds);
      for (let i = 0; i < bounds.length; i += 1) {
        for (let j = i + 1; j < bounds.length; j += 1) {
          if (overlaps(bounds[i]!, bounds[j]!)) {
            colliding.push(`${layout.tables[i]!.name}/${layout.tables[j]!.name}`);
          }
        }
      }
      expect({ where: `${template.id}@${sizeId}`, colliding }).toEqual({
        where: `${template.id}@${sizeId}`,
        colliding: [],
      });
    }
  });

  it("closes the perimeter except at the one intended door", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      const widths = perimeterGaps(layout).map((gap) => gap.to - gap.from);
      const where = `${template.id}@${sizeId}`;
      // Blank builds no walls, so every side reads as one full-length opening.
      const expected =
        template.doorWidth === null
          ? [layout.width, layout.height, layout.width, layout.height]
          : [template.doorWidth];
      expect({ where, widths }).toEqual({ where, widths: expected });
    }
  });

  it("keeps every section inside the canvas bounds", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      for (const section of layout.sections) {
        const where = `${template.id}@${sizeId}/${section.name}`;
        expect({
          where,
          inside:
            section.x >= 0 &&
            section.y >= 0 &&
            section.x + section.width <= layout.width &&
            section.y + section.height <= layout.height,
        }).toEqual({ where, inside: true });
      }
    }
  });

  it("gives every table a unique name and a capacity its minimum fits inside", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      const names = layout.tables.map((table) => table.name);
      expect({ where: `${template.id}@${sizeId}`, unique: new Set(names).size }).toEqual({
        where: `${template.id}@${sizeId}`,
        unique: names.length,
      });
      for (const table of layout.tables) {
        expect(table.minCovers).toBeGreaterThanOrEqual(1);
        expect(table.minCovers).toBeLessThanOrEqual(table.capacity);
      }
    }
  });

  it("gives every id — table, section and wall — a distinct value", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      const ids = [
        ...layout.tables.map((table) => table.id),
        ...layout.sections.map((section) => section.id),
        ...layout.walls.map((wall) => wall.id),
      ];
      expect({ where: `${template.id}@${sizeId}`, unique: new Set(ids).size }).toEqual({
        where: `${template.id}@${sizeId}`,
        unique: ids.length,
      });
    }
  });

  it("only ever points a table at a section the same layout declares", () => {
    for (const { template, sizeId, layout } of COMBINATIONS) {
      const sectionIds = new Set(layout.sections.map((section) => section.id));
      const dangling = layout.tables
        .filter((table) => table.sectionId !== null && !sectionIds.has(table.sectionId))
        .map((table) => table.name);
      expect({ where: `${template.id}@${sizeId}`, dangling }).toEqual({
        where: `${template.id}@${sizeId}`,
        dangling: [],
      });
    }
  });

  it("places the same number of tables at every size", () => {
    for (const template of ROOM_TEMPLATES) {
      const counts = ROOM_SIZES.map(
        (size) => template.build(size.width, size.height).tables.length
      );
      expect(new Set(counts).size).toBe(1);
    }
  });

  it("gives every section a six-digit hex colour the API accepts", () => {
    for (const { layout } of COMBINATIONS) {
      for (const section of layout.sections) {
        expect(section.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("Blank", () => {
  const blank = roomTemplateById("blank");

  it("yields an entirely empty floor at every size, exactly as before templates existed", () => {
    for (const size of ROOM_SIZES) {
      expect(blank.build(size.width, size.height)).toEqual({
        width: size.width,
        height: size.height,
        tables: [],
        sections: [],
        walls: [],
      });
    }
  });

  it("matches today's default canvas at Cozy", () => {
    const layout = blank.build(CANVAS_WIDTH, CANVAS_HEIGHT);
    expect(layout).toEqual({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      tables: [],
      sections: [],
      walls: [],
    });
  });
});

describe("ported intent", () => {
  it("Fine Dining keeps its window two-tops, main dining and private room", () => {
    const layout = roomTemplateById("fine-dining").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Main Dining", "Private"]);
    expect(layout.tables.filter((table) => table.capacity === 2)).toHaveLength(4);
    expect(layout.tables.some((table) => table.capacity === 10)).toBe(true);
  });

  it("Bar & Lounge seats a row of bar stools and a lounge", () => {
    const layout = roomTemplateById("bar-lounge").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Bar", "Lounge"]);
    expect(layout.tables.filter((table) => table.capacity === 1)).toHaveLength(9);
  });

  it("Banquet Hall seats round eight-tops and one head table", () => {
    const layout = roomTemplateById("banquet-hall").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Seating", "Stage"]);
    expect(layout.tables.filter((table) => table.capacity === 8)).toHaveLength(11);
    expect(layout.tables.filter((table) => table.capacity === 16)).toHaveLength(1);
  });

  it("Open Kitchen fronts a chef's counter and keeps dining, kitchen and bar sections", () => {
    const layout = roomTemplateById("open-kitchen").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Dining", "Kitchen", "Bar"]);
    expect(layout.tables.filter((table) => table.name.startsWith("K"))).toHaveLength(6);
  });

  it("Casual Bistro keeps its diamond tops, communal table and booth run", () => {
    const layout = roomTemplateById("casual-bistro").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Dining", "Booths"]);
    expect(layout.tables.filter((table) => table.rotation === 45)).toHaveLength(8);
    expect(layout.tables.filter((table) => table.name.startsWith("B"))).toHaveLength(6);
  });

  it("Cafe keeps six window seats, counter stools and glass along the window wall", () => {
    const layout = roomTemplateById("cafe").build(1200, 800);
    expect(layout.sections.map((section) => section.name)).toEqual(["Window Seats", "Kitchen"]);
    expect(layout.tables.filter((table) => table.name.startsWith("W"))).toHaveLength(6);
    expect(layout.walls.filter((wall) => wall.wallType === "window")).toHaveLength(5);
  });
});
