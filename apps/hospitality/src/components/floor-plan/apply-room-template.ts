/**
 * Turning a built `RoomLayout` into a real floor plan, using only routes the
 * app already has. There is deliberately no template-specific write path
 * (#7256): this module is a sequence of ordinary calls, so a templated plan
 * reloads through exactly the same reads as a hand-built one.
 *
 *   1. `POST /floor-plans`                  — the plan, with its canvas and walls
 *   2. `POST /floor-plan-sections`          — one row per named zone, for its id
 *   3. `PATCH /floor-plans/:id`             — the zone rectangles, now that ids exist
 *   4. `POST /tables`                       — one per table
 *   5. `PUT  /floor-plan-sections/:id/tables` — section membership
 *
 * Step 3 exists because a section's rectangle lives in `layoutJson.sections`
 * keyed by the row's **server** id, which cannot be known until step 2 has
 * run. The builders' local ids never leave this module.
 *
 * A failure propagates untouched, leaving whatever was created in place. That
 * is deliberate and matches the venue-onboarding launch sequence: an operator
 * can see a half-built plan and finish it, whereas deleting a plan they were
 * just shown loses work silently.
 */

import type {
  CreateFloorPlanRequest,
  CreateFloorPlanSectionRequest,
  CreateTableRequest,
  FloorPlan,
  FloorPlanLayout,
  FloorPlanSection,
  PaginatedResponse,
  SectionLayout,
  Table,
  UpdateFloorPlanRequest,
} from "@mbe/types";
import { GRID_SIZE } from "./floor-plan-geometry.js";
import type { RoomLayout, RoomTemplateTable } from "./room-templates.js";

/**
 * The routes this needs, as a structural interface rather than the whole
 * `ApiClient` — the unit tests then need no network and no client mock module
 * (the same shape `launch-sequence.ts`'s `LaunchApi` uses).
 */
export interface RoomTemplateApi {
  readonly floorPlans: {
    create(data: CreateFloorPlanRequest): Promise<FloorPlan>;
    update(id: string, data: UpdateFloorPlanRequest): Promise<FloorPlan>;
  };
  readonly floorPlanSections: {
    create(venueId: string, data: CreateFloorPlanSectionRequest): Promise<FloorPlanSection>;
    assignTables(venueId: string, sectionId: string, tableIds: string[]): Promise<Table[]>;
  };
  readonly tables: {
    list(params: {
      venueId: string;
      page?: number;
      limit?: number;
    }): Promise<PaginatedResponse<Table>>;
    create(data: CreateTableRequest): Promise<Table>;
  };
}

/** The server's cap on `limit` (`parsePaginationQuery` in `@mbe/database`). */
const MAX_PAGE_SIZE = 100;

/**
 * Every table name this venue already holds, across all of its plans.
 *
 * Paged, because the server clamps `limit` to 100 and a venue accumulates
 * 15-25 tables per templated plan — so the fourth or fifth plan would silently
 * read a truncated set and then collide on a name the first page never showed.
 */
async function listVenueTableNames(
  api: RoomTemplateApi,
  venueId: string
): Promise<ReadonlySet<string>> {
  const names = new Set<string>();
  for (let page = 1; ; page += 1) {
    const { data, pagination } = await api.tables.list({ venueId, page, limit: MAX_PAGE_SIZE });
    for (const table of data) names.add(table.name);
    if (data.length === 0 || names.size >= pagination.total || page >= pagination.totalPages) break;
  }
  return names;
}

/**
 * `desired`, or the first `desired-N` that this venue does not already use.
 *
 * Table names are unique per **venue**, not per plan (`@@unique([venueId,
 * name])` in the reservations schema; the violation surfaces as a 400, "A table
 * with this name already exists"), and every non-blank template draws from the
 * same small pool — `T1…T11`, `W1…W6`, `B1…B9`, `P1…P5`, `K1…K6`, `L1…L6`,
 * `C1…C7`, `HEAD`. Without this, a venue's *second* templated plan fails on its
 * first table.
 *
 * Disambiguating is deliberately not what `launch-sequence.ts` does with the
 * same 400: there (`isAlreadyCreatedError`) a duplicate really is the table a
 * resumed launch already created, so treating it as done is correct. Here the
 * colliding `T1` belongs to a *different* plan, so swallowing the error would
 * hand the new plan fewer tables than its template specifies — the same bug,
 * quieter. Only later plans are suffixed; the first keeps the pristine names.
 */
