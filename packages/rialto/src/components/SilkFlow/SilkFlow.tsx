import { forwardRef, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { cn } from "../../utils/class-composer";
import { startSilkFlow } from "./silk-flow-engine";
import styles from "./SilkFlow.module.css";

/**
 * An ambient canvas backdrop: hundreds of strands advected through a value-noise
 * flow field, leaving slowly fading trails that read as woven silk. A surgical
 * 5% of strands are stroked in the gold accent; the rest are near-transparent
 * text-primary. The pointer pushes strands aside as it passes.
 *
 * Purely decorative — always `aria-hidden` and never interactive. Colors come
 * from live theme tokens and re-read on theme change, so it works in light and
 * dark without configuration. Under `prefers-reduced-motion` it degrades to a
 * static gradient poster and no animation loop is ever started.
 *
 * Sizes to its container; give that container `position: relative`.
 *
 * @example
 * <div style={{ position: "relative", height: "70vh" }}>
 *   <SilkFlow />
 *   <Hero title="Rialto" />
 * </div>
 */
export interface SilkFlowProps {
  /** Additional class names for the root element. */
  className?: string;
}

export const SilkFlow = forwardRef<HTMLDivElement, SilkFlowProps>(({ className }, ref) => {
  const shouldReduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startSilkFlow(canvas);
  }, [shouldReduceMotion]);

  return (
    <div ref={ref} aria-hidden="true" className={cn(styles.root, className)}>
      {shouldReduceMotion ? (
        <div data-silk-poster className={styles.poster} />
      ) : (
        <canvas ref={canvasRef} className={styles.canvas} />
      )}
    </div>
  );
});

SilkFlow.displayName = "SilkFlow";
