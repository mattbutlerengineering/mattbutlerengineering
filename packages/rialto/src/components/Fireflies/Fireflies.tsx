import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startFireflies } from "./fireflies-engine";
import styles from "./Fireflies.module.css";

/**
 * An ambient canvas backdrop: sparse fireflies on a dusk patio. Each fly
 * wanders slowly and pulses on its own beat, flashing bright and fading to
 * nothing; the few that glow gold (the accent) are the only warm points, the
 * rest are faint text-primary. The pointer draws nearby flies a little closer.
 *
 * Purely decorative — always `aria-hidden` and never interactive. Colors come
 * from live theme tokens and re-read on theme change, so it works in light and
 * dark without configuration. Under `prefers-reduced-motion` it degrades to a
 * static gradient poster and no animation loop is ever started.
 *
 * An expressive element: use one per view, as the backdrop of a single hero or
 * empty-state slot, never stacked with `SilkFlow` or another backdrop.
 *
 * Sizes to its container; give that container `position: relative`.
 *
 * @example
 * <div style={{ position: "relative", height: "70vh" }}>
 *   <Fireflies />
 *   <Hero title="The patio at dusk" />
 * </div>
 */
export interface FirefliesProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Fireflies = forwardRef<HTMLDivElement, FirefliesProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startFireflies(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-fireflies-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Fireflies.displayName = "Fireflies";
