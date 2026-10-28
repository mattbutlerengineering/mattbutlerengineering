/**
 * Floor-plan furniture art, ported from the retired eat-sheet project.
 *
 * The design source is the hand-drawn SVG set committed alongside this file in
 * `./assets/` — `table-round.svg`, `table-square.svg`, `table-rect.svg` and
 * `chair.svg` are what these components reproduce. They are reproduced as
 * Konva primitives rather than loaded as images for two reasons:
 *
 *   1. The table surface has to carry the live status colour (see
 *      `table-status.ts`), and a raster/SVG image cannot be recoloured.
 *   2. `FloorPlanEditorPage` is a lazy chunk on a 3.7 kB brotli budget, and
 *      inlining the SVG markup would not fit.
 *
 * Tones and fixed dimensions live in `furniture-tokens.ts`.
 * `furniture-assets.test.ts` is the drift guard: it reads the committed SVGs
 * and fails if a tone in `FURNITURE_PALETTE` no longer appears in them.
 *
 * Geometry is expressed in each table's own coordinate space, centred on
 * (0, 0) — the same space `TableShape`'s draggable group uses — so strokes are
 * never distorted by a scaling transform.
 */

import { Circle, Group, Line, Path, Rect } from "react-konva";
import { SHAPE_DEFAULTS, type TableShapeName } from "./floor-plan-geometry.js";
import {
  CONTACT_SHADOW,
  FURNITURE_PALETTE,
  SEAT_NAME,
  SEAT_TONES,
  SHADOW_TONES,
  TABLE_CORNER_RADIUS,
  TABLE_SHADOW_NAME,
  TABLE_SURFACE_NAME,
  type FurnitureTheme,
} from "./furniture-tokens.js";
import { useFurnitureTheme } from "./furniture-theme.js";

/**
 * Soft contact shadow, drawn by the shape itself.
 *
 * Perf: the blur lives on the one node that casts it (the table's shadow node
 * and each chair frame), never on the table group, so a drag re-rasterises
 * blur only for nodes that move with the dragged table. The nodes are
 * table shadow node is non-listening (no hit-graph pass; chairs stay hit
 * targets so they still drag the table), and both skip `perfectDrawEnabled` (no second
 * buffer canvas), and the stroke is excluded from the shadow.
 */
function contactShadow(theme: FurnitureTheme) {
  return {
    shadowColor: SHADOW_TONES[theme],
    shadowBlur: CONTACT_SHADOW.blur,
    shadowOffsetY: CONTACT_SHADOW.offsetY,
    shadowForStrokeEnabled: false,
    perfectDrawEnabled: false,
  } as const;
}

/** Opaque caster: canvas scales shadow alpha by the caster's alpha. It sits under the surface. */
const SHADOW_CASTER = "#000000";

const GRAIN_LINES = 4;
const GRAIN_RINGS = 3;
/** How far grain and edge highlights stop short of the table edge. */
const EDGE_INSET = 3;

/** SVG path data for a circular arc centred on the origin (degrees, clockwise). */
function arcPath(radius: number, fromDeg: number, toDeg: number): string {
  const point = (deg: number): string => {
    const rad = (deg * Math.PI) / 180;
    return `${(radius * Math.cos(rad)).toFixed(1)} ${(radius * Math.sin(rad)).toFixed(1)}`;
  };
  return `M ${point(fromDeg)} A ${radius} ${radius} 0 0 1 ${point(toDeg)}`;
}

export interface TableArtProps {
  shape: TableShapeName;
  /** Stored footprint; falls back to the shape default when omitted. */
  width?: number;
  height?: number;
  /** Surface fill — the live status or inactive colour. */
  fill: string;
  stroke: string;
  strokeWidth: number;
}

type SurfacePaint = Omit<TableArtProps, "shape" | "width" | "height">;

