import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startChampagne } from "./champagne-engine";
import styles from "./Champagne.module.css";

/**
 * An ambient canvas backdrop: fine bubbles rising through a glass of
 * champagne, each wobbling a little as it climbs. Bigger bubbles rise faster
 * and a few are stroked in the gold accent; the rest are faint text-primary.
 * The pointer nudges nearby bubbles aside as it passes.
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
 *   <Champagne />
 *   <Hero title="Tonight's pour" />
 * </div>
 */
export interface ChampagneProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Champagne = forwardRef<HTMLDivElement, ChampagneProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startChampagne(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-champagne-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Champagne.displayName = "Champagne";
