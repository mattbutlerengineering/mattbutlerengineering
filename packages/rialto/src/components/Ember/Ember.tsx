import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startEmber } from "./ember-engine";
import styles from "./Ember.module.css";

/**
 * An ambient canvas backdrop: candlelit sparks rising from the hearth of a
 * wood-fired kitchen. Each spark flickers and fades with height; only the
 * hottest 5% burn gold (the accent), the rest are faint text-primary. The
 * pointer acts as a draft that bends the sparks near it.
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
 *   <Ember />
 *   <Hero title="Tonight at the hearth" />
 * </div>
 */
export interface EmberProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Ember = forwardRef<HTMLDivElement, EmberProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startEmber(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-ember-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Ember.displayName = "Ember";
