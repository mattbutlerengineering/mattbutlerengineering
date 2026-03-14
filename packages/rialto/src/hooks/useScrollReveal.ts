import { useEffect, useRef } from "react";
import { useInView, useAnimation, useReducedMotion } from "framer-motion";

interface UseScrollRevealOptions {
  /** IntersectionObserver rootMargin. Default "-80px". */
  margin?: string;
  /** Trigger only once. Default true. */
  once?: boolean;
}

/**
 * Triggers Framer Motion animation controls when the element scrolls into view.
 * Pair with `staggerReveal` variants for orchestrated page-load reveals.
 *
 * @example
 * const { ref, controls } = useScrollReveal();
 * <motion.div ref={ref} variants={staggerReveal.container} initial="hidden" animate={controls}>
 *   {items.map(i => <motion.div key={i} variants={staggerReveal.item} />)}
 * </motion.div>
 */
export function useScrollReveal({ margin = "-80px", once = true }: UseScrollRevealOptions = {}) {
  const controls = useAnimation();
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: margin as `${number}px`, once });

  useEffect(() => {
    if (shouldReduceMotion) {
      controls.set("visible");
      return;
    }
    if (inView) {
      controls.start("visible");
    }
  }, [inView, controls, shouldReduceMotion]);

  return { ref, controls };
}
