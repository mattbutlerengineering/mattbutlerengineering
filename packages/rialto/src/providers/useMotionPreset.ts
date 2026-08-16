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

import { useMemo } from "react";
import { useDeviceContext } from "./useDeviceContext";
import { precision, spring, springGentle } from "../tokens/motion";

/* ── Types ───────────────────────────────────── */

/** An instant transition — the reduced-motion form of every preset. */
export interface InstantTransition {
  duration: 0;
}

export interface MotionPreset {
  /** Standard UI transitions, hover states, small movements. */
  precision: typeof precision | InstantTransition;
  /** Toggles, AI elements, high-interaction components. */
  spring: typeof spring | InstantTransition;
  /** Larger movements — dialog entrances, card expansions. */
  springGentle: typeof springGentle | InstantTransition;
}

/* ── Constants ───────────────────────────────── */

const INSTANT: InstantTransition = { duration: 0 };

const REDUCED_PRESET: MotionPreset = {
  precision: INSTANT,
  spring: INSTANT,
  springGentle: INSTANT,
};

const STANDARD_PRESET: MotionPreset = { precision, spring, springGentle };

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
  return useMemo(
    () => (device.reducedMotion ? REDUCED_PRESET : STANDARD_PRESET),
    [device.reducedMotion]
  );
}
