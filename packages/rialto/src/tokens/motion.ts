/**
 * Rialto — Motion System
 *
 * Two motion personalities:
 * - Precision: crisp, instant-feeling transitions ("rotary click")
 * - Spring: physical, organic movements with detent feel
 */

/** Precision easing — standard UI transitions, hover states, small movements */
export const precision = {
  duration: 0.15,
  ease: [0.2, 0, 0, 1] as const,
};

/** Spring physics — toggles, AI elements, high-interaction components */
export const spring = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 28,
  mass: 0.8,
};

/** Gentle spring — larger movements, dialog entrances, card expansions */
export const springGentle = {
  type: 'spring' as const,
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
    type: 'spring' as const,
    stiffness: 400,
    damping: 15,
    mass: 0.5,
  },
};

/** Reduced motion fallback — instant, no animation */
export const reduced = {
  duration: 0,
};
