import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startConstellation } from "./constellation-engine";
import styles from "./Constellation.module.css";

/**
 * An ambient canvas backdrop: a constellation of points drifting slowly, each
 * pair joined by a faint line while they are near, so the network forms and
 * breaks as they move — the guest and loyalty web. The pointer links the
 * nearest few points to itself. A few points glow gold (the accent); the rest,
 * and every line, are faint text-primary.
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
 *   <Constellation />
 *   <Hero title="Everyone at the table" />
 * </div>
 */
export interface ConstellationProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Constellation = forwardRef<HTMLDivElement, ConstellationProps>(
  ({ className }, ref) => {
    const { reduced: shouldReduceMotion } = useMotionPreset();
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      return startConstellation(canvas);
    }, [shouldReduceMotion]);

    return (
      <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
        {shouldReduceMotion ? (
          <div data-constellation-poster className={styles.poster} />
        ) : (
          <canvas ref={canvasRef} className={styles.canvas} />
        )}
      </div>
    );
  }
);

Constellation.displayName = "Constellation";
