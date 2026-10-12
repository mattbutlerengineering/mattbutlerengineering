import { useCallback } from "react";
import type { MotionStyle } from "framer-motion";
import { useMotionValue, useSpring } from "framer-motion";
import { useMotionPreset } from "../providers/useMotionPreset";

const NOOP_STYLE: MotionStyle = {};
const noop = () => {};

/**
 * Spring scale-up on hover ("boop"), returns to rest on leave.
 *
 * Respects `prefers-reduced-motion` — returns noops + empty style when active.
 * The preference is read from {@link useMotionPreset}, the one reduced-motion
 * signal every Rialto component resolves (ADR-025). For a plain `whileHover`
 * target, prefer `useMotionPreset().boop`.
 *
 * @example
 * const { style, onMouseEnter, onMouseLeave } = useBoop();
 * <motion.button style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
 *   Save
 * </motion.button>
 */
export function useBoop(): {
  style: MotionStyle;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
} {
  const { reduced: shouldReduceMotion, boop } = useMotionPreset();
  const scale = useMotionValue(1);
  // Under reduced motion `boop` carries an instant transition, not a spring.
  // The spring is never rendered then (noop style below); `useSpring` is
  // still called so the hook order stays fixed.
  const spring = "stiffness" in boop.transition ? boop.transition : undefined;
  const springScale = useSpring(
    scale,
    spring && { stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass }
  );

  const onMouseEnter = useCallback(() => {
    scale.set(boop.scale);
  }, [scale, boop.scale]);

  const onMouseLeave = useCallback(() => {
    scale.set(1);
  }, [scale]);

  if (shouldReduceMotion) {
    return { style: NOOP_STYLE, onMouseEnter: noop, onMouseLeave: noop };
  }

  return { style: { scale: springScale }, onMouseEnter, onMouseLeave };
}
