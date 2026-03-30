import { useEffect, useRef } from "react";
import { useInView, useAnimation, useReducedMotion } from "framer-motion";

const FALLBACK_TIMEOUT_MS = 3000;

interface UseScrollRevealOptions {
  /** IntersectionObserver rootMargin. Default "-80px". */
  margin?: string;
  /** Trigger only once. Default true. */
  once?: boolean;
  /** Timeout in ms before content is forced visible. Default 3000. */
  fallbackTimeout?: number;
}

/**
 * Triggers Framer Motion animation controls when the element scrolls into view.
 * Pair with `staggerReveal` variants for orchestrated page-load reveals.
 *
 * Includes a timeout fallback (default 3s) so crawlers and slow-loading
 * environments still see content even if IntersectionObserver never fires.
 *
 * @example
 * const { ref, controls } = useScrollReveal();
 * <motion.div ref={ref} variants={staggerReveal.container} initial="hidden" animate={controls}>
 *   {items.map(i => <motion.div key={i} variants={staggerReveal.item} />)}
 * </motion.div>
 */
export function useScrollReveal({
  margin = "-80px",
  once = true,
  fallbackTimeout = FALLBACK_TIMEOUT_MS,
}: UseScrollRevealOptions = {}) {
  const controls = useAnimation();
  const shouldReduceMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: margin as `${number}px`, once });
  const hasRevealedRef = useRef(false);

  useEffect(() => {
    if (shouldReduceMotion) {
      hasRevealedRef.current = true;
      controls.set("visible");
      return;
    }
    if (inView) {
      hasRevealedRef.current = true;
      controls.start("visible");
    }
  }, [inView, controls, shouldReduceMotion]);

  // Timeout fallback: ensure content becomes visible for crawlers and
  // environments where IntersectionObserver may not trigger.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!hasRevealedRef.current) {
        hasRevealedRef.current = true;
        controls.start("visible");
      }
    }, fallbackTimeout);

    return () => clearTimeout(timer);
  }, [controls, fallbackTimeout]);

  return { ref, controls };
}
