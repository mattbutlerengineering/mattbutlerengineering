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

/** A wall is a solid bar; a window is a lighter, dashed bar so the two never read the same. */
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
  return (
    <Group>
      <Line
        points={[wall.x1, wall.y1, wall.x2, wall.y2]}
        stroke={isSelected ? accent : ink}
        strokeWidth={wall.thickness}
        dash={isWindow ? [10, 6] : undefined}
        opacity={isWindow ? 0.6 : 1}
        lineCap="butt"
        hitStrokeWidth={Math.max(wall.thickness, 16)}
        onClick={() => onSelect(wall.id)}
        onTap={() => onSelect(wall.id)}
      />
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
