/**
 * Measuring a built room layout: a table's footprint on the canvas, and the
 * openings its walls leave in the perimeter.
 *
 * Split from `room-templates.ts` (#7256), which builds layouts rather than
 * measures them. These two functions are what make the invariants the
 * templates must hold — every table in bounds, no two overlapping, the
 * perimeter closed except at the doorway — assertable over all 28
 * template/size combinations, and they are derived purely from a layout, so
 * nothing a template asserts about itself is taken on trust.
 *
 * No React, no Konva, no network.
 */

import type { WallLayout } from "@mbe/types";
import type { RoomLayout } from "./room-templates.js";

/** Rotation-aware bounding box of a table, in canvas units. */
export function tableBounds(table: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}): { left: number; top: number; right: number; bottom: number } {
  const radians = (table.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const halfWidth = (table.width * cos + table.height * sin) / 2;
  const halfHeight = (table.width * sin + table.height * cos) / 2;

  return {
    left: table.x - halfWidth,
    top: table.y - halfHeight,
    right: table.x + halfWidth,
    bottom: table.y + halfHeight,
  };
}

/* ── Perimeter closure ────────────────────────────────────────────── */

export type PerimeterSide = "top" | "right" | "bottom" | "left";

export interface PerimeterGap {
  readonly side: PerimeterSide;
  readonly from: number;
  readonly to: number;
}

interface SideDefinition {
  readonly side: PerimeterSide;
  /** True when both of a wall's endpoints lie on this side's line. */
  readonly onSide: (segment: WallLayout) => boolean;
  /** The segment's extent along the side, as [low, high]. */
  readonly span: (segment: WallLayout) => readonly [number, number];
  readonly length: number;
}

function sideDefinitions(layout: RoomLayout): readonly SideDefinition[] {
  const horizontal = (segment: WallLayout) =>
    [Math.min(segment.x1, segment.x2), Math.max(segment.x1, segment.x2)] as const;
  const vertical = (segment: WallLayout) =>
    [Math.min(segment.y1, segment.y2), Math.max(segment.y1, segment.y2)] as const;

  return [
    {
      side: "top",
      onSide: (s) => s.y1 === 0 && s.y2 === 0,
      span: horizontal,
      length: layout.width,
    },
    {
      side: "right",
      onSide: (s) => s.x1 === layout.width && s.x2 === layout.width,
      span: vertical,
      length: layout.height,
    },
    {
      side: "bottom",
      onSide: (s) => s.y1 === layout.height && s.y2 === layout.height,
      span: horizontal,
      length: layout.width,
    },
    {
      side: "left",
      onSide: (s) => s.x1 === 0 && s.x2 === 0,
      span: vertical,
      length: layout.height,
    },
  ];
}

/** The spans of `[0, length]` a side's walls leave uncovered, merged and ordered. */
function gapsOnSide(definition: SideDefinition, layout: RoomLayout): PerimeterGap[] {
  const covered = layout.walls
    .filter(definition.onSide)
    .map(definition.span)
    .filter(([low, high]) => high > low)
    .sort((a, b) => a[0] - b[0]);

  const gaps: PerimeterGap[] = [];
  let reached = 0;
  for (const [low, high] of covered) {
    if (low > reached) gaps.push({ side: definition.side, from: reached, to: low });
    reached = Math.max(reached, high);
  }
  if (reached < definition.length) {
    gaps.push({ side: definition.side, from: reached, to: definition.length });
  }
  return gaps;
}

/**
 * Every opening the layout's walls leave in the canvas perimeter, in
 * top/right/bottom/left order. A closed room with one door returns exactly one
 * gap — the doorway; a layout that builds no walls at all (Blank) returns one
 * full-length gap per side. Purely derived from the walls, with no special
 * case, so "closed except at the door" is a property this measures rather than
 * one the templates assert about themselves.
 */
export function perimeterGaps(layout: RoomLayout): readonly PerimeterGap[] {
  return sideDefinitions(layout).flatMap((definition) => gapsOnSide(definition, layout));
}
