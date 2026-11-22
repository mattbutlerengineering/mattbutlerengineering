import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startContour } from "./contour-engine";
import styles from "./Contour.module.css";

/**
 * An ambient canvas backdrop: topographic isolines traced over a slowly
 * evolving field, like the terroir map on a wine list or vineyard topography.
 * Hills swell and settle, so the contours keep reshaping. One level is stroked
 * in the gold accent; the rest are faint text-primary. The pointer raises a
 * local hill under the cursor.
 *
 * Purely decorative — always `aria-hidden` and never interactive. Colors come
 * from live theme tokens and re-read on theme change, so it works in light and
 * dark without configuration. Under `prefers-reduced-motion` it degrades to a
 * static gradient poster and no animation loop is ever started.
 *
 * An expressive element: use one per view, as the backdrop of a single hero or
 * empty-state slot, never stacked with `SilkFlow`.
 *
 * Sizes to its container; give that container `position: relative`.
 *
 * @example
 * <div style={{ position: "relative", height: "70vh" }}>
 *   <Contour />
 *   <Hero title="The wine list" />
 * </div>
 */
export interface ContourProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Contour = forwardRef<HTMLDivElement, ContourProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startContour(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-contour-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Contour.displayName = "Contour";
