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

export function passesBar(score: NightScore): boolean {
  return (
    score.precision >= PASS_BAR.minPrecision &&
    score.recall >= PASS_BAR.minRecall &&
    score.harmful <= PASS_BAR.maxHarmful
  );
}
