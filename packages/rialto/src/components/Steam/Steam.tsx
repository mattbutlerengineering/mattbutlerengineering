import { forwardRef, useEffect, useRef } from "react";
import { useMotionPreset } from "../../providers/useMotionPreset";
import { cn } from "../../utils/class-composer";
import { startSteam } from "./steam-engine";
import styles from "./Steam.module.css";

/**
 * An ambient canvas backdrop: steam off the kitchen pass or the coffee bar.
 * A few large, low-contrast wisps rise, swell and fold into one another,
 * fading in at the bottom and out as they climb; the occasional thick wisp is
 * tinted with the gold accent, the rest are text-primary at low opacity.
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
 *   <Steam />
 *   <Hero title="Fresh off the pass" />
 * </div>
 */
export interface SteamProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const Steam = forwardRef<HTMLDivElement, SteamProps>(({ className }, ref) => {
  const { reduced: shouldReduceMotion } = useMotionPreset();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startSteam(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-steam-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

Steam.displayName = "Steam";
