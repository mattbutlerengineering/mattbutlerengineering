/**
 * The room templates the new-venue wizard's floor-plan step offers, and the
 * projection of one into the `FloorPlanDraft` that step edits.
 *
 * This used to hold five layout templates of its own, each a grid of identical
 * tables ("zones") on a fixed 800×600 canvas with no walls and no sections.
 * #7256 replaced them with the seven ported room templates in
 * `../floor-plan/room-templates.ts`, which answer the question the wizard was
 * really asking — *what shape is your room* — with a perimeter, a doorway,
 * named zones and a table mix, at any of four sizes. This module is now the
 * thin adapter between those builders and the draft; the geometry lives there.
 *
 * No React, no Konva, no network.
 */

import {
  ROOM_TEMPLATES,
  roomSizeById,
  roomTemplateById,
  type RoomLayout,
  type RoomSizeId,
  type RoomTemplate,
  type RoomTemplateId,
} from "../floor-plan/room-templates.js";
import { draftTableSize, type DraftTable, type FloorPlanDraft } from "./floor-plan-draft.js";

/** The wizard's template ids are the room-template ids. */
export type TemplateId = RoomTemplateId;

/** Picker order, Blank first. */
export const FLOOR_PLAN_TEMPLATES: readonly RoomTemplate[] = ROOM_TEMPLATES;

/** Looks up a template by id. `TemplateId` is a closed union, so every id resolves. */
export function templateById(id: TemplateId): RoomTemplate {
  return roomTemplateById(id);
}

/**
 * The layout a draft is currently showing — **the operator's draft**, not a
 * rebuild of its template.
 *
 * This deliberately projects `draft.tables` rather than calling
 * `template.build(...)` again. The draft is editable from step 5 (drag a table,
 * remove one, add one), so rebuilding would show the pristine template: the
 * preview would still include a table the operator deleted, and still draw a
 * moved one at its original position, while the table count rendered beside it
 * — derived from `draft.tables` — disagreed. The canvas and walls still come
 * from the draft's own stored room, so an un-edited draft previews exactly as
 * before.
 */
export function layoutForDraft(draft: FloorPlanDraft): RoomLayout | null {
  if (draft.templateId === null) return null;
  const size = roomSizeById(draft.sizeId);
  return {
    width: draft.width || size.width,
    height: draft.height || size.height,
    tables: draft.tables.map(previewTable),
    sections: draft.sections,
    walls: draft.walls,
  };
}

/**
 * One draft table as the preview's table. A table the operator added carries no
 * footprint of its own, so it falls back to its shape's default — the same
 * resolution `FloorPlanCanvas` and `draftTableSize` use.
 */
function previewTable(table: DraftTable): RoomLayout["tables"][number] {
  const { width, height } = draftTableSize(table);
  return {
    id: table.localId,
    name: table.name,
    shape: table.shape,
    capacity: table.capacity,
    minCovers: table.minCovers,
    x: table.x,
    y: table.y,
    width,
    height,
    rotation: table.rotation ?? 0,
    sectionId: table.sectionId ?? null,
  };
}

/** One room-template table as the draft table the wizard's canvas edits. */
function draftTableFor(table: RoomLayout["tables"][number]): DraftTable {
  return {
    localId: table.name,
    name: table.name,
    capacity: table.capacity,
    minCovers: table.minCovers,
    shape: table.shape,
    x: table.x,
    y: table.y,
    width: table.width,
    height: table.height,
    rotation: table.rotation,
    sectionId: table.sectionId,
  };
}

/**
 * A fresh, pristine draft holding everything the chosen room places. Pure —
 * the builders are, and nothing here is cached — so re-picking the same room
 * at the same size always yields the same draft.
 */
export function draftFromTemplate(templateId: TemplateId, sizeId: RoomSizeId): FloorPlanDraft {
  const template = roomTemplateById(templateId);
  const size = roomSizeById(sizeId);
  const layout = template.build(size.width, size.height);

  return {
    templateId,
    sizeId,
    planName: template.planName,
    tables: layout.tables.map(draftTableFor),
    sections: layout.sections,
    walls: layout.walls,
    width: layout.width,
    height: layout.height,
    pristine: true,
  };
}
