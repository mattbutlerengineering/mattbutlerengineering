import { useCallback } from "react";
import type { MotionStyle } from "framer-motion";
import { useMotionValue, useSpring, useReducedMotion } from "framer-motion";
import { boop } from "../tokens/motion";

const NOOP_STYLE: MotionStyle = {};
const noop = () => {};

/**
 * Spring scale-up on hover ("boop"), returns to rest on leave.
 *
 * Respects `prefers-reduced-motion` — returns noops + empty style when active.
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
  const shouldReduceMotion = useReducedMotion();
  const scale = useMotionValue(1);
  const { stiffness, damping, mass } = boop.transition;
  const springScale = useSpring(scale, { stiffness, damping, mass });

  const onMouseEnter = useCallback(() => {
    scale.set(boop.scale);
  }, [scale]);

  const onMouseLeave = useCallback(() => {
    scale.set(1);
  }, [scale]);

  if (shouldReduceMotion) {
    return { style: NOOP_STYLE, onMouseEnter: noop, onMouseLeave: noop };
  }

  return { style: { scale: springScale }, onMouseEnter, onMouseLeave };
}
