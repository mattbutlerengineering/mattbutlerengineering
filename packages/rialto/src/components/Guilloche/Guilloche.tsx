import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startGuilloche } from "./guilloche-engine";
import styles from "./Guilloche.module.css";

/**
 * An ambient canvas backdrop: layered hypotrochoid rings drawn as an engraved
 * rosette, like the ones on a printed menu, gift card or check presenter. The
 * rings slowly rotate and drift in phase, so the lattice between them keeps
 * shifting. One ring is stroked in the gold accent; the rest are faint
 * text-primary. The pointer shifts the phase of the rings near it.
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
 *   <Guilloche />
 *   <Hero title="Gift cards" />
 * </div>
 */
export interface GuillocheProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Guilloche = forwardRef<HTMLDivElement, GuillocheProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startGuilloche(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-guilloche-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Guilloche.displayName = "Guilloche";