/** `table-round.svg`: wood disc, three grain rings, top-left highlight arc. */
function RoundTableArt({
  width = SHAPE_DEFAULTS.circle.width,
  fill,
  stroke,
  strokeWidth,
}: SurfacePaint & { width?: number }) {
  const radius = width / 2;
  const theme = useFurnitureTheme();
  return (
    <>
      <Circle
        name={TABLE_SHADOW_NAME}
        radius={radius}
        fill={SHADOW_CASTER}
        listening={false}
        {...contactShadow(theme)}
      />
      <Circle
        name={TABLE_SURFACE_NAME}
        radius={radius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {Array.from({ length: GRAIN_RINGS }, (_, i) => (
        <Circle
          key={i}
          radius={(radius * (GRAIN_RINGS - i)) / (GRAIN_RINGS + 1)}
          stroke={FURNITURE_PALETTE.grain}
          strokeWidth={1.5}
          opacity={0.25 - i * 0.05}
        />
      ))}
      <Path
        data={arcPath(radius * 0.71, 204, 258)}
        stroke={FURNITURE_PALETTE.highlight}
        strokeWidth={3}
        lineCap="round"
        opacity={0.3}
      />
    </>
  );
}

/** `table-rect.svg` / `table-square.svg`: wood slab, grain lines, edge highlights. */
function SlabTableArt({
  shape,
  width = SHAPE_DEFAULTS[shape].width,
  height = SHAPE_DEFAULTS[shape].height,
  fill,
  stroke,
  strokeWidth,
}: SurfacePaint & { shape: Exclude<TableShapeName, "circle">; width?: number; height?: number }) {
  const cornerRadius = TABLE_CORNER_RADIUS[shape];
  const left = -width / 2;
  const top = -height / 2;
  const innerLeft = left + EDGE_INSET;
  const innerRight = -left - EDGE_INSET;
  const theme = useFurnitureTheme();

  return (
    <>
      <Rect
        name={TABLE_SHADOW_NAME}
        x={left}
        y={top}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        fill={SHADOW_CASTER}
        listening={false}
        {...contactShadow(theme)}
      />
      <Rect
        name={TABLE_SURFACE_NAME}
        x={left}
        y={top}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
      />
      {Array.from({ length: GRAIN_LINES }, (_, i) => {
        const y = top + (height * (i + 1)) / (GRAIN_LINES + 1);
        return (
          <Line
            key={i}
            points={[innerLeft, y, innerRight, y]}
            stroke={FURNITURE_PALETTE.grain}
            strokeWidth={1}
            opacity={0.28}
          />
        );
      })}
      <Line
        points={[innerLeft, top + 1.5, innerRight, top + 1.5]}
        stroke={FURNITURE_PALETTE.highlight}
        strokeWidth={1.5}
        lineCap="round"
        opacity={0.5}
      />
      <Line
        points={[left + 1.5, top + EDGE_INSET, left + 1.5, -top - EDGE_INSET]}
        stroke={FURNITURE_PALETTE.highlight}
        strokeWidth={1.5}
        lineCap="round"
        opacity={0.3}
      />
    </>
  );
}

/** Shape-appropriate table art, tinted by `fill`. */
export function TableArt({ shape, width, height, ...paint }: TableArtProps) {
  return shape === "circle" ? (
    <RoundTableArt width={width} {...paint} />
  ) : (
    <SlabTableArt shape={shape} width={width} height={height} {...paint} />
  );
}

export interface SeatArtProps {
  x: number;
  y: number;
  /** Degrees clockwise; 0 means the seat faces up, towards -y. */
  rotation: number;
  /** Chair size; scales with party size (see `seatSize`). */
  width: number;
  height: number;
}

/** `chair.svg`: a rounded frame with an inset cushion. */
export function SeatArt({ x, y, rotation, width, height }: SeatArtProps) {
  const theme = useFurnitureTheme();
  const tones = SEAT_TONES[theme];
  return (
    <Group name={SEAT_NAME} x={x} y={y} rotation={rotation}>
      <Rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        cornerRadius={width / 4}
        fill={tones.frame}
        stroke={tones.edge}
        strokeWidth={0.7}
        {...contactShadow(theme)}
      />
      <Rect
        x={-width * 0.29}
        y={-height / 4}
        width={width * 0.58}
        height={height / 2}
        cornerRadius={height / 5}
        fill={tones.cushion}
      />
    </Group>
  );
}
