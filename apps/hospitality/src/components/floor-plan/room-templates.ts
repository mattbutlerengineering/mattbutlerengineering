/**
 * The seven room templates — Blank, Fine Dining, Casual Bistro, Bar & Lounge,
 * Café, Banquet Hall, Open Kitchen — each a pure builder from a canvas size to
 * the tables, sections and walls that fill it.
 *
 * Ported from eat-sheet (`docs/reference/eat-sheet/src/shared/templates/floor-plan.ts`,
 * issue #7256). Four deliberate differences from that source:
 *
 *  1. **Ids are derived, not minted.** The source calls `nanoid()` per object.
 *     This port has no such dependency and derives every id from the template
 *     and the object's own name, so a builder is a pure function of `(w, h)` —
 *     which is the only thing that makes 28 template/size combinations
 *     assertable, and keeps wall ids stable across a reload or a clone.
 *  2. **Coordinates are centres.** The source stores a table's top-left (that
 *     is how its preview positions one); this app's Konva canvas puts the group
 *     origin at the table centre (`FurnitureArt` draws from `-width / 2`). The
 *     builders keep the source's footprint and convert, so the layout is
 *     identical on screen.
 *  3. **`Blank` is entirely empty.** The source gives it perimeter walls; here
 *     it must reproduce today's new-floor-plan behaviour exactly, so an
 *     operator who wants a bare canvas gets one (#7256).
 *  4. **Café's window run stops above its doorway.** The source's fifth window
 *     spans 0.76h–0.88h while its door opens at 0.82h, so glass crossed the
 *     doorway at every size. The run is retimed to 0.03h–0.80h (five equal
 *     windows) — same intent, and the perimeter is now genuinely closed except
 *     at the door.
 *
 * A table's `sectionId` is derived, not hand-listed: a table belongs to the
 * first declared section whose rectangle contains its centre. These are *local*
 * ids — `apply-room-template.ts` swaps them for the server's row ids.
 *
 * No React, no Konva, no network.
 */

import type { WallLayout } from "@mbe/types";
import { CANVAS_WIDTH, CANVAS_HEIGHT, type TableShapeName } from "./floor-plan-geometry.js";

export type RoomTemplateId =
  | "blank"
  | "fine-dining"
  | "casual-bistro"
  | "bar-lounge"
  | "cafe"
  | "banquet-hall"
  | "open-kitchen";

export type RoomSizeId = "cozy" | "standard" | "spacious" | "grand";

export interface RoomSize {
  readonly id: RoomSizeId;
  readonly width: number;
  readonly height: number;
}

