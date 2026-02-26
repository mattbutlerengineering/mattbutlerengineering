import { useCallback, useRef } from "react";
import { useMotionValue, useSpring, useReducedMotion, type MotionStyle } from "framer-motion";
import { springTilt } from "../tokens/motion";

const NOOP_STYLE: MotionStyle = {};
const noop = () => {};

export function useTilt(
  enabled: boolean,
  maxTilt = 2
): {
  ref: (el: HTMLDivElement | null) => void;
  style: MotionStyle;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseLeave: () => void;
} {
  const elRef = useRef<HTMLDivElement | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const springX = useSpring(rotateX, springTilt);
  const springY = useSpring(rotateY, springTilt);

  const ref = useCallback((el: HTMLDivElement | null) => {
    elRef.current = el;
  }, []);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const el = elRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;

      rotateX.set(-ny * maxTilt);
      rotateY.set(nx * maxTilt);

      const glowX = ((e.clientX - rect.left) / rect.width) * 100;
      const glowY = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--tilt-glow-x", `${glowX}%`);
      el.style.setProperty("--tilt-glow-y", `${glowY}%`);
    },
    [rotateX, rotateY, maxTilt]
  );

  const onMouseLeave = useCallback(() => {
    rotateX.set(0);
    rotateY.set(0);
    const el = elRef.current;
    if (el) {
      el.style.removeProperty("--tilt-glow-x");
      el.style.removeProperty("--tilt-glow-y");
    }
  }, [rotateX, rotateY]);

  if (!enabled || shouldReduceMotion) {
    return {
      ref: noop,
      style: NOOP_STYLE,
      onMouseMove: noop,
      onMouseLeave: noop,
    };
  }

  const style: MotionStyle = {
    rotateX: springX,
    rotateY: springY,
    transformPerspective: 800,
  };

  return { ref, style, onMouseMove, onMouseLeave };
}
