/**
 * Rialto — Motion System
 *
 * Two motion personalities:
 * - Precision: crisp, instant-feeling transitions ("rotary click")
 * - Spring: physical, organic movements with detent feel
 */

import type { MotionStyle } from "framer-motion";

/**
 * Cast `React.CSSProperties` to Framer Motion's `MotionStyle`.
 *
 * Required when `exactOptionalPropertyTypes` is enabled in tsconfig —
 * `MotionStyle` extends `CSSProperties` but the two are not assignable
 * due to stricter optional-property handling.
 *
 * @example
 * <motion.div style={ms({ background: "red", opacity: 0.5 })} />
 */
export const ms = (s: React.CSSProperties): MotionStyle => s as MotionStyle;

/** Precision easing — standard UI transitions, hover states, small movements */
export const precision = {
  duration: 0.15,
  ease: [0.2, 0, 0, 1] as const,
};

/** Spring physics — toggles, AI elements, high-interaction components */
export const spring = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
  mass: 0.8,
};

/** Gentle spring — larger movements, dialog entrances, card expansions */
export const springGentle = {
  type: "spring" as const,
  stiffness: 200,
  damping: 24,
  mass: 1,
};

/** Responsive spring — cursor-tracking tilt, immediate feedback */
export const springTilt = {
  stiffness: 300,
  damping: 20,
  mass: 0.5,
};

/** Boop — brief spring scale on hover, returns to rest. Light mass + low damping = snappy overshoot. */
export const boop = {
  scale: 1.03,
  transition: {
    type: "spring" as const,
    stiffness: 400,
    damping: 15,
    mass: 0.5,
  },
};

/** Stagger reveal — orchestrated page-load animation preset.
 *  Apply to a parent container; children with `variants` will
 *  enter sequentially with a gentle spring settle. */
export const staggerReveal = {
  container: {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.06,
        delayChildren: 0.1,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 260,
        damping: 24,
        mass: 0.8,
      },
    },
  },
};

/** Reduced motion fallback — instant, no animation */
export const reduced = {
  duration: 0,
};
