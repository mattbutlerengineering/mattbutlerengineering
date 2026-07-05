import { useCallback, useEffect, useRef } from "react";

/** Default pointer travel (px) required before a hover counts as intentional. */
const DEFAULT_THRESHOLD = 4;

/** Return value of {@link usePointerActivation}. */
export interface UsePointerActivationResult {
  /** Whether the pointer has moved past the threshold since the last (re)baseline. */
  hasPointerMoved: () => boolean;
  /** Clears movement state and re-baselines — call when keyboard navigation takes over. */
  resetPointerMovement: () => void;
}

/**
 * Tracks whether the pointer has genuinely moved past a small distance threshold
 * while `enabled` is true. Overlay lists use this to gate `onMouseEnter` →
 * `activeIndex` updates so a *resting* cursor (one the menu simply opened or
 * animated underneath) no longer hijacks keyboard navigation. `mousemove` only
 * fires on real pointer motion — an element appearing under a stationary cursor
 * does not — so a hover is honoured only after the pointer has actually travelled.
 *
 * RIALTO RULE: no setState in this hook — movement state lives in refs so reading
 * it never triggers a render (callers query it inside event handlers).
 *
 * @param enabled - Whether tracking is active (typically the overlay's open state).
 * @param threshold - Minimum pointer travel in px before movement is registered.
 *
 * @example
 * const { hasPointerMoved, resetPointerMovement } = usePointerActivation(open);
 * // onMouseEnter: if (hasPointerMoved()) setActiveIndex(i);
 * // onKeyDown:    resetPointerMovement();
 */
export function usePointerActivation(
  enabled: boolean,
  threshold: number = DEFAULT_THRESHOLD
): UsePointerActivationResult {
  const movedRef = useRef(false);
  const baselineRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    movedRef.current = false;
    baselineRef.current = null;
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      const baseline = baselineRef.current;
      if (baseline === null) {
        baselineRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (movedRef.current) return;
      const dx = e.clientX - baseline.x;
      const dy = e.clientY - baseline.y;
      if (dx * dx + dy * dy >= threshold * threshold) {
        movedRef.current = true;
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => document.removeEventListener("mousemove", handleMouseMove);
  }, [enabled, threshold]);

  const hasPointerMoved = useCallback(() => movedRef.current, []);
  const resetPointerMovement = useCallback(() => {
    movedRef.current = false;
    baselineRef.current = null;
  }, []);

  return { hasPointerMoved, resetPointerMovement };
}