/** Cozy is the canvas default, so picking it changes nothing about today's plan. */
export const ROOM_SIZES: readonly RoomSize[] = [
  { id: "cozy", width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
  { id: "standard", width: 1200, height: 800 },
  { id: "spacious", width: 1600, height: 1000 },
  { id: "grand", width: 2000, height: 1200 },
] as const;

export interface RoomTemplateTable {
  readonly id: string;
  readonly name: string;
  readonly shape: TableShapeName;
  readonly capacity: number;
  readonly minCovers: number;
  /** Centre of the table, in canvas units — the origin Konva rotates about. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
  /** Local section id, or null when the table sits outside every zone. */
  readonly sectionId: string | null;
}

export interface RoomTemplateSection {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoomLayout {
  readonly width: number;
  readonly height: number;
  readonly tables: readonly RoomTemplateTable[];
  readonly sections: readonly RoomTemplateSection[];
  readonly walls: readonly WallLayout[];
}

export interface RoomTemplate {
  readonly id: RoomTemplateId;
  /** The plan's name once created. Saved data, so it stays en-US in every locale. */
  readonly planName: string;
  /** Width of the one doorway this template leaves in its perimeter; null for Blank. */
  readonly doorWidth: number | null;
  readonly build: (width: number, height: number) => RoomLayout;
}

/* ── Specs: what a template declares, before ids are derived ──────── */

interface TableSpec {
  readonly name: string;
  readonly shape: TableShapeName;
  readonly capacity: number;
  readonly minCovers: number;
  /** Top-left of the unrotated footprint, matching the ported source's space. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly rotation: number;
}

interface SectionSpec {
  readonly name: string;
  readonly color: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type WallSpec = Omit<WallLayout, "id">;

interface LayoutSpec {
  readonly tables: readonly TableSpec[];
  readonly sections: readonly SectionSpec[];
  readonly walls: readonly WallSpec[];
}

/* ── Wall helpers ─────────────────────────────────────────────────── */

const PERIMETER_THICKNESS = 6;
const WINDOW_THICKNESS = 4;
const COUNTER_THICKNESS = 8;

type DoorSide = "bottom" | "left";

/** The four perimeter runs, with the named side split open for a doorway. */
function perimeterWithDoor(
  w: number,
  h: number,
  side: DoorSide,
  position: number,
  gap: number
): WallSpec[] {
  const t = PERIMETER_THICKNESS;
  const p = Math.round(position);

  if (side === "bottom") {
    return [
      { x1: 0, y1: 0, x2: w, y2: 0, thickness: t },
      { x1: w, y1: 0, x2: w, y2: h, thickness: t },
      { x1: 0, y1: h, x2: p, y2: h, thickness: t },
      { x1: p + gap, y1: h, x2: w, y2: h, thickness: t },
      { x1: 0, y1: h, x2: 0, y2: 0, thickness: t },
    ];
  }

  return [
    { x1: 0, y1: 0, x2: w, y2: 0, thickness: t },
    { x1: w, y1: 0, x2: w, y2: h, thickness: t },
    { x1: w, y1: h, x2: 0, y2: h, thickness: t },
    { x1: 0, y1: 0, x2: 0, y2: p, thickness: t },
    { x1: 0, y1: p + gap, x2: 0, y2: h, thickness: t },
  ];
}

/** An interior wall or counter. */
const wall = (x1: number, y1: number, x2: number, y2: number, thickness = PERIMETER_THICKNESS) =>
  ({
    x1: Math.round(x1),
    y1: Math.round(y1),
    x2: Math.round(x2),
    y2: Math.round(y2),
    thickness,
  }) satisfies WallSpec;

/** A pane of glass in the left wall, between two fractions of the height. */
const windowPane = (h: number, from: number, to: number) =>
  ({
    x1: 0,
    y1: Math.round(h * from),
    x2: 0,
    y2: Math.round(h * to),
    thickness: WINDOW_THICKNESS,
    wallType: "window",
  }) satisfies WallSpec;

/* ── Table helpers — `left`/`top` mirror the ported source's coords ── */

/** A round table of `diameter`, seating `seats`. */
const circle = (left: number, top: number, seats: number, name: string, d = 48): TableSpec => ({
  name,
  shape: "circle",
  capacity: seats,
  minCovers: Math.max(1, seats - 1),
  left: Math.round(left),
  top: Math.round(top),
  width: d,
  height: d,
  rotation: 0,
});

/** A square table of side `s`; `rotation` 45 is the diamond orientation. */
const square = (
  left: number,
  top: number,
  seats: number,
  name: string,
  s = 56,
  rotation = 0
): TableSpec => ({
  name,
  shape: "square",
  capacity: seats,
  minCovers: Math.max(1, seats - 1),
  left: Math.round(left),
  top: Math.round(top),
  width: s,
  height: s,
  rotation,
});

/** A long table or booth. */
const long = (
  left: number,
  top: number,
  seats: number,
  name: string,
  w = 100,
  h = 48
): TableSpec => ({
  name,
  shape: "rectangle",
  capacity: seats,
  minCovers: Math.max(2, seats - 2),
  left: Math.round(left),
  top: Math.round(top),
  width: w,
  height: h,
  rotation: 0,
});

const section = (
  name: string,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number
): SectionSpec => ({
  name,
  color,
  x: Math.round(x),
  y: Math.round(y),
  width: Math.round(width),
  height: Math.round(height),
});

/* ── Section palette ──────────────────────────────────────────────── */

const ZONE = {
  dining: "#8b7355",
  private: "#6b5740",
  bar: "#c49a2a",
  lounge: "#6b8a6b",
  window: "#5a8db5",
  kitchen: "#e07050",
} as const;

/* ── Deriving ids and section membership ──────────────────────────── */

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function containingSection(
  sections: readonly RoomTemplateSection[],
  x: number,
  y: number
): string | null {
  const found = sections.find(
    (zone) => x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height
  );
  return found ? found.id : null;
}

/** Turns a template's declared spec into the layout, deriving every id. */
function toLayout(
  templateId: RoomTemplateId,
  width: number,
  height: number,
  spec: LayoutSpec
): RoomLayout {
  const sections: readonly RoomTemplateSection[] = spec.sections.map((zone) => ({
    ...zone,
    id: `${templateId}-${slug(zone.name)}`,
  }));

  const tables: readonly RoomTemplateTable[] = spec.tables.map((table) => {
    const x = table.left + table.width / 2;
    const y = table.top + table.height / 2;
    return {
      id: `${templateId}-${slug(table.name)}`,
      name: table.name,
      shape: table.shape,
      capacity: table.capacity,
      minCovers: table.minCovers,
      x,
      y,
      width: table.width,
      height: table.height,
      rotation: table.rotation,
      sectionId: containingSection(sections, x, y),
    };
  });

  const walls: readonly WallLayout[] = spec.walls.map((segment, index) => ({
    ...segment,
    id: `${templateId}-wall-${index + 1}`,
  }));

  return { width, height, tables, sections, walls };
}

/* ── The templates ────────────────────────────────────────────────── */

const BLANK: RoomTemplate = {
  id: "blank",
  planName: "Main Floor",
  doorWidth: null,
  build: (width, height) => ({ width, height, tables: [], sections: [], walls: [] }),
};

const FINE_DINING: RoomTemplate = {
  id: "fine-dining",
  planName: "Dining Room",
  doorWidth: 80,
  build: (w, h) => {
    const divider = w * 0.6;
    return toLayout("fine-dining", w, h, {
      tables: [
        // Window two-tops down the glass wall.
        circle(w * 0.04, h * 0.08, 2, "W1", 36),
        circle(w * 0.04, h * 0.24, 2, "W2", 36),
        circle(w * 0.04, h * 0.4, 2, "W3", 36),
        circle(w * 0.04, h * 0.56, 2, "W4", 36),
        // Main dining — staggered four- and six-tops.
        circle(w * 0.16, h * 0.1, 4, "T1", 52),
        circle(w * 0.32, h * 0.1, 4, "T2", 52),
        circle(w * 0.48, h * 0.1, 4, "T3", 52),
        circle(w * 0.24, h * 0.3, 6, "T4", 64),
        circle(w * 0.42, h * 0.3, 6, "T5", 64),
        circle(w * 0.16, h * 0.5, 4, "T6", 52),
        circle(w * 0.32, h * 0.5, 4, "T7", 52),
        circle(w * 0.48, h * 0.5, 4, "T8", 52),
        circle(w * 0.24, h * 0.7, 4, "T9", 52),
        circle(w * 0.42, h * 0.7, 4, "T10", 52),
        circle(w * 0.16, h * 0.85, 4, "T11", 52),
        // Private dining room behind the divider.
        circle(w * 0.72, h * 0.12, 8, "P1", 84),
        long(w * 0.68, h * 0.35, 10, "P2", 140, 56),
        circle(w * 0.68, h * 0.58, 4, "P3", 52),
        circle(w * 0.84, h * 0.58, 4, "P4", 52),
        circle(w * 0.76, h * 0.78, 6, "P5", 64),
      ],
      sections: [
        section("Main Dining", ZONE.dining, w * 0.02, h * 0.03, divider - w * 0.04, h * 0.92),
        section("Private", ZONE.private, divider + w * 0.02, h * 0.03, w * 0.36, h * 0.92),
      ],
      walls: [
        ...perimeterWithDoor(w, h, "bottom", w * 0.35, 80),
        wall(divider, 0, divider, h * 0.75),
        wall(divider, h * 0.75, w, h * 0.75),
        windowPane(h, 0.05, 0.2),
        windowPane(h, 0.25, 0.4),
        windowPane(h, 0.45, 0.6),
      ],
    });
  },
};

const CASUAL_BISTRO: RoomTemplate = {
  id: "casual-bistro",
  planName: "Bistro Floor",
  doorWidth: 70,
  build: (w, h) => {
    const boothX = w * 0.68;
    return toLayout("casual-bistro", w, h, {
      tables: [
        circle(w * 0.04, h * 0.1, 2, "W1", 36),
        circle(w * 0.04, h * 0.28, 2, "W2", 36),
        circle(w * 0.04, h * 0.46, 2, "W3", 36),
        circle(w * 0.04, h * 0.64, 2, "W4", 36),
        // Diamond four-tops, three staggered rows.
        square(w * 0.18, h * 0.08, 4, "T1", 52, 45),
        square(w * 0.34, h * 0.08, 4, "T2", 52, 45),
        square(w * 0.5, h * 0.08, 4, "T3", 52, 45),
        square(w * 0.26, h * 0.26, 4, "T4", 52, 45),
        square(w * 0.42, h * 0.26, 4, "T5", 52, 45),
        square(w * 0.18, h * 0.44, 4, "T6", 52, 45),
        square(w * 0.34, h * 0.44, 4, "T7", 52, 45),
        square(w * 0.5, h * 0.44, 4, "T8", 52, 45),
        long(w * 0.2, h * 0.66, 10, "C1", 200, 60),
        circle(w * 0.2, h * 0.84, 4, "T9", 52),
        circle(w * 0.4, h * 0.84, 4, "T10", 52),
        // Booth run behind the divider.
        long(boothX, h * 0.06, 4, "B1", 100, 48),
        long(boothX, h * 0.2, 4, "B2", 100, 48),
        long(boothX, h * 0.34, 4, "B3", 100, 48),
        long(boothX, h * 0.48, 4, "B4", 100, 48),
        long(boothX, h * 0.62, 4, "B5", 100, 48),
        long(boothX, h * 0.76, 4, "B6", 100, 48),
      ],
      sections: [
        section("Dining", ZONE.dining, w * 0.1, h * 0.03, w * 0.52, h * 0.56),
        section("Booths", ZONE.private, boothX - w * 0.03, h * 0.02, w * 0.33, h * 0.88),
      ],
      walls: [
        ...perimeterWithDoor(w, h, "bottom", w * 0.35, 70),
        wall(boothX - w * 0.04, 0, boothX - w * 0.04, h * 0.9),
        windowPane(h, 0.05, 0.22),
        windowPane(h, 0.28, 0.45),
        windowPane(h, 0.52, 0.68),
      ],
    });
  },
};

const BAR_LOUNGE: RoomTemplate = {
  id: "bar-lounge",
  planName: "Bar Floor",
  doorWidth: 80,
  build: (w, h) => {
    const barY = h * 0.18;
    return toLayout("bar-lounge", w, h, {
      tables: [
        // Stools along the bar.
        circle(w * 0.18, h * 0.05, 1, "B1", 32),
        circle(w * 0.26, h * 0.05, 1, "B2", 32),
        circle(w * 0.34, h * 0.05, 1, "B3", 32),
        circle(w * 0.42, h * 0.05, 1, "B4", 32),
        circle(w * 0.5, h * 0.05, 1, "B5", 32),
        circle(w * 0.58, h * 0.05, 1, "B6", 32),
        circle(w * 0.66, h * 0.05, 1, "B7", 32),
        circle(w * 0.74, h * 0.05, 1, "B8", 32),
        circle(w * 0.82, h * 0.05, 1, "B9", 32),
        // Cocktail rounds.
        circle(w * 0.08, h * 0.32, 3, "T1", 44),
        circle(w * 0.22, h * 0.32, 3, "T2", 44),
        circle(w * 0.36, h * 0.32, 3, "T3", 44),
        circle(w * 0.5, h * 0.32, 3, "T4", 44),
        circle(w * 0.15, h * 0.48, 3, "T5", 44),
        circle(w * 0.29, h * 0.48, 3, "T6", 44),
        circle(w * 0.43, h * 0.48, 3, "T7", 44),
        long(w * 0.72, h * 0.3, 6, "T8", 110, 48),
        long(w * 0.72, h * 0.46, 6, "T9", 110, 48),
        long(w * 0.72, h * 0.62, 6, "T10", 110, 48),
        // Lounge.
        square(w * 0.08, h * 0.72, 4, "L1", 56),
        square(w * 0.22, h * 0.72, 4, "L2", 56),
        square(w * 0.36, h * 0.72, 4, "L3", 56),
        circle(w * 0.52, h * 0.72, 6, "L4", 64),
        square(w * 0.08, h * 0.88, 4, "L5", 56),
        square(w * 0.22, h * 0.88, 4, "L6", 56),
      ],
      sections: [
        section("Bar", ZONE.bar, w * 0.14, h * 0.01, w * 0.74, barY - h * 0.01),
        section("Lounge", ZONE.lounge, w * 0.03, h * 0.67, w * 0.6, h * 0.3),
      ],
      walls: [
        ...perimeterWithDoor(w, h, "bottom", w * 0.04, 80),
        wall(w * 0.15, barY, w * 0.88, barY, COUNTER_THICKNESS),
        wall(w * 0.13, 0, w * 0.13, barY),
        wall(w * 0.9, 0, w * 0.9, barY),
        wall(w * 0.67, h * 0.25, w * 0.67, h * 0.78),
      ],
    });
  },
};

const CAFE: RoomTemplate = {
  id: "cafe",
  planName: "Café Floor",
  doorWidth: 60,
  build: (w, h) => {
    const counterX = w * 0.55;
    return toLayout("cafe", w, h, {
      tables: [
        circle(w * 0.05, h * 0.08, 2, "W1", 36),
        circle(w * 0.05, h * 0.22, 2, "W2", 36),
        circle(w * 0.05, h * 0.36, 2, "W3", 36),
        circle(w * 0.05, h * 0.5, 2, "W4", 36),
        circle(w * 0.05, h * 0.64, 2, "W5", 36),
        circle(w * 0.05, h * 0.78, 2, "W6", 36),
        square(w * 0.2, h * 0.08, 4, "T1", 52),
        square(w * 0.36, h * 0.08, 4, "T2", 52),
        circle(w * 0.2, h * 0.28, 4, "T3", 48),
        circle(w * 0.36, h * 0.28, 4, "T4", 48),
        square(w * 0.2, h * 0.48, 4, "T5", 52),
        square(w * 0.36, h * 0.48, 4, "T6", 52),
        circle(w * 0.28, h * 0.68, 6, "T7", 64),
        circle(w * 0.2, h * 0.86, 4, "T8", 48),
        circle(w * 0.38, h * 0.86, 4, "T9", 48),
        // Counter stools.
        circle(counterX - 30, h * 0.28, 1, "C1", 32),
        circle(counterX - 30, h * 0.38, 1, "C2", 32),
        circle(counterX - 30, h * 0.48, 1, "C3", 32),
        circle(counterX - 30, h * 0.58, 1, "C4", 32),
        circle(counterX - 30, h * 0.68, 1, "C5", 32),
        long(w * 0.62, h * 0.72, 8, "C6", 180, 52),
        long(w * 0.62, h * 0.86, 6, "C7", 140, 48),
      ],
      sections: [
        section("Window Seats", ZONE.window, w * 0.01, h * 0.03, w * 0.12, h * 0.88),
        section("Kitchen", ZONE.kitchen, w * 0.58, h * 0.02, w * 0.4, h * 0.3),
      ],
      walls: [
        ...perimeterWithDoor(w, h, "left", h * 0.82, 60),
        wall(counterX, h * 0.2, counterX, h * 0.78),
        wall(w * 0.56, 0, w * 0.56, h * 0.35),
        wall(w * 0.56, h * 0.35, w, h * 0.35),
        // Retimed from the source's 0.04–0.88 run so no pane crosses the door
        // at 0.82h — see this module's header, deviation 4.
        windowPane(h, 0.03, 0.16),
        windowPane(h, 0.19, 0.32),
        windowPane(h, 0.35, 0.48),
        windowPane(h, 0.51, 0.64),
        windowPane(h, 0.67, 0.8),
      ],
    });
  },
};

const BANQUET_HALL: RoomTemplate = {
  id: "banquet-hall",
  planName: "Banquet Hall",
  doorWidth: 100,
  build: (w, h) => {
    const stageY = h * 0.78;
    return toLayout("banquet-hall", w, h, {
      tables: [
        // Round eight-tops, a 4-3-4 staggered grid.
        circle(w * 0.08, h * 0.06, 8, "T1", 80),
        circle(w * 0.28, h * 0.06, 8, "T2", 80),
        circle(w * 0.48, h * 0.06, 8, "T3", 80),
        circle(w * 0.68, h * 0.06, 8, "T4", 80),
        circle(w * 0.18, h * 0.26, 8, "T5", 80),
        circle(w * 0.38, h * 0.26, 8, "T6", 80),
        circle(w * 0.58, h * 0.26, 8, "T7", 80),
        circle(w * 0.08, h * 0.46, 8, "T8", 80),
        circle(w * 0.28, h * 0.46, 8, "T9", 80),
        circle(w * 0.48, h * 0.46, 8, "T10", 80),
        circle(w * 0.68, h * 0.46, 8, "T11", 80),
        // Six-tops along the far wall.
        circle(w * 0.88, h * 0.1, 6, "T12", 60),
        circle(w * 0.88, h * 0.3, 6, "T13", 60),
        circle(w * 0.88, h * 0.5, 6, "T14", 60),
        long(w * 0.2, stageY + h * 0.04, 16, "HEAD", Math.min(500, w * 0.5), 56),
      ],
      sections: [
        section("Seating", ZONE.dining, w * 0.03, h * 0.02, w * 0.82, stageY - h * 0.06),
        section("Stage", ZONE.bar, w * 0.15, stageY, w * 0.6, h * 0.18),
      ],
      walls: [...perimeterWithDoor(w, h, "bottom", w * 0.06, 100), wall(0, stageY, w, stageY)],
    });
  },
};

const OPEN_KITCHEN: RoomTemplate = {
  id: "open-kitchen",
  planName: "Open Kitchen",
  doorWidth: 60,
  build: (w, h) => {
    const kitchenX = w * 0.5;
    const counterY = h * 0.35;
    return toLayout("open-kitchen", w, h, {
      tables: [
        // Chef's counter stools.
        circle(kitchenX + w * 0.04, counterY + 20, 1, "K1", 32),
        circle(kitchenX + w * 0.12, counterY + 20, 1, "K2", 32),
        circle(kitchenX + w * 0.2, counterY + 20, 1, "K3", 32),
        circle(kitchenX + w * 0.28, counterY + 20, 1, "K4", 32),
        circle(kitchenX + w * 0.36, counterY + 20, 1, "K5", 32),
        circle(kitchenX + w * 0.44, counterY + 20, 1, "K6", 32),
        square(w * 0.06, h * 0.06, 4, "T1", 52, 45),
        square(w * 0.22, h * 0.06, 4, "T2", 52, 45),
        circle(w * 0.38, h * 0.06, 6, "T3", 64),
        square(w * 0.14, h * 0.26, 4, "T4", 52, 45),
        circle(w * 0.3, h * 0.26, 4, "T5", 48),
        long(w * 0.06, h * 0.5, 6, "T6", 110, 48),
        long(w * 0.26, h * 0.5, 6, "T7", 110, 48),
        circle(w * 0.06, h * 0.68, 4, "T8", 52),
        circle(w * 0.22, h * 0.68, 4, "T9", 52),
        square(w * 0.38, h * 0.65, 4, "T10", 52, 45),
        circle(w * 0.06, h * 0.84, 4, "T11", 48),
        circle(w * 0.22, h * 0.84, 4, "T12", 48),
        long(w * 0.36, h * 0.84, 6, "T13", 110, 48),
        // Bar.
        circle(w * 0.62, h * 0.56, 2, "B1", 40),
        circle(w * 0.76, h * 0.56, 2, "B2", 40),
        circle(w * 0.62, h * 0.7, 2, "B3", 40),
        circle(w * 0.76, h * 0.7, 2, "B4", 40),
        circle(w * 0.69, h * 0.84, 4, "B5", 52),
      ],
      sections: [
        section("Dining", ZONE.dining, w * 0.02, h * 0.02, kitchenX - w * 0.04, h * 0.94),
        section(
          "Kitchen",
          ZONE.kitchen,
          kitchenX + w * 0.02,
          h * 0.02,
          w * 0.46,
          counterY - h * 0.04
        ),
        section("Bar", ZONE.bar, w * 0.56, h * 0.5, w * 0.4, h * 0.46),
      ],
      walls: [
        ...perimeterWithDoor(w, h, "left", h * 0.85, 60),
        wall(kitchenX, 0, kitchenX, counterY),
        wall(kitchenX, counterY, w, counterY),
        wall(kitchenX + 10, counterY + 10, w * 0.96, counterY + 10, COUNTER_THICKNESS),
        windowPane(h, 0.04, 0.22),
        windowPane(h, 0.3, 0.48),
      ],
    });
  },
};

export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  BLANK,
  FINE_DINING,
  CASUAL_BISTRO,
  BAR_LOUNGE,
  CAFE,
  BANQUET_HALL,
  OPEN_KITCHEN,
] as const;

/** Looks up a template by id. `RoomTemplateId` is closed, so every id resolves. */
export function roomTemplateById(id: RoomTemplateId): RoomTemplate {
  const found = ROOM_TEMPLATES.find((template) => template.id === id);
  if (!found) throw new Error(`roomTemplateById: no template registered for id "${id}"`);
  return found;
}

/** Looks up a size by id. `RoomSizeId` is closed, so every id resolves. */
export function roomSizeById(id: RoomSizeId): RoomSize {
  const found = ROOM_SIZES.find((size) => size.id === id);
  if (!found) throw new Error(`roomSizeById: no size registered for id "${id}"`);
  return found;
}
