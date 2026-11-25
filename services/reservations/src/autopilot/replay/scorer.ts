import { harmReason, sameMove } from "./rules.js";
import type { Night, ReplayFrame } from "./types.js";

/** A harmful suggestion counts this many times in the precision denominator. */
const HARM_WEIGHT = 5;

export interface NightScore {
  nightId: string;
  suggestions: number;
  truePositives: number;
  /** Legal but unwanted: wrong move, outside its window, duplicate, or noise on a no-move night. */
  falsePositives: number;
  /** Illegal at the moment it was made (occupied/held table, size mismatch, wrong state). */
  harmful: number;
  missed: number;
  precision: number;
  recall: number;
  f1: number;
}

type Counts = Pick<
  NightScore,
  "suggestions" | "truePositives" | "falsePositives" | "harmful" | "missed"
>;

function derive(nightId: string, c: Counts): NightScore {
  const precision =
    c.suggestions === 0
      ? 1
      : c.truePositives / (c.truePositives + c.falsePositives + HARM_WEIGHT * c.harmful);
  const good = c.truePositives + c.missed;
  const recall = good === 0 ? 1 : c.truePositives / good;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { nightId, ...c, precision, recall, f1 };
}

export function scoreNight(night: Night, frames: readonly ReplayFrame[]): NightScore {
  const claimed = new Set<number>();
  let suggestions = 0;
  let truePositives = 0;
  let falsePositives = 0;
  let harmful = 0;
  for (const frame of frames) {
    for (const s of frame.suggestions) {
      suggestions += 1;
      if (harmReason(frame.state, s) !== null) {
        harmful += 1;
        continue;
      }
      const idx = night.goodMoves.findIndex(
        (m, i) =>
          !claimed.has(i) &&
          sameMove(m.suggestion, s) &&
          frame.at >= m.windowStart &&
          frame.at <= m.windowEnd
      );
      if (idx === -1) {
        falsePositives += 1;
      } else {
        claimed.add(idx);
        truePositives += 1;
      }
    }
  }
  const missed = night.goodMoves.length - truePositives;
  return derive(night.id, { suggestions, truePositives, falsePositives, harmful, missed });
}

/** Micro-average: counts are summed across nights, then precision/recall are derived once. */
export function aggregate(scores: readonly NightScore[]): NightScore {
  const sum = (pick: (s: NightScore) => number): number => scores.reduce((t, s) => t + pick(s), 0);
  return derive("aggregate", {
    suggestions: sum((s) => s.suggestions),
    truePositives: sum((s) => s.truePositives),
    falsePositives: sum((s) => s.falsePositives),
    harmful: sum((s) => s.harmful),
    missed: sum((s) => s.missed),
  });
}
