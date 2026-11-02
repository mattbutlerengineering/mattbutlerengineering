import { useLayoutEffect, type RefObject } from "react";
import {
  placeBeside,
  placeHorizontal,
  placeVertical,
  type FloatingStyle,
} from "./floating-position";

/** Gap between a trigger/field and its list or menu, px. */
const LIST_GAP = 4;
/** Matches `max-height` of the listbox `.dropdown` rules. */
const LISTBOX_MAX_HEIGHT = 240;

type Place = (anchor: DOMRect, panel: HTMLElement) => Partial<FloatingStyle>;

/**
 * Keeps `panelRef` positioned against `anchorRef`'s viewport rect while
 * `active`, by imperative style writes (no setState). Re-runs on resize, on any
 * scroll (capture, so a dialog body's scroll counts), and when the panel's
 * content or size changes, so a panel that grows after opening is re-capped.
 * `place` must be stable (`useCallback`).
 */
export function useLayerFloating(
  active: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  place: Place
): void {
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!active || !anchor || !panel) return;
    const update = () => Object.assign(panel.style, place(anchor.getBoundingClientRect(), panel));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const mutations = new MutationObserver(update);
    mutations.observe(panel, { childList: true, subtree: true, characterData: true });
    // Deferred a frame: re-capping resizes the panel, and doing that inside the
    // observer callback raises "ResizeObserver loop completed".
    let frame = 0;
    const resizes =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
          });
    resizes?.observe(panel);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      mutations.disconnect();
      resizes?.disconnect();
    };
  }, [active, anchorRef, panelRef, place]);
}

const viewportSize = () => ({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
});

/** Listbox as wide as its field, opening below it (flipping above if cramped). */
export const placeListbox: Place = (anchor, panel) => {
  const { height } = viewportSize();
  // Width first: long labels wrap at the field's width, which sets scrollHeight.
  panel.style.width = `${anchor.width}px`;
  return {
    ...placeVertical(
      anchor,
      Math.min(panel.scrollHeight, LISTBOX_MAX_HEIGHT),
      "bottom",
      LIST_GAP,
      height
    ),
    left: `${anchor.left}px`,
    right: "auto",
  };
};

/** Menu sized to its content, aligned to the trigger's start or end edge. */
export function placeMenu(align: "left" | "right", side: "top" | "bottom"): Place {
  return (anchor, panel) => {
    const { width, height } = viewportSize();
    // Measure at the viewport's start so the width is not squeezed by `left`.
    panel.style.left = "0px";
    panel.style.right = "auto";
    const desired = align === "right" ? anchor.right - panel.offsetWidth : anchor.left;
    return {
      ...placeVertical(anchor, panel.scrollHeight, side, LIST_GAP, height),
      left: `${placeHorizontal(desired, panel.offsetWidth, width)}px`,
      right: "auto",
    };
  };
}

/** Popover panel centred on its trigger along `placement`, clamped into the viewport. */
export function placePopover(placement: "top" | "bottom" | "left" | "right", gap = 8): Place {
  return (anchor, panel) => {
    const { width, height } = viewportSize();
    panel.style.left = "0px";
    panel.style.right = "auto";
    const size = { width: panel.offsetWidth, height: panel.scrollHeight };
    if (placement === "left" || placement === "right") {
      return placeBeside(anchor, placement, size, gap, width, height);
    }
    const centred = anchor.left + anchor.width / 2 - size.width / 2;
    return {
      ...placeVertical(anchor, size.height, placement, gap, height),
      left: `${placeHorizontal(centred, size.width, width)}px`,
      right: "auto",
    };
  };
}
