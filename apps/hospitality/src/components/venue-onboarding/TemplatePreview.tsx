import type { JSX } from "react";
import { CANVAS_WIDTH, CANVAS_HEIGHT, SHAPE_DEFAULTS } from "../floor-plan/floor-plan-geometry.js";
import type { DraftTable } from "./floor-plan-draft.js";

export interface TemplatePreviewProps {
  tables: readonly DraftTable[];
  /** Optional CSS class for sizing by the caller. The SVG itself is always viewBox 0 0 800 600. */
  className?: string;
}

/**
 * Inline-SVG miniature of a floor-plan layout. Pure props in, SVG out — no
 * state, no effects, no data fetching. SVG (not a Konva Stage) so it can
 * consume `var(--rialto-*)` directly with no theme-resolution machinery;
 * see apps/hospitality/src/components/floor-plan/TableShape.tsx for why
 * Konva can't do the same.
 *
 * Geometry mirrors TableShape.tsx: a rectangle/square's centre becomes its
 * top-left offset by half its size; a circle is drawn at its own centre
 * with radius = SHAPE_DEFAULTS.circle.width / 2.
 */
export function TemplatePreview({ tables, className }: TemplatePreviewProps): JSX.Element {
  return (
    <svg
      className={className}
      viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <rect
        x={0}
        y={0}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        fill="var(--rialto-surface-recessed)"
      />
      {tables.map((table) => {
        if (table.shape === "circle") {
          const radius = SHAPE_DEFAULTS.circle.width / 2;
          return (
            <circle
              key={table.localId}
              cx={table.x}
              cy={table.y}
              r={radius}
              fill="var(--rialto-border-strong)"
            />
          );
        }

        const dims = SHAPE_DEFAULTS[table.shape];
        return (
          <rect
            key={table.localId}
            x={table.x - dims.width / 2}
            y={table.y - dims.height / 2}
            width={dims.width}
            height={dims.height}
            fill="var(--rialto-border-strong)"
          />
        );
      })}
    </svg>
  );
}
