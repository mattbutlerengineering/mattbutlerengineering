import type { NightScore } from "./scorer.js";

/**
 * The bar a proposer must clear on the aggregate of every night before anything
 * may surface its suggestions to a host. See docs/autopilot-night-replay.md.
 */
export const PASS_BAR = {
  minPrecision: 0.9,
  minRecall: 0.75,
  /** One illegal suggestion in a whole replay is a failure. */
  maxHarmful: 0,
} as const;

/** The pooled bar: precision, recall and harm on the aggregate of every night. */
export function passesBar(score: NightScore): boolean {
  return (
    score.precision >= PASS_BAR.minPrecision &&
    score.recall >= PASS_BAR.minRecall &&
    score.harmful <= PASS_BAR.maxHarmful
  );
}

/**
 * The per-night rule. A night with no good moves (nothing claimed, nothing missed)
 * must see zero suggestions, so a noisy proposer cannot hide in pooled counts.
 */
export function passesNightBar(score: NightScore): boolean {
  const hasGoodMoves = score.truePositives + score.missed > 0;
  return hasGoodMoves || score.suggestions === 0;
}
