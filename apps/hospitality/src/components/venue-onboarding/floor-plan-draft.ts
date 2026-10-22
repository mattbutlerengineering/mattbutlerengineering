/**
 * The in-memory floor plan draft and its projections into the shapes
 * FloorPlanCanvas already consumes.
 *
 * Everything in the new-venue wizard's floor-plan step operates on this
 * draft — it has no server-side existence until Launch creates the real
 * venue / floor plan / tables. `draftToCanvasTables` and
 * `draftToCanvasFloorPlan` are render-time projections only: computed fresh
 * from the draft on every call, never stored, so no server-shaped
 * placeholder (DRAFT_ID, null venueId/floorPlanId) can leak into a Launch
 * payload. `draftTableFromCreateRequest` / `draftTableToCreateRequest` are
 * the two boundary mappers to and from `AddTableDialog` / the Launch
 * sequence.
 *
 * Single source of geometry: CANVAS_WIDTH / CANVAS_HEIGHT / GRID_SIZE /
 * SHAPE_DEFAULTS come from ./floor-plan-geometry.js — never hardcoded here.
 *
 * No React, no Konva, no network.
 */

import type {
  FloorPlan,
  Table,
  CreateTableRequest,
  FloorPlanLayout,
  TableShapeMetadata,
  WallLayout,
} from "@mbe/types";
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  GRID_SIZE,
  SHAPE_DEFAULTS,
} from "../floor-plan/floor-plan-geometry.js";
import type {
  RoomSizeId,
  RoomTemplateId,
  RoomTemplateSection,
} from "../floor-plan/room-templates.js";

export type DraftTableShape = TableShapeMetadata["shape"];

export interface DraftTable {
  /** Draft-only stable identifier. NEVER sent to the server. */
  localId: string;
  name: string;
  capacity: number;
  minCovers: number;
  shape: DraftTableShape;
  /** Centre coordinates. A table the manager adds is always a multiple of GRID_SIZE. */
  x: number;
  y: number;
  /**
   * Footprint, where a room template gave this table one of its own — a long
   * table is 140 wide against a shape default of 80. Absent on a table the
   * manager added, which keeps using SHAPE_DEFAULTS.
   */
  width?: number;
  height?: number;
  rotation?: number;
  /**
   * The room template's **local** section id, or null outside every zone.
   * Launch resolves it to the real row id.
   */
  sectionId?: string | null;
}

/** The footprint to draw and save for a draft table. */
export function draftTableSize(table: DraftTable): { width: number; height: number } {
  const defaults = SHAPE_DEFAULTS[table.shape];
  return { width: table.width ?? defaults.width, height: table.height ?? defaults.height };
}

export interface FloorPlanDraft {
  templateId: RoomTemplateId | null;
  /** The room size the template was built at. */
  sizeId: RoomSizeId;
  planName: string;
  tables: readonly DraftTable[];
  /** Named zones the room template places; local ids until Launch makes their rows. */
  sections: readonly RoomTemplateSection[];
  /** Perimeter and interior walls the room template places. */
  walls: readonly WallLayout[];
  /** The canvas the template was built for; the plan is saved at this size. */
  width: number;
  height: number;
  /** False once the manager has moved, added or removed anything. Gates the replace-confirm. */
  pristine: boolean;
}

/** Sentinel `venueId`/`floorPlanId` for `AddTableDialog` before Launch exists. Loud, not "", so a leak fails server-side. */
export const DRAFT_ID = "__draft__";

/** Verbatim match of the server's `Table @@unique([venueId, name])` rejection (services/reservations/src/routes/tables.ts). */
export const DUPLICATE_TABLE_NAME_MESSAGE = "A table with this name already exists";

export const EMPTY_FLOOR_PLAN_DRAFT: FloorPlanDraft = {
  templateId: null,
  sizeId: "cozy",
  planName: "",
  tables: [],
  sections: [],
  walls: [],
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  pristine: true,
};

/**
 * The `layoutJson` this draft's plan is created with — the room's canvas and
 * its walls. Section rectangles are absent: they are keyed by the section
 * row's server id, which Launch only learns once it has created the rows.
 */
