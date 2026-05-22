/**
 * Pure rubric scorer for an eval run.
 *
 * Given a task fixture and a normalized session outcome, return a
 * weighted score in [0, 1] plus a breakdown of which checks passed.
 * Deterministic — no agent calls, no I/O. Easy to unit-test.
 */

import { DEFAULT_WEIGHTS, PASS_THRESHOLD } from "./schema.js";

/**
 * @typedef {Object} SessionOutcome
 * @property {boolean} completed                Session reached a terminal state without error
 * @property {"pass"|"fail"|"skip"} verification  Aggregate result of mustPass gates
 * @property {number} diffSize                  Total changed lines (additions + deletions)
 * @property {string[]} touchedFiles            File paths the agent modified
 * @property {string[]} calledTools             Tools the agent invoked
 *
 * @typedef {Object} ScoreOutput
 * @property {number}  score
 * @property {boolean} success
 * @property {import("./schema.js").ScoreBreakdown} breakdown
 */

/**
 * @param {import("./schema.js").TaskFixture} task
 * @param {SessionOutcome} outcome
 * @returns {ScoreOutput}
 */
export function scoreRun(task, outcome) {
  const weights = { ...DEFAULT_WEIGHTS, ...(task.rubric.weights ?? {}) };

  const breakdown = {
    completed: outcome.completed,
    verification: outcome.verification,
    diffSize: outcome.diffSize,
    diffSizeOk: outcome.diffSize <= task.rubric.diffSizeMax,
    touchedRequired: matchesAll(task.rubric.mustTouch, outcome.touchedFiles),
    avoidedForbidden: !matchesAny(task.rubric.mustNotTouch ?? [], outcome.touchedFiles),
    calledRequired: matchesAll(task.rubric.mustCall ?? [], outcome.calledTools ?? []),
    avoidedForbiddenCalls: !matchesAny(task.rubric.mustNotCall ?? [], outcome.calledTools ?? []),
  };

  // Weighted contribution per criterion (each yields 0 or 1, then weighted sum is normalized)
  const checks = [
    { weight: weights.completed, pass: breakdown.completed },
    { weight: weights.verification, pass: breakdown.verification === "pass" },
    { weight: weights.diffSize, pass: breakdown.diffSizeOk },
    { weight: weights.filePaths, pass: breakdown.touchedRequired && breakdown.avoidedForbidden },
    {
      weight: weights.toolCalls,
      pass: breakdown.calledRequired && breakdown.avoidedForbiddenCalls,
    },
  ];

  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earned = checks.reduce((sum, c) => sum + (c.pass ? c.weight : 0), 0);
  const score = totalWeight > 0 ? earned / totalWeight : 0;

  return {
    score: Math.round(score * 10000) / 10000,
    success: score >= PASS_THRESHOLD,
    breakdown,
  };
}

/**
 * @param {string[]} required
 * @param {string[]} touched
 */
function matchesAll(required, touched) {
  return required.every((p) => touched.some((f) => f.includes(p)));
}

/**
 * @param {string[]} forbidden
 * @param {string[]} touched
 */
function matchesAny(forbidden, touched) {
  return forbidden.some((p) => touched.some((f) => f.includes(p)));
}
