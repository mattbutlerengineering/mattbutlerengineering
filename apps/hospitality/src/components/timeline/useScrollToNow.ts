import { useEffect, useRef, type RefObject } from "react";
import { useMotionPreset } from "@mattbutlerengineering/rialto/providers";

/** Where the now-line lands after the scroll: a quarter of the way across the viewport (ux.md Screen 5). */
export const NOW_LINE_VIEWPORT_FRACTION = 0.25;

/**
 * Scrolls the timeline so the now-line sits a quarter of the way across the
 * viewport — on mount and whenever the now-line appears (the date becomes
 * today, service opens), never on the minute tick. Smooth by default, instant
 * under reduced motion. A no-op while there is no now-line.
 *
 * `tableColumnWidth` is the grid's own sticky column (120 desktop / 80 phone),
 * the same number it uses to place the line.
 */
export function useScrollToNow(
  scrollRef: RefObject<HTMLElement | null>,
  currentTimeOffset: number | null,
  tableColumnWidth: number
): void {
  const { precision } = useMotionPreset();
  const behavior: ScrollBehavior = precision.duration === 0 ? "instant" : "smooth";
  const hasNowLine = currentTimeOffset !== null;

  // The scroll effect keys on hasNowLine alone; it reads the rest here so the
  // minute tick (a new offset every minute) never re-scrolls the host.
  const latestRef = useRef({ currentTimeOffset, tableColumnWidth, behavior });
  useEffect(() => {
    latestRef.current = { currentTimeOffset, tableColumnWidth, behavior };
  });

  useEffect(() => {
    if (!hasNowLine) return;
    const element = scrollRef.current;
    const {
      currentTimeOffset: offset,
      tableColumnWidth: column,
      behavior: how,
    } = latestRef.current;
    if (!element || offset === null) return;

    const left = Math.max(0, column + offset - element.clientWidth * NOW_LINE_VIEWPORT_FRACTION);
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ left, behavior: how });
    } else {
      // jsdom has no Element.scrollTo; the instant path is a plain assignment.
      element.scrollLeft = left;
    }
  }, [hasNowLine, scrollRef]);
}
