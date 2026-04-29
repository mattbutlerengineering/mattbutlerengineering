/**
 * ACMM evals reader.
 *
 * Reads `metrics/acmm-evals.jsonl` and aggregates pass rate, median cost,
 * median turns, and per-model breakdown over a rolling window.
 *
 * Wired into `audit.js` (when other behavioral PRs land) as
 * `state.behavioral.evals`. Until then, stand-alone reader callable from
 * `scripts/acmm/evals/index.js --report`.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PATH = "metrics/acmm-evals.jsonl";

/**
 * @typedef {Object} EvalsSummary
 * @property {number}  n                  Runs in the window
 * @property {number}  passRate           0..1
 * @property {number}  medianScore        0..1
 * @property {number|null} medianCostUsd
 * @property {number|null} medianTurns
 * @property {number}  windowDays
 * @property {string|null} lastRun        ISO timestamp of most recent run
 * @property {Record<string, { n: number, passRate: number, medianScore: number }>} perModel
 * @property {"green"|"yellow"|"red"|"unknown"} status
 */

/**
 * Aggregate eval results from JSONL.
 * @param {string} cwd
 * @param {{ path?: string, windowDays?: number, now?: Date }} [opts]
 * @returns {EvalsSummary}
 */
export function measureEvals(cwd, opts = {}) {
  const path = join(cwd, opts.path ?? DEFAULT_PATH);
  const windowDays = opts.windowDays ?? 30;
  const now = opts.now ?? new Date();

  if (!existsSync(path)) return emptySummary(windowDays);

  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const lines = readFileSync(path, "utf-8").split("\n").filter((l) => l.trim().length > 0);

  /** @type {import("./evals/schema.js").EvalResult[]} */
  const runs = [];
  for (const line of lines) {
    try {
      const r = JSON.parse(line);
      const ts = Date.parse(r.timestamp);
      if (Number.isNaN(ts) || ts < cutoff) continue;
      runs.push(r);
    } catch {
      // skip malformed line
    }
  }

  if (runs.length === 0) return emptySummary(windowDays);

  const passes = runs.filter((r) => r.success).length;
  const passRate = round4(passes / runs.length);
  const medianScore = round4(median(runs.map((r) => r.score)));
  const costs = runs.map((r) => r.costUsd).filter((c) => typeof c === "number");
  const turns = runs.map((r) => r.numTurns).filter((t) => typeof t === "number");
  const lastRun = runs.reduce(
    (latest, r) => (r.timestamp > latest ? r.timestamp : latest),
    /** @type {string} */ (runs[0].timestamp),
  );

  /** @type {Record<string, import("./evals/schema.js").EvalResult[]>} */
  const byModel = {};
  for (const r of runs) {
    (byModel[r.model] ??= []).push(r);
  }
  const perModel = Object.fromEntries(
    Object.entries(byModel).map(([model, rs]) => [
      model,
      {
        n: rs.length,
        passRate: round4(rs.filter((r) => r.success).length / rs.length),
        medianScore: round4(median(rs.map((r) => r.score))),
      },
    ]),
  );

  return {
    n: runs.length,
    passRate,
    medianScore,
    medianCostUsd: costs.length > 0 ? round4(median(/** @type {number[]} */ (costs))) : null,
    medianTurns: turns.length > 0 ? round4(median(/** @type {number[]} */ (turns))) : null,
    windowDays,
    lastRun,
    perModel,
    status: gradeStatus(passRate, runs.length),
  };
}

/**
 * @param {number} windowDays
 * @returns {EvalsSummary}
 */
function emptySummary(windowDays) {
  return {
    n: 0,
    passRate: 0,
    medianScore: 0,
    medianCostUsd: null,
    medianTurns: null,
    windowDays,
    lastRun: null,
    perModel: {},
    status: "unknown",
  };
}

/**
 * @param {number} passRate
 * @param {number} n
 * @returns {"green"|"yellow"|"red"|"unknown"}
 */
function gradeStatus(passRate, n) {
  if (n < 3) return "unknown"; // not enough signal
  if (passRate >= 0.8) return "green";
  if (passRate >= 0.5) return "yellow";
  return "red";
}

/** @param {number} n */
function round4(n) {
  return Math.round(n * 10000) / 10000;
}

/**
 * @param {number[]} xs
 * @returns {number}
 */
function median(xs) {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
