import { useEffect, type RefObject } from "react";

/**
 * Selector for all keyboard-focusable elements.
 * Used by Dialog, Drawer, and CommandPalette to query trap candidates.
 */
export const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside a panel element while `enabled` is true.
 *
 * On enable: focuses the first focusable descendant.
 * Tab at last element: wraps to first.
 * Shift+Tab at first element: wraps to last.
 * On disable / unmount: removes all listeners (no cleanup side-effects on the caller).
 *
 * RIALTO RULE: no setState in this hook — all behavior is imperative (focus + listeners).
 *
 * @example
 * const panelRef = useRef<HTMLDivElement>(null);
 * useFocusTrap(panelRef, isOpen);
 */
export function useFocusTrap(panelRef: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const panel = panelRef.current;
    if (!panel) return;

    const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [enabled, panelRef]);
}
