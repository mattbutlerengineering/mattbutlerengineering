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
  FURNITURE_PALETTE,
  SEAT_NAME,
  TABLE_CORNER_RADIUS,
  TABLE_SHADOW_NAME,
  TABLE_SURFACE_NAME,
} from "./furniture-tokens.js";

const GRAIN_LINES = 4;
const GRAIN_RINGS = 3;
/** How far the contact shadow sits below the surface, in canvas units. */
const SHADOW_DROP = 2;
/** How far grain and edge highlights stop short of the table edge. */
const EDGE_INSET = 3;
const SEAT_WIDTH = 16;
const SEAT_HEIGHT = 13;

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
  /** Surface fill — the live status or inactive colour. */
  fill: string;
  stroke: string;
  strokeWidth: number;
}

type SurfacePaint = Omit<TableArtProps, "shape">;

/** `table-round.svg`: wood disc, three grain rings, top-left highlight arc. */
function RoundTableArt({ fill, stroke, strokeWidth }: SurfacePaint) {
  const radius = SHAPE_DEFAULTS.circle.width / 2;
  return (
    <>
      <Circle
        name={TABLE_SHADOW_NAME}
        y={SHADOW_DROP}
        radius={radius}
        fill={FURNITURE_PALETTE.shadow}
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
  fill,
  stroke,
  strokeWidth,
}: SurfacePaint & { shape: Exclude<TableShapeName, "circle"> }) {
  const { width, height } = SHAPE_DEFAULTS[shape];
  const cornerRadius = TABLE_CORNER_RADIUS[shape];
  const left = -width / 2;
  const top = -height / 2;
  const innerLeft = left + EDGE_INSET;
  const innerRight = -left - EDGE_INSET;

  return (
    <>
      <Rect
        name={TABLE_SHADOW_NAME}
        x={left}
        y={top + SHADOW_DROP}
        width={width}
        height={height}
        cornerRadius={cornerRadius}
        fill={FURNITURE_PALETTE.shadow}
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
export function TableArt({ shape, ...paint }: TableArtProps) {
  return shape === "circle" ? (
    <RoundTableArt {...paint} />
  ) : (
    <SlabTableArt shape={shape} {...paint} />
  );
}

export interface SeatArtProps {
  x: number;
  y: number;
  /** Degrees clockwise; 0 means the seat faces up, towards -y. */
  rotation: number;
}

/** `chair.svg`: a rounded frame with an inset cushion. */
export function SeatArt({ x, y, rotation }: SeatArtProps) {
  return (
    <Group name={SEAT_NAME} x={x} y={y} rotation={rotation}>
      <Rect
        x={-SEAT_WIDTH / 2}
        y={-SEAT_HEIGHT / 2}
        width={SEAT_WIDTH}
        height={SEAT_HEIGHT}
        cornerRadius={SEAT_WIDTH / 4}
        fill={FURNITURE_PALETTE.seatFrame}
        stroke={FURNITURE_PALETTE.seatEdge}
        strokeWidth={0.7}
      />
      <Rect
        x={-SEAT_WIDTH * 0.29}
        y={-SEAT_HEIGHT / 4}
        width={SEAT_WIDTH * 0.58}
        height={SEAT_HEIGHT / 2}
        cornerRadius={SEAT_HEIGHT / 5}
        fill={FURNITURE_PALETTE.seatCushion}
      />
    </Group>
  );
}
