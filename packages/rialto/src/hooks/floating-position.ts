/** Minimum clearance kept between a floating panel and the viewport edge, px. */
const FLOAT_MARGIN = 8;

/** Inline styles for a viewport-fixed panel. Unused edges are "auto", never "", so a stylesheet inset cannot stretch it. */
export interface FloatingStyle {
  left: string;
  top: string;
  bottom: string;
  right: string;
  maxHeight: string;
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(n, max));

/**
 * Left edge for a panel of `panelWidth` wanting to start at `desired`, kept
 * `FLOAT_MARGIN` inside a viewport `viewportWidth` wide. A panel wider than the
 * viewport pins to the start margin.
 */
export function placeHorizontal(
  desired: number,
  panelWidth: number,
  viewportWidth: number
): number {
  const max = Math.max(FLOAT_MARGIN, viewportWidth - panelWidth - FLOAT_MARGIN);
  return clamp(desired, FLOAT_MARGIN, max);
}

/**
 * Signed px to move a panel at `left` (width `panelWidth`) so it sits inside the
 * viewport margin. 0 when it already fits. For panels that stay in flow (absolute)
 * and only need a horizontal nudge, as Tooltip.
 */
export function shiftIntoViewport(left: number, panelWidth: number, viewportWidth: number): number {
  return placeHorizontal(left, panelWidth, viewportWidth) - left;
}

/**
 * Top/bottom placement against `anchor`. Opens on `side`; when the panel does
 * not fit there it flips to the roomier side, and is capped (scrolling) to the
 * room it has so the viewport never cuts it off. `panelHeight` is the height
 * the panel wants, already limited by any CSS max-height.
 */
export function placeVertical(
  anchor: DOMRect,
  panelHeight: number,
  side: "top" | "bottom",
  gap: number,
  viewportHeight: number
): Pick<FloatingStyle, "top" | "bottom" | "maxHeight"> {
  const below = viewportHeight - anchor.bottom - gap;
  const above = anchor.top - gap;
  const fitsPreferred = panelHeight <= (side === "bottom" ? below : above);
  const useBottom = fitsPreferred ? side === "bottom" : below >= above;
  const room = Math.floor(useBottom ? below : above);
  const maxHeight = panelHeight > room ? `${Math.max(room, 0)}px` : "";
  return useBottom
    ? { top: `${anchor.bottom + gap}px`, bottom: "auto", maxHeight }
    : { top: "auto", bottom: `${viewportHeight - anchor.top + gap}px`, maxHeight };
}

/**
 * Left/right placement against `anchor`: centred on it vertically, clamped into
 * the viewport on both axes, and capped when taller than the viewport allows.
 */
export function placeBeside(
  anchor: DOMRect,
  side: "left" | "right",
  panel: { width: number; height: number },
  gap: number,
  viewportWidth: number,
  viewportHeight: number
): FloatingStyle {
  const desired = side === "left" ? anchor.left - gap - panel.width : anchor.right + gap;
  const room = viewportHeight - 2 * FLOAT_MARGIN;
  const height = Math.min(panel.height, room);
  const top = clamp(
    anchor.top + anchor.height / 2 - height / 2,
    FLOAT_MARGIN,
    Math.max(FLOAT_MARGIN, viewportHeight - height - FLOAT_MARGIN)
  );
  return {
    left: `${placeHorizontal(desired, panel.width, viewportWidth)}px`,
    right: "auto",
    top: `${top}px`,
    bottom: "auto",
    maxHeight: panel.height > room ? `${room}px` : "",
  };
}
