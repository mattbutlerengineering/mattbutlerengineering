import { useEffect, useRef } from "react";

/**
 * Captures the focused element when `open` transitions to `true` and restores
 * focus to it when `open` transitions to `false` (or the component unmounts
 * while open).
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
    if (open) {
      triggerRef.current = document.activeElement;
    } else {
      const captured = triggerRef.current;
      triggerRef.current = null;
      requestAnimationFrame(() => {
        (captured as HTMLElement | null)?.focus();
      });
    }
  }, [open]);
}
