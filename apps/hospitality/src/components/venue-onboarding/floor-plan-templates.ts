/**
 * The five floor-plan layout templates offered by the picker (Restaurant,
 * Cafe, Bar, Patio, Blank), and the zone-based generator that expands each
 * one into the `DraftTable[]` the wizard's canvas step edits.
 *
 * A zone is a rectangular grid of identical tables. The generator walks a
 * template's zones and emits tables row-major, which is what makes the
 * template invariants (unique names, in-bounds, non-overlapping,
 * grid-aligned) true by construction instead of by a runtime guard.
 *
 * Single source of geometry: CANVAS_WIDTH / CANVAS_HEIGHT / GRID_SIZE /
 * SHAPE_DEFAULTS come from ../floor-plan/floor-plan-geometry.js — never
 * hardcoded here.
 *
 * No React, no Konva, no network.
 */

import type { DraftTable, DraftTableShape } from "./floor-plan-draft.js";

export type TemplateId = "restaurant" | "cafe" | "bar" | "patio" | "blank";

export interface Zone {
  prefix: string;
  shape: DraftTableShape;
  capacity: number;
  minCovers: number;
  origin: { x: number; y: number };
  cols: number;
  rows: number;
  /** Omitted when cols === 1. */
  pitchX?: number;
  /** Omitted when rows === 1. */
  pitchY?: number;
}

export interface FloorPlanTemplate {
  id: TemplateId;
  /** Picker card label. */
  name: string;
  /** The floor plan's name once created — fixed per template, not editable in the wizard. */
  planName: string;
  /** Card summary line, e.g. "14 tables · 48 seats". */
  summary: string;
  /** Card zone line, e.g. "4 window 2-tops · 6 four-tops · 2 round 6-tops · 2 bar seats". */
  zoneLine: string;
  zones: readonly Zone[];
}

/**
 * Expands one zone into its `DraftTable`s. The table at row r, column c is
 * named `${prefix}${r * cols + c + 1}` and centred at
 * `(origin.x + c * pitchX, origin.y + r * pitchY)` — pitchX/pitchY are only
 * read when cols/rows > 1, matching their "omitted when 1" contract.
 */
function tablesForZone(zone: Zone): DraftTable[] {
  return Array.from({ length: zone.rows * zone.cols }, (_, i) => {
    const r = Math.floor(i / zone.cols);
    const c = i % zone.cols;
    const name = `${zone.prefix}${i + 1}`;
    const x = zone.cols === 1 ? zone.origin.x : zone.origin.x + c * (zone.pitchX ?? 0);
    const y = zone.rows === 1 ? zone.origin.y : zone.origin.y + r * (zone.pitchY ?? 0);

    return {
      localId: name,
      name,
      capacity: zone.capacity,
      minCovers: zone.minCovers,
      shape: zone.shape,
      x,
      y,
    };
  });
}

/** Render-time expansion of a template's zones into tables. Never stored. */
export function tablesForTemplate(template: FloorPlanTemplate): DraftTable[] {
  return template.zones.flatMap(tablesForZone);
}

export const FLOOR_PLAN_TEMPLATES: readonly FloorPlanTemplate[] = [
  {
    id: "restaurant",
    name: "Restaurant",
    planName: "Main Dining Room",
    summary: "14 tables · 48 seats",
    zoneLine: "4 window 2-tops · 6 four-tops · 2 round 6-tops · 2 bar seats",
    zones: [
      {
        prefix: "W",
        shape: "square",
        capacity: 2,
        minCovers: 1,
        origin: { x: 100, y: 80 },
        cols: 4,
        rows: 1,
        pitchX: 120,
      },
      {
        prefix: "T",
        shape: "rectangle",
        capacity: 4,
        minCovers: 2,
        origin: { x: 120, y: 220 },
        cols: 3,
        rows: 2,
        pitchX: 160,
        pitchY: 140,
      },
      {
        prefix: "R",
        shape: "circle",
        capacity: 6,
        minCovers: 4,
        origin: { x: 660, y: 220 },
        cols: 1,
        rows: 2,
        pitchY: 140,
      },
      {
        prefix: "B",
        shape: "square",
        capacity: 2,
        minCovers: 1,
        origin: { x: 120, y: 500 },
        cols: 2,
        rows: 1,
        pitchX: 120,
      },
    ],
  },
  {
    id: "cafe",
    name: "Cafe",
    planName: "Main Floor",
    summary: "10 tables · 24 seats",
    zoneLine: "5 window 2-tops · 3 café rounds · 2 four-tops",
    zones: [
      {
        prefix: "W",
        shape: "square",
        capacity: 2,
        minCovers: 1,
        origin: { x: 100, y: 80 },
        cols: 5,
        rows: 1,
        pitchX: 120,
      },
      {
        prefix: "C",
        shape: "circle",
        capacity: 2,
        minCovers: 1,
        origin: { x: 140, y: 260 },
        cols: 3,
        rows: 1,
        pitchX: 140,
      },
      {
        prefix: "L",
        shape: "rectangle",
        capacity: 4,
        minCovers: 2,
        origin: { x: 200, y: 440 },
        cols: 2,
        rows: 1,
        pitchX: 120,
      },
    ],
  },
  {
    id: "bar",
    name: "Bar",
    planName: "Bar Floor",
    summary: "12 tables · 40 seats",
    zoneLine: "6 high-tops · 4 standing rounds · 2 booths",
    zones: [
      {
        prefix: "H",
        shape: "square",
        capacity: 2,
        minCovers: 1,
        origin: { x: 100, y: 80 },
        cols: 6,
        rows: 1,
        pitchX: 120,
      },
      {
        prefix: "S",
        shape: "circle",
        capacity: 4,
        minCovers: 2,
        origin: { x: 140, y: 260 },
        cols: 4,
        rows: 1,
        pitchX: 140,
      },
      {
        prefix: "B",
        shape: "rectangle",
        capacity: 6,
        minCovers: 3,
        origin: { x: 160, y: 440 },
        cols: 2,
        rows: 1,
        pitchX: 140,
      },
    ],
  },
  {
    id: "patio",
    name: "Patio",
    planName: "Patio",
    summary: "8 tables · 36 seats",
    zoneLine: "6 umbrella rounds · 2 long tables",
    zones: [
      {
        prefix: "P",
        shape: "circle",
        capacity: 4,
        minCovers: 2,
        origin: { x: 160, y: 140 },
        cols: 3,
        rows: 2,
        pitchX: 180,
        pitchY: 160,
      },
      {
        prefix: "L",
        shape: "rectangle",
        capacity: 6,
        minCovers: 3,
        origin: { x: 200, y: 460 },
        cols: 2,
        rows: 1,
        pitchX: 180,
      },
    ],
  },
  {
    id: "blank",
    name: "Blank",
    planName: "Main Floor",
    summary: "No tables",
    zoneLine: "Start empty — add tables yourself",
    zones: [],
  },
] as const;

/** Looks up a template by id. `TemplateId` is a closed union, so every id resolves. */
export function templateById(id: TemplateId): FloorPlanTemplate {
  const template = FLOOR_PLAN_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) {
    throw new Error(`templateById: no template registered for id "${id}"`);
  }
  return template;
}