function uniqueTableName(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired;
  // `taken` is finite, and among `desired-2 … desired-(size + 2)` there are
  // more candidates than `taken` has entries, so one of them is always free.
  for (let suffix = 2; suffix <= taken.size + 2; suffix += 1) {
    const candidate = `${desired}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  /* c8 ignore next -- unreachable: the loop above exhausts a superset of `taken` */
  throw new Error(`Could not find an unused name for table "${desired}"`);
}

export interface CreateFromTemplateInput {
  readonly venueId: string;
  readonly name: string;
  readonly layout: RoomLayout;
}

/**
 * The `layoutJson` a template's plan is created with. Section rectangles are
 * deliberately absent — they are added once their rows have server ids — and
 * `walls` is omitted entirely when the template builds none, so Blank produces
 * the identical literal a hand-created plan has always carried.
 */
export function templateLayoutJson(layout: RoomLayout): FloorPlanLayout {
  return {
    width: layout.width,
    height: layout.height,
    gridSize: GRID_SIZE,
    showGrid: true,
    ...(layout.walls.length > 0 ? { walls: [...layout.walls] } : {}),
  };
}

/** One template table as the ordinary create-table request. */
export function templateTableRequest(
  table: RoomTemplateTable,
  venueId: string,
  floorPlanId: string,
  name: string = table.name
): CreateTableRequest {
  return {
    name,
    capacity: table.capacity,
    minCovers: table.minCovers,
    venueId,
    floorPlanId,
    shapeMetadata: {
      shape: table.shape,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
      rotation: table.rotation,
    },
  };
}

/** Creates one section row per named zone, keyed by the zone's local id. */
async function createSectionRows(
  api: RoomTemplateApi,
  venueId: string,
  floorPlanId: string,
  layout: RoomLayout
): Promise<ReadonlyMap<string, FloorPlanSection>> {
  const rows = new Map<string, FloorPlanSection>();
  for (const [index, zone] of layout.sections.entries()) {
    const row = await api.floorPlanSections.create(venueId, {
      floorPlanId,
      name: zone.name,
      color: zone.color,
      displayOrder: index,
    });
    rows.set(zone.id, row);
  }
  return rows;
}

/** The zone rectangles, re-keyed from local ids onto the rows the server made. */
function sectionRectangles(
  layout: RoomLayout,
  rows: ReadonlyMap<string, FloorPlanSection>
): SectionLayout[] {
  return layout.sections.flatMap((zone) => {
    const row = rows.get(zone.id);
    return row
      ? [{ id: row.id, x: zone.x, y: zone.y, width: zone.width, height: zone.height }]
      : [];
  });
}

/**
 * Creates every table, returning the server id of each, keyed by the local
 * section id the template placed it in. Tables outside every zone are created
 * too; they simply contribute no membership.
 */
async function createTables(
  api: RoomTemplateApi,
  venueId: string,
  floorPlanId: string,
  layout: RoomLayout
): Promise<ReadonlyMap<string, readonly string[]>> {
  // Read the venue's existing names once, then grow the set as we go so the
  // template's own tables cannot collide with each other either.
  const taken = new Set(await listVenueTableNames(api, venueId));
  const bySection = new Map<string, string[]>();
  for (const table of layout.tables) {
    const name = uniqueTableName(table.name, taken);
    taken.add(name);
    const created = await api.tables.create(
      templateTableRequest(table, venueId, floorPlanId, name)
    );
    if (table.sectionId === null) continue;
    bySection.set(table.sectionId, [...(bySection.get(table.sectionId) ?? []), created.id]);
  }
  return bySection;
}

/**
 * Creates the floor plan a template describes and returns it. Resolves to the
 * plan the editor should open — the patched one when the template has
 * sections, otherwise the one `create` returned.
 */
export async function createFloorPlanFromTemplate(
  api: RoomTemplateApi,
  { venueId, name, layout }: CreateFromTemplateInput
): Promise<FloorPlan> {
  const layoutJson = templateLayoutJson(layout);
  const plan = await api.floorPlans.create({ venueId, name, layoutJson });

  const rows = await createSectionRows(api, venueId, plan.id, layout);
  const withSections =
    rows.size > 0
      ? await api.floorPlans.update(plan.id, {
          layoutJson: { ...layoutJson, sections: sectionRectangles(layout, rows) },
        })
      : plan;

  const tablesBySection = await createTables(api, venueId, plan.id, layout);

  for (const [localSectionId, tableIds] of tablesBySection) {
    const row = rows.get(localSectionId);
    if (!row || tableIds.length === 0) continue;
    await api.floorPlanSections.assignTables(venueId, row.id, [...tableIds]);
  }

  return withSections;
}