export function draftLayoutJson(draft: FloorPlanDraft): FloorPlanLayout {
  return {
    width: draft.width,
    height: draft.height,
    gridSize: GRID_SIZE,
    showGrid: true,
    ...(draft.walls.length > 0 ? { walls: [...draft.walls] } : {}),
  };
}

// Fixed epoch for projected `createdAt`/`updatedAt` — a projection recomputed
// on every render must not produce a new value (e.g. `new Date()`) each time.
const DRAFT_TIMESTAMP = new Date(0).toISOString();

/**
 * Render-time projection of the draft's tables into the `Table[]` shape
 * `FloorPlanCanvas` requires. Recomputed on every call; never stored.
 */
export function draftToCanvasTables(draft: FloorPlanDraft): Table[] {
  return draft.tables.map((table) => {
    const shapeMetadata: TableShapeMetadata = {
      shape: table.shape,
      x: table.x,
      y: table.y,
      ...draftTableSize(table),
      ...(table.rotation === undefined ? {} : { rotation: table.rotation }),
    };

    return {
      id: table.localId,
      name: table.name,
      tableNumber: null,
      capacity: table.capacity,
      minCovers: table.minCovers,
      maxCovers: null,
      location: null,
      isActive: true,
      priority: 0,
      status: "AVAILABLE",
      venueId: null,
      floorPlanId: null,
      sectionId: table.sectionId ?? null,
      shapeMetadata,
      createdAt: DRAFT_TIMESTAMP,
      updatedAt: DRAFT_TIMESTAMP,
    };
  });
}

/**
 * Render-time projection of the draft into the `FloorPlan` shape
 * `FloorPlanCanvas` requires. FloorPlanCanvas reads only `name`/`isActive`;
 * the rest is a stable, server-shaped placeholder.
 */
export function draftToCanvasFloorPlan(draft: FloorPlanDraft): FloorPlan {
  return {
    id: DRAFT_ID,
    venueId: DRAFT_ID,
    name: draft.planName,
    isActive: false,
    layoutJson: draftLayoutJson(draft),
    createdAt: DRAFT_TIMESTAMP,
    updatedAt: DRAFT_TIMESTAMP,
  };
}

/**
 * Maps what `AddTableDialog` hands back into a draft table. `request.venueId`
 * and `request.floorPlanId` (the DRAFT_ID sentinel) are discarded — the
 * draft has no server identity yet.
 */
export function draftTableFromCreateRequest(
  request: CreateTableRequest,
  localId: string
): DraftTable {
  const shapeMetadata = request.shapeMetadata;
  // Invariant: AddTableDialog always populates shapeMetadata (shape/x/y are
  // required for a table to render on the canvas at all).
  if (!shapeMetadata) {
    throw new Error("draftTableFromCreateRequest: request.shapeMetadata is required");
  }

  return {
    localId,
    name: request.name,
    capacity: request.capacity,
    minCovers: request.minCovers ?? 1,
    shape: shapeMetadata.shape,
    x: shapeMetadata.x,
    y: shapeMetadata.y,
  };
}

/**
 * Maps a draft table to what the Launch sequence posts. `localId` never
 * appears in the result.
 */
export function draftTableToCreateRequest(
  table: DraftTable,
  venueId: string,
  floorPlanId: string
): CreateTableRequest {
  const dims = draftTableSize(table);

  return {
    name: table.name,
    capacity: table.capacity,
    minCovers: table.minCovers,
    venueId,
    floorPlanId,
    shapeMetadata: {
      shape: table.shape,
      x: table.x,
      y: table.y,
      width: dims.width,
      height: dims.height,
      ...(table.rotation === undefined ? {} : { rotation: table.rotation }),
    },
  };
}

/**
 * Exact match on the trimmed name — the in-draft mirror of the server's
 * `Table @@unique([venueId, name])` constraint. `ignoreLocalId` lets a
 * future edit-in-place skip colliding with itself.
 */
export function findDuplicateName(
  tables: readonly DraftTable[],
  name: string,
  ignoreLocalId?: string
): boolean {
  const trimmed = name.trim();
  return tables.some((table) => table.localId !== ignoreLocalId && table.name.trim() === trimmed);
}
