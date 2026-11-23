import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startDustMotes } from "./dust-motes-engine";
import styles from "./DustMotes.module.css";

/**
 * An ambient canvas backdrop: slow dust motes drifting down through a leaning
 * shaft of light, the speakeasy room after hours. Motes brighten as they cross
 * the shaft and dim outside it; the few that catch the light are drawn in the
 * gold accent, the rest in faint text-primary. The pointer stirs nearby motes
 * aside as it passes.
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
 *   <DustMotes />
 *   <Hero title="The back room" />
 * </div>
 */
export interface DustMotesProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const DustMotes = forwardRef<HTMLDivElement, DustMotesProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startDustMotes(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-dust-motes-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

DustMotes.displayName = "DustMotes";
