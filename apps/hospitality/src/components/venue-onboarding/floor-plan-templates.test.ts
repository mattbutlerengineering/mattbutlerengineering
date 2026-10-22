import { describe, it, expect } from "vitest";
import { CreateTableBodySchema } from "@mbe/types";
import { ROOM_SIZES, roomTemplateById } from "../floor-plan/room-templates.js";
import {
  draftTableSize,
  draftTableToCreateRequest,
  type FloorPlanDraft,
} from "./floor-plan-draft.js";
import {
  FLOOR_PLAN_TEMPLATES,
  draftFromTemplate,
  layoutForDraft,
  templateById,
} from "./floor-plan-templates.js";

/**
 * This module is now an adapter over `../floor-plan/room-templates.ts`, whose
 * own suite owns the geometry invariants (in-bounds, non-overlapping, closed
 * perimeter, at all four sizes). What is tested here is the projection into
 * the draft the wizard edits.
 */
describe("floor-plan-templates", () => {
  describe("FLOOR_PLAN_TEMPLATES", () => {
    it("offers the seven room templates, Blank first", () => {
      expect(FLOOR_PLAN_TEMPLATES.map((template) => template.id)).toEqual([
        "blank",
        "fine-dining",
        "casual-bistro",
        "bar-lounge",
        "cafe",
        "banquet-hall",
        "open-kitchen",
      ]);
    });

    it("templateById resolves every one of them", () => {
      for (const template of FLOOR_PLAN_TEMPLATES) {
        expect(templateById(template.id)).toBe(template);
      }
    });
  });

  describe("draftFromTemplate", () => {
    it("is pure: the same room at the same size always yields the same draft", () => {
      expect(draftFromTemplate("cafe", "standard")).toEqual(draftFromTemplate("cafe", "standard"));
    });

    it("records the room, its size and its canvas", () => {
      const draft = draftFromTemplate("banquet-hall", "grand");

      expect(draft.templateId).toBe("banquet-hall");
      expect(draft.sizeId).toBe("grand");
      expect([draft.width, draft.height]).toEqual([2000, 1200]);
      expect(draft.planName).toBe(roomTemplateById("banquet-hall").planName);
      expect(draft.pristine).toBe(true);
    });

    it("carries the room's walls and named zones into the draft", () => {
      const layout = roomTemplateById("fine-dining").build(1200, 800);
      const draft = draftFromTemplate("fine-dining", "standard");

      expect(draft.walls).toEqual(layout.walls);
      expect(draft.sections.map((zone) => zone.name)).toEqual(["Main Dining", "Private"]);
    });

    it("gives each draft table the template's own footprint, rotation and zone", () => {
      const layout = roomTemplateById("casual-bistro").build(1200, 800);
      const draft = draftFromTemplate("casual-bistro", "standard");

      expect(draft.tables).toHaveLength(layout.tables.length);
      for (const [index, table] of draft.tables.entries()) {
        const source = layout.tables[index]!;
        expect(table).toEqual({
          localId: source.name,
          name: source.name,
          capacity: source.capacity,
          minCovers: source.minCovers,
          shape: source.shape,
          x: source.x,
          y: source.y,
          width: source.width,
          height: source.height,
          rotation: source.rotation,
          sectionId: source.sectionId,
        });
      }
    });

    it("keeps localId === name, so Launch can resume by name", () => {
      for (const template of FLOOR_PLAN_TEMPLATES) {
        for (const table of draftFromTemplate(template.id, "standard").tables) {
          expect(table.localId).toBe(table.name);
        }
      }
    });

    it("rebuilds at each size, so the table count never changes with the room", () => {
      for (const template of FLOOR_PLAN_TEMPLATES) {
        const counts = ROOM_SIZES.map(
          (size) => draftFromTemplate(template.id, size.id).tables.length
        );
        expect(new Set(counts).size).toBe(1);
      }
    });

    it("projects every table into a request the server's own schema accepts", () => {
      for (const template of FLOOR_PLAN_TEMPLATES) {
        for (const size of ROOM_SIZES) {
          for (const table of draftFromTemplate(template.id, size.id).tables) {
            const request = draftTableToCreateRequest(table, "venue-1", "plan-1");
            const parsed = CreateTableBodySchema.safeParse(request);
            expect({
              where: `${template.id}@${size.id}/${table.name}`,
              ok: parsed.success,
            }).toEqual({
              where: `${template.id}@${size.id}/${table.name}`,
              ok: true,
            });
          }
        }
      }
    });

    it("reports the template's own footprint through draftTableSize", () => {
      const draft = draftFromTemplate("fine-dining", "standard");
      const longTable = draft.tables.find((table) => table.name === "P2")!;

      // A room template's long table is 140x56, not the 80x60 shape default.
      expect(draftTableSize(longTable)).toEqual({ width: 140, height: 56 });
    });

    describe("blank", () => {
      it("is an empty floor at every size — no tables, no zones, no walls", () => {
        for (const size of ROOM_SIZES) {
          const draft = draftFromTemplate("blank", size.id);
          expect(draft.tables).toEqual([]);
          expect(draft.sections).toEqual([]);
          expect(draft.walls).toEqual([]);
        }
      });
    });
  });

  describe("layoutForDraft", () => {
    it("matches the template exactly for a pristine draft", () => {
      const draft = draftFromTemplate("open-kitchen", "spacious");
      const built = roomTemplateById("open-kitchen").build(1600, 1000);
      expect(layoutForDraft(draft)).toEqual({
        ...built,
        // The one intended difference: a draft identifies its tables by
        // `localId` (the template's table name), which is what the preview
        // keys on. The builder's own derived id is not carried into the draft.
        tables: built.tables.map((table) => ({ ...table, id: table.name })),
      });
    });

    it("has nothing to show before a room is picked", () => {
      expect(layoutForDraft({ ...draftFromTemplate("cafe", "cozy"), templateId: null })).toBeNull();
    });

    // The preview must show the DRAFT, not a rebuild of its template: step 5
    // lets the operator move, remove and add tables, and the review card at
    // step 6 renders this layout next to a count derived from draft.tables.
    // Rebuilding would make the picture and that count contradict each other.
    it("follows the draft's own tables when the operator has edited them", () => {
      const pristine = draftFromTemplate("fine-dining", "cozy");
      const moved = pristine.tables[0]!;
      const removed = pristine.tables[1]!;
      const edited: FloorPlanDraft = {
        ...pristine,
        tables: [{ ...moved, x: moved.x + 120, y: moved.y + 80 }, ...pristine.tables.slice(2)],
        pristine: false,
      };

      const layout = layoutForDraft(edited)!;

      expect(layout.tables).toHaveLength(pristine.tables.length - 1);
      expect(layout.tables.map((table) => table.name)).not.toContain(removed.name);
      const previewed = layout.tables.find((table) => table.name === moved.name)!;
      expect(previewed.x).toBe(moved.x + 120);
      expect(previewed.y).toBe(moved.y + 80);

      // The room itself is unchanged — only its contents moved.
      expect(layout.width).toBe(pristine.width);
      expect(layout.height).toBe(pristine.height);
      expect(layout.walls).toEqual(pristine.walls);
      expect(layout.sections).toEqual(pristine.sections);
    });

    it("gives a manager-added table its shape default footprint", () => {
      const pristine = draftFromTemplate("banquet-hall", "cozy");
      const added = {
        localId: "local-added",
        name: "NEW-1",
        capacity: 2,
        minCovers: 1,
        shape: "circle" as const,
        x: 200,
        y: 200,
      };

      const layout = layoutForDraft({ ...pristine, tables: [added], pristine: false })!;

      expect(layout.tables).toHaveLength(1);
      const previewed = layout.tables[0]!;
      expect(previewed.width).toBeGreaterThan(0);
      expect(previewed.height).toBeGreaterThan(0);
      expect(previewed.rotation).toBe(0);
      expect(previewed.sectionId).toBeNull();
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
