import { useEffect, useRef } from "react";

/**
 * Captures the focused element when `open` transitions to `true` and restores
 * focus to it when `open` transitions to `false` OR the component unmounts
 * while still open (e.g. a parent stops rendering it entirely instead of
 * toggling `open` to `false` first).
 *
 * The restore uses `requestAnimationFrame` so it fires after the overlay's
 * exit animation has removed the panel from the DOM — matching the existing
 * per-overlay rAF pattern and the fake-timer approach used in accessibility
 * tests (`vi.useFakeTimers()` + `vi.runAllTimers()`).
 *
 * @param open - Whether the overlay is currently open.
 *
 * @example
 * function MyDialog({ open, onClose }) {
 *   useReturnFocus(open);
 *   // ...
 * }
 */
export function useReturnFocus(open: boolean): void {
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;

    // Cleanup runs both when `open` transitions to `false` and on unmount
    // while `open` is still `true` — so restoring focus here covers both.
    return () => {
      const captured = triggerRef.current;
      triggerRef.current = null;
      requestAnimationFrame(() => {
        (captured as HTMLElement | null)?.focus();
      });
    };
  }, [open]);
}
