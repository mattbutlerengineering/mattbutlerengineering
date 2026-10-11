/**
 * Rialto Motion Preset Hook — the JS motion channel
 *
 * Vibes adapt the design language through CSS custom properties, which reach
 * every `transition:` declaration in the catalog. They cannot reach motion
 * driven from JavaScript: a `framer-motion` transition config is a plain
 * object, and no CSS variable can rewrite it. This hook is the second channel
 * behind the same idea — components ask for their motion config instead of
 * importing a constant, and the environment answers.
 *
 * Under `prefers-reduced-motion` every preset collapses to an instant
 * transition. That is deliberately not the same as removing the animation:
 * the state change still happens and still renders, it simply lands in one
 * frame instead of travelling. Spring physics are dropped outright rather
 * than shortened — a fast spring still overshoots, which is motion.
 *
 * **Contract: this hook must never throw.** Rialto is published to npm and
 * consumers render its components standalone, with no `RialtoProvider` in the
 * tree. It therefore reads the device signal through {@link useDeviceContext}
 * — a provider-free `useSyncExternalStore` hook — and never through
 * {@link useUIEnvironment}, which throws when no provider is present. Adopting
 * a throwing hook inside a catalog component would silently turn that
 * component into a provider-only component: a breaking change for external
 * consumers, dressed as a feature.
 */

import { useContext, useMemo } from "react";
import { useDeviceContext } from "./useDeviceContext";
import { UIEnvironmentContext } from "./useUIEnvironment";
import { boop, precision, spring, springGentle, springTilt } from "../tokens/motion";

/* ── Types ───────────────────────────────────── */

/** An instant transition — the reduced-motion form of every preset. */
export interface InstantTransition {
  duration: 0;
}

/** A duration+easing transition, the shape `tokens/motion.precision` has. */
export interface EasedTransition {
  duration: number;
  ease: readonly [number, number, number, number];
}

/** A `useSpring` config, the shape `tokens/motion.springTilt` has. */
export interface SpringOptions {
  stiffness: number;
  damping: number;
  mass: number;
}

/** A spring transition, the shape `tokens/motion.spring` has. */
export interface SpringTransition {
  type: "spring";
  stiffness: number;
  damping: number;
  mass: number;
}

/** A `whileHover` target for the "boop" spring scale — ready to pass as-is. */
export type BoopHover = {
  scale: number;
  transition: SpringTransition | InstantTransition;
};

export interface MotionPreset {
  /**
   * Whether the user prefers reduced motion — the same signal every field
   * below is resolved from. Use it to choose keyframe targets (e.g. drop a
   * slide offset from `initial`); never to choose a transition, which is
   * already resolved.
   */
  reduced: boolean;
  /** Standard UI transitions, hover states, small movements. */
  precision: EasedTransition | InstantTransition;
  /** Toggles, AI elements, high-interaction components. */
  spring: SpringTransition | InstantTransition;
  /** Larger movements — dialog entrances, card expansions. */
  springGentle: SpringTransition | InstantTransition;
  /** Brief spring scale on hover — pass to `whileHover`. At rest scale under reduced motion. */
  boop: BoopHover;
  /** Cursor-tracking tilt — a `useSpring` config, not a transition. */
  tilt: SpringOptions;
}

/* ── Constants ───────────────────────────────── */

const INSTANT: InstantTransition = { duration: 0 };

const REDUCED_PRESET: MotionPreset = {
  reduced: true,
  precision: INSTANT,
  spring: INSTANT,
  springGentle: INSTANT,
  boop: { scale: 1, transition: INSTANT },
  // Tilt has no instant form — a spring that settles in zero time is not a
  // spring. Reduced motion switches tilt off at the source instead: `useTilt`
  // returns a no-op style before it ever reads this value.
  tilt: springTilt,
};

const BOOP: BoopHover = { scale: boop.scale, transition: boop.transition };

const STANDARD_PRESET: MotionPreset = {
  reduced: false,
  precision,
  spring,
  springGentle,
  boop: BOOP,
  tilt: springTilt,
};

/**
 * Game-vibe motion: faster attack, stiffer springs, less mass. The
 * `precision` duration deliberately matches the `game` preset's
 * `--rialto-duration-standard` (0.09s) and its easing matches
 * `--rialto-ease-precision`, so a JS-driven transition and a CSS-driven one
 * under the same vibe do not disagree about how fast "standard" is.
 */
const GAME_PRESET: MotionPreset = {
  reduced: false,
  precision: { duration: 0.09, ease: [0.16, 1, 0.3, 1] as const },
  spring: { type: "spring" as const, stiffness: 600, damping: 30, mass: 0.6 },
  springGentle: { type: "spring" as const, stiffness: 320, damping: 26, mass: 0.8 },
  boop: BOOP,
  tilt: { stiffness: 500, damping: 22, mass: 0.35 },
};

/* ── Hook ────────────────────────────────────── */

/**
 * Resolves the framer-motion transition configs for the current environment.
 *
 * Returns the static presets from `tokens/motion.ts` by default, and instant
 * transitions when the user prefers reduced motion. Safe to call with or
 * without a `RialtoProvider` above it.
 */
export function useMotionPreset(): MotionPreset {
  const device = useDeviceContext();
  // Read the context directly rather than through useUIEnvironment(), which
  // throws with no provider above it. Absent context simply means the default
  // vibe — see the no-throw contract above.
  const vibe = useContext(UIEnvironmentContext)?.vibe ?? "default";

  return useMemo(() => {
    if (device.reducedMotion) return REDUCED_PRESET;
    return vibe === "game" ? GAME_PRESET : STANDARD_PRESET;
  }, [device.reducedMotion, vibe]);
}
