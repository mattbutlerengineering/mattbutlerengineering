import { memo } from "react";
import { Group, Line, Circle } from "react-konva";
import type { WallLayout } from "@mbe/types";
import type { KonvaEventObject } from "konva/lib/Node";
import { ENDPOINT_HIT_RADIUS, type Point, type WallEnd } from "./floor-plan-geometry.js";

// Konva paints to a canvas and cannot resolve var(--rialto-*), so resolve the live token and keep a
// theme-agnostic fallback for non-browser test environments (see apps/hospitality/CLAUDE.md).
function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export interface WallShapeProps {
  wall: WallLayout;
  isSelected: boolean;
  onSelect: (wallId: string) => void;
  /** Drag an endpoint handle; called with the pointer position in canvas coordinates. */
  onEndpointDrag?: (wallId: string, end: WallEnd, p: Point) => void;
}

const WINDOW_PANE_OPACITY = 0.25;
const GLASS_WIDTH = 2;
const JAMB_WIDTH = 2;
/** How far a jamb tick extends past the wall's edge on each side. */
const JAMB_OVERHANG = 2;

/** Two short ticks across the wall at each end of a window, as [x1, y1, x2, y2]. */
function windowJambs(wall: WallLayout): number[][] {
  const dx = wall.x2 - wall.x1;
  const dy = wall.y2 - wall.y1;
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const half = wall.thickness / 2 + JAMB_OVERHANG;
  const nx = (-dy / len) * half;
  const ny = (dx / len) * half;
  return [
    [wall.x1 - nx, wall.y1 - ny, wall.x1 + nx, wall.y1 + ny],
    [wall.x2 - nx, wall.y2 - ny, wall.x2 + nx, wall.y2 + ny],
  ];
}

/** A wall is a solid square-capped bar; a window is a glass line between two jamb ticks. */
function WallShapeComponent({ wall, isSelected, onSelect, onEndpointDrag }: WallShapeProps) {
  const isWindow = wall.wallType === "window";
  const accent = token("--rialto-accent", "#b0841e");
  const ink = token("--rialto-text-secondary", "#4a4744");
  const handle = (end: WallEnd, x: number, y: number) => (
    <Circle
      key={end}
      x={x}
      y={y}
      radius={ENDPOINT_HIT_RADIUS / 2}
      fill={accent}
      draggable
      onDragMove={(e: KonvaEventObject<DragEvent>) =>
        onEndpointDrag?.(wall.id, end, { x: e.target.x(), y: e.target.y() })
      }
    />
  );
  const stroke = isSelected ? accent : ink;
  return (
    <Group>
      {/* Walls use square caps so two walls meeting at a corner overlap by half a
          thickness and leave no notch. A window's pane is a faint solid bar (butt
          caps, so the jambs mark its ends) under a thin glass line. */}
      <Line
        points={[wall.x1, wall.y1, wall.x2, wall.y2]}
        stroke={stroke}
        strokeWidth={wall.thickness}
        opacity={isWindow ? WINDOW_PANE_OPACITY : 1}
        lineCap={isWindow ? "butt" : "square"}
        hitStrokeWidth={Math.max(wall.thickness, 16)}
        onClick={() => onSelect(wall.id)}
        onTap={() => onSelect(wall.id)}
      />
      {isWindow && (
        <>
          <Line
            name="window-glass"
            points={[wall.x1, wall.y1, wall.x2, wall.y2]}
            stroke={stroke}
            strokeWidth={GLASS_WIDTH}
            lineCap="butt"
            listening={false}
          />
          {windowJambs(wall).map((points, i) => (
            <Line
              key={i}
              name="window-jamb"
              points={points}
              stroke={stroke}
              strokeWidth={JAMB_WIDTH}
              lineCap="butt"
              listening={false}
            />
          ))}
        </>
      )}
      {isSelected && onEndpointDrag && (
        <>
          {handle(1, wall.x1, wall.y1)}
          {handle(2, wall.x2, wall.y2)}
        </>
      )}
    </Group>
  );
}

export const WallShape = memo(WallShapeComponent);
