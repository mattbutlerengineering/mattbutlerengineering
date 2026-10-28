import { Rect } from "react-konva";
import { TEXTURE_PATTERN_SCALE } from "./floor-textures.js";

/** Konva node name, so tests and the stage can address the plan floor. */
export const PLAN_FLOOR_NAME = "plan-floor";

export interface PlanFloorProps {
  width: number;
  height: number;
  /** The loaded texture for the plan's floor material; absent = bare floor (no material, or its PNG failed). */
  texture?: HTMLImageElement;
}

/**
 * The plan-level default floor, drawn beneath every section so the room reads
 * as one floor. Uses the same textures and pattern scale as `SectionZone`, so a
 * section with its own material simply overlays it.
 */
export function PlanFloor({ width, height, texture }: PlanFloorProps) {
  if (!texture) return null;
  return (
    <Rect
      name={PLAN_FLOOR_NAME}
      x={0}
      y={0}
      width={width}
      height={height}
      fillPatternImage={texture}
      fillPatternRepeat="repeat"
      fillPatternScale={TEXTURE_PATTERN_SCALE}
      listening={false}
    />
  );
}
