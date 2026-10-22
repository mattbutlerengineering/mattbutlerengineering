import { describe, it, expect } from "vitest";
import type {
  CreateFloorPlanRequest,
  CreateFloorPlanSectionRequest,
  CreateTableRequest,
  FloorPlan,
  FloorPlanSection,
  Table,
  UpdateFloorPlanRequest,
} from "@mbe/types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, GRID_SIZE } from "./floor-plan-geometry.js";
import { roomTemplateById } from "./room-templates.js";
import {
  createFloorPlanFromTemplate,
  templateLayoutJson,
  templateTableRequest,
  type RoomTemplateApi,
} from "./apply-room-template.js";

const VENUE_ID = "venue-1";

function fakePlan(overrides: Partial<FloorPlan> = {}): FloorPlan {
  return {
    id: "plan-1",
    venueId: VENUE_ID,
    name: "Dining Room",
    isActive: false,
    layoutJson: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

interface Recorder {
  readonly api: RoomTemplateApi;
  readonly created: CreateFloorPlanRequest[];
  readonly updated: { id: string; data: UpdateFloorPlanRequest }[];
  readonly sections: CreateFloorPlanSectionRequest[];
  readonly tables: CreateTableRequest[];
  readonly assignments: { sectionId: string; tableIds: string[] }[];
  /** Every table name this fake venue holds, across all of its plans. */
  readonly venueTableNames: Set<string>;
}

function recorder(
  failures: Partial<Record<"table", number>> = {},
  existingTableNames: readonly string[] = []
): Recorder {
  // The server enforces @@unique([venueId, name]) on tables and maps the
  // violation to a 400 (services/reservations: schema.prisma, routes/tables.ts),
  // so this fake does too — a double that accepts duplicate names cannot see
  // the defect that constraint causes across two plans in one venue.
  const venueTableNames = new Set<string>(existingTableNames);
  const created: CreateFloorPlanRequest[] = [];
  const updated: { id: string; data: UpdateFloorPlanRequest }[] = [];
  const sections: CreateFloorPlanSectionRequest[] = [];
  const tables: CreateTableRequest[] = [];
  const assignments: { sectionId: string; tableIds: string[] }[] = [];

  const api: RoomTemplateApi = {
    floorPlans: {
      create: async (data) => {
        created.push(data);
        return fakePlan({ name: data.name, layoutJson: data.layoutJson });
      },
      update: async (id, data) => {
        updated.push({ id, data });
        return fakePlan({ id, layoutJson: data.layoutJson ?? { width: 0, height: 0 } });
      },
    },
    floorPlanSections: {
      create: async (venueId, data) => {
        sections.push(data);
        return {
          id: `row-${sections.length}`,
          venueId,
          floorPlanId: data.floorPlanId,
          name: data.name,
          color: data.color ?? "#000000",
          displayOrder: data.displayOrder ?? 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        } satisfies FloorPlanSection;
      },
      assignTables: async (_venueId, sectionId, tableIds) => {
        assignments.push({ sectionId, tableIds: [...tableIds] });
        return [];
      },
    },
    tables: {
      list: async ({ venueId, page = 1, limit = 100 }) => {
        const all = venueId === VENUE_ID ? [...venueTableNames] : [];
        const start = (page - 1) * limit;
        return {
          data: all
            .slice(start, start + limit)
            .map((name, index) => ({ id: `existing-${start + index}`, name }) as unknown as Table),
          pagination: {
            page,
            limit,
            total: all.length,
            totalPages: Math.ceil(all.length / limit),
            hasNext: start + limit < all.length,
            hasPrev: page > 1,
          },
        };
      },
      create: async (data) => {
        tables.push(data);
        if (failures.table === tables.length) throw new Error("table rejected");
        if (venueTableNames.has(data.name)) {
          throw new Error("A table with this name already exists");
        }
        venueTableNames.add(data.name);
        return { id: `table-${tables.length}`, name: data.name } as unknown as Table;
      },
    },
  };

  return { api, created, updated, sections, tables, assignments, venueTableNames };
}

describe("templateLayoutJson", () => {
  it("reproduces today's default layout for Blank at the canvas size, byte for byte", () => {
    const layout = roomTemplateById("blank").build(CANVAS_WIDTH, CANVAS_HEIGHT);

    expect(templateLayoutJson(layout)).toEqual({
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      gridSize: GRID_SIZE,
      showGrid: true,
    });
  });

  it("carries the template's walls but no section rectangles, which need server ids", () => {
    const layout = roomTemplateById("cafe").build(1200, 800);
    const layoutJson = templateLayoutJson(layout);

    expect(layoutJson.walls).toEqual(layout.walls);
    expect(layoutJson.sections).toBeUndefined();
    expect([layoutJson.width, layoutJson.height]).toEqual([1200, 800]);
  });
});

describe("templateTableRequest", () => {
  it("maps a template table onto the create-table request the normal route takes", () => {
    const layout = roomTemplateById("fine-dining").build(1200, 800);
    const table = layout.tables.find((candidate) => candidate.name === "P2")!;

    expect(templateTableRequest(table, VENUE_ID, "plan-1")).toEqual({
      name: "P2",
      capacity: table.capacity,
      minCovers: table.minCovers,
      venueId: VENUE_ID,
      floorPlanId: "plan-1",
      shapeMetadata: {
        shape: table.shape,
        x: table.x,
        y: table.y,
        width: table.width,
        height: table.height,
        rotation: table.rotation,
      },
    });
  });
});

describe("createFloorPlanFromTemplate", () => {
  it("creates a Blank plan with one call and nothing else, exactly as before", async () => {
    const { api, created, updated, sections, tables, assignments } = recorder();
    const layout = roomTemplateById("blank").build(CANVAS_WIDTH, CANVAS_HEIGHT);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Main Floor", layout });

    expect(created).toEqual([
      {
        venueId: VENUE_ID,
        name: "Main Floor",
        layoutJson: {
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          gridSize: GRID_SIZE,
          showGrid: true,
        },
      },
    ]);
    expect(updated).toEqual([]);
    expect(sections).toEqual([]);
    expect(tables).toEqual([]);
    expect(assignments).toEqual([]);
  });

  it("creates the plan, then its sections, then its tables, through the normal routes", async () => {
    const { api, created, updated, sections, tables } = recorder();
    const layout = roomTemplateById("fine-dining").build(1200, 800);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Dining Room", layout });

    expect(created).toHaveLength(1);
    expect(created[0]!.layoutJson.walls).toEqual(layout.walls);
    expect(sections.map((section) => section.name)).toEqual(["Main Dining", "Private"]);
    expect(sections.map((section) => section.displayOrder)).toEqual([0, 1]);
    expect(tables).toHaveLength(layout.tables.length);
    expect(updated).toHaveLength(1);
  });

  it("rewrites the section rectangles onto the ids the server minted", async () => {
    const { api, updated } = recorder();
    const layout = roomTemplateById("bar-lounge").build(1600, 1000);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Bar Floor", layout });

    expect(updated[0]!.data.layoutJson?.sections).toEqual([
      { id: "row-1", ...rectOf(layout, "Bar") },
      { id: "row-2", ...rectOf(layout, "Lounge") },
    ]);
    // The local builder ids never reach the server.
    expect(JSON.stringify(updated[0])).not.toContain("bar-lounge-bar");
  });

  it("assigns each section the tables the template placed inside it", async () => {
    const { api, assignments } = recorder();
    const layout = roomTemplateById("fine-dining").build(1200, 800);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Dining Room", layout });

    const expected = layout.sections.map((section, index) => ({
      sectionId: `row-${index + 1}`,
      count: layout.tables.filter((table) => table.sectionId === section.id).length,
    }));
    expect(
      assignments.map((entry) => ({ sectionId: entry.sectionId, count: entry.tableIds.length }))
    ).toEqual(expected.filter((entry) => entry.count > 0));
  });

  it("never asks the server to assign an empty table list", async () => {
    const { api, assignments } = recorder();
    const layout = roomTemplateById("open-kitchen").build(800, 600);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Open Kitchen", layout });

    for (const entry of assignments) {
      expect(entry.tableIds.length).toBeGreaterThan(0);
    }
  });

  it("returns the plan the editor should open", async () => {
    const { api } = recorder();
    const layout = roomTemplateById("cafe").build(800, 600);

    const plan = await createFloorPlanFromTemplate(api, {
      venueId: VENUE_ID,
      name: "Café Floor",
      layout,
    });

    expect(plan.id).toBe("plan-1");
  });

  it("surfaces a failure part-way through instead of swallowing it", async () => {
    const { api, tables } = recorder({ table: 3 });
    const layout = roomTemplateById("banquet-hall").build(800, 600);

    await expect(
      createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Banquet Hall", layout })
    ).rejects.toThrow("table rejected");
    // It stops at the failure rather than pressing on through the rest.
    expect(tables).toHaveLength(3);
  });

  // Table names are unique per VENUE, not per plan (@@unique([venueId, name])),
  // and every non-blank template draws from the same small pool (T1..., W1...,
  // B1...), so a venue's second templated plan collides on its first table.
  describe("a second templated plan in the same venue", () => {
    it("creates every table the template specifies, with disambiguated names", async () => {
      const { api, tables, venueTableNames } = recorder();
      const first = roomTemplateById("fine-dining").build(1200, 800);
      const second = roomTemplateById("cafe").build(1200, 800);

      await createFloorPlanFromTemplate(api, {
        venueId: VENUE_ID,
        name: "Dining Room",
        layout: first,
      });
      const firstNames = tables.map((table) => table.name);
      expect(firstNames).toEqual(first.tables.map((table) => table.name));

      await createFloorPlanFromTemplate(api, {
        venueId: VENUE_ID,
        name: "Cafe Floor",
        layout: second,
      });

      // The second plan gets a table for every table its template specifies --
      // never fewer, which is what swallowing the duplicate-name 400 as
      // "already created" (launch-sequence.ts's resume behaviour) would do.
      const secondNames = tables.slice(firstNames.length).map((table) => table.name);
      expect(secondNames).toHaveLength(second.tables.length);
      expect(new Set(secondNames).size).toBe(second.tables.length);

      // The two plans share no table name — that is the constraint the server
      // enforces, and the only thing that has to hold. A second-plan name is
      // left pristine whenever it is genuinely free (Cafe's W5/W6 are, since
      // Fine Dining only goes up to W4) and suffixed when it is not.
      expect(firstNames.filter((name) => secondNames.includes(name))).toEqual([]);
      expect(secondNames.some((name) => /-[0-9]+$/.test(name))).toBe(true);

      // The first plan keeps every one of its original names.
      expect(firstNames.every((name) => venueTableNames.has(name))).toBe(true);
    });

    it("leaves names alone when the venue has no colliding tables", async () => {
      const { api, tables } = recorder({}, ["ZZ-not-a-template-name"]);
      const layout = roomTemplateById("banquet-hall").build(800, 600);

      await createFloorPlanFromTemplate(api, {
        venueId: VENUE_ID,
        name: "Banquet Hall",
        layout,
      });

      expect(tables.map((table) => table.name)).toEqual(layout.tables.map((table) => table.name));
    });
  });

  it("does not mutate the layout it was handed", async () => {
    const { api } = recorder();
    const layout = roomTemplateById("casual-bistro").build(1200, 800);
    const before = structuredClone(layout);

    await createFloorPlanFromTemplate(api, { venueId: VENUE_ID, name: "Bistro Floor", layout });

    expect(layout).toEqual(before);
  });
});

function rectOf(
  layout: ReturnType<ReturnType<typeof roomTemplateById>["build"]>,
  name: string
): { x: number; y: number; width: number; height: number } {
  const section = layout.sections.find((candidate) => candidate.name === name)!;
  return { x: section.x, y: section.y, width: section.width, height: section.height };
}
