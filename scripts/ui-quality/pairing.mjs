/**
 * pairing.mjs — the pairwise primitives shared by the rater's fire-time pairs
 * (`rate.mjs pairs | record`) and its calibration pairs (`calibration.mjs`):
 * which side is "A", and what a verdict means for ours.
 */

import { createHash } from "node:crypto";

export const VERDICTS = ["A", "B", "tie"];

/** Both sides of every rated or calibration pair are a viewport-only image of exactly this size. */
export const FOLD_VIEWPORT = "1280x720";

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/** "AB" (ours is A) when sha256(key)'s first byte is even, else "BA". */
export function positionOf(key) {
  return parseInt(sha256(key).slice(0, 2), 16) % 2 === 0 ? "AB" : "BA";
}

/** A pair's `position`, `a` and `b` from its key and its two images. */
export function sides(key, ours, reference) {
  const position = positionOf(key);
  const [a, b] = position === "AB" ? [ours, reference] : [reference, ours];
  return { position, a, b };
}

/** ours | tie | reference, from the verdict and which side ours was on. */
export function outcomeOf(pair, verdict) {
  if (verdict === "tie") return "tie";
  return (verdict === "A") === (pair.position === "AB") ? "ours" : "reference";
}
