import { useLayoutEffect, type RefObject } from "react";
import { shiftIntoViewport } from "./floating-position";

/**
 * Slides an absolutely positioned panel sideways until it sits inside the
 * viewport. A panel that already fits keeps its stylesheet alignment, so a
 * desktop menu does not move. The inset is relative to the offset parent:
 * `shiftIntoViewport` returns a viewport delta, and the parent's origin is
 * subtracted so a right-aligned menu whose trigger is not at x=0 lands on
 * the same margin.
 */
export function useShiftIntoViewport(
  active: boolean,
  panelRef: RefObject<HTMLElement | null>
): void {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!active || !panel) return;

    const fit = () => {
      panel.style.insetInlineStart = "";
      panel.style.insetInlineEnd = "";
      const width = panel.offsetWidth;
      const box = panel.getBoundingClientRect();
      // offsetWidth ignores a scale transform; recentre so an opening
      // animation does not report a left edge that is still scaling in.
      const naturalLeft = box.left + box.width / 2 - width / 2;
      const shift = shiftIntoViewport(naturalLeft, width, document.documentElement.clientWidth);
      if (shift === 0) return;
      const parent = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : null;
      const parentLeft = parent?.getBoundingClientRect().left ?? 0;
      const nextLeft = naturalLeft + shift - parentLeft;
      const rtl = getComputedStyle(panel).direction === "rtl";
      panel.style.insetInlineEnd = "auto";
      panel.style.insetInlineStart = rtl
        ? `${(parent?.clientWidth ?? 0) - nextLeft - width}px`
        : `${nextLeft}px`;
    };

    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      panel.style.insetInlineStart = "";
      panel.style.insetInlineEnd = "";
    };
  }, [active, panelRef]);
}
