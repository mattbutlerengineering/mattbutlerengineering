/**
 * ACMM state file — remembers last run, per-check pass/fail, per-check issue numbers
 * (for dedup), and a trend history.
 *
 * Lives at <cwd>/.claude/acmm/state.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * @typedef {Object} HistoryEntry
 * @property {string} date      ISO date (YYYY-MM-DD)
 * @property {number} level     0..6
 * @property {number} detected  number of criteria detected
 * @property {number} total     total criteria evaluated
 *
 * @typedef {Object} State
 * @property {string} lastRun             ISO timestamp of last `audit.js` run
 * @property {number} currentLevel        0..6
 * @property {string} [levelName]         human-readable level name
 * @property {string} [role]              role at this level (Executor, Rule-writer, …)
 * @property {Record<string, { passed: boolean, evidence: string }>} checks
 * @property {string[]} [detectedIds]     flat list of detected criterion IDs
 * @property {object} [computation]       full computeLevel output
 * @property {HistoryEntry[]} history
 * @property {Record<string, number>} issuesCreated   criterionId → GitHub issue number
 * @property {Behavioral} [behavioral]                behavioral signals beyond path-existence
 *
 * @typedef {Object} Behavioral
 * @property {FlakeSnapshot | null} [flake]           CI signal quality
 * @property {AgentPrSnapshot | null} [agent_pr]      agent PR outcomes (last 30 days)
 *
 * @typedef {Object} FlakeSnapshot
 * @property {number} rate_30d        ratio in [0, 1] of SHAs that flipped outcome
 * @property {number} sample_size     distinct SHAs in the 30-day window
 * @property {string[]} flaky_shas    SHAs that flipped at least once
 * @property {string} measured_at     ISO timestamp of measurement
 *
 * @typedef {Object} AgentPrSnapshot
 * @property {number} sample_size
 * @property {number} merged_count
 * @property {number} closed_unmerged_count
 * @property {number} open_count
 * @property {number} acceptance_rate_30d        ratio in [0, 1]
 * @property {number} revert_rate_30d            ratio in [0, 1]
 * @property {number} median_time_to_merge_hours
 * @property {number} human_touch_ratio          merged-with-human-commit / merged
 * @property {boolean} insufficient_data         true when sample_size < threshold
 * @property {string} measured_at                ISO timestamp
 */

export const STATE_DIR = ".claude/acmm";
export const STATE_PATH = `${STATE_DIR}/state.json`;

/** @returns {State} Fresh empty state shape. */
export function emptyState() {
  return {
    lastRun: "",
    currentLevel: 0,
    checks: {},
    history: [],
    issuesCreated: {},
  };
}

/**
 * Load the state file from `<cwd>/.claude/acmm/state.json`.
 * Returns an empty state if the file doesn't exist or is unreadable.
 * @param {string} cwd
 * @returns {State}
 */
export function loadState(cwd) {
  const p = join(cwd, STATE_PATH);
  if (!existsSync(p)) return emptyState();
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    // Merge to forward-compat fields
    return { ...emptyState(), ...parsed };
  } catch { return emptyState(); }
}

/**
 * Persist state to `<cwd>/.claude/acmm/state.json` (creating parent dirs).
 * @param {string} cwd
 * @param {State} state
 */
export function saveState(cwd, state) {
  const p = join(cwd, STATE_PATH);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

/**
 * Append today's result to `state.history`, keeping one entry per ISO date
 * (overwrites if another run happens the same day).
 * @param {State} state
 * @param {number} level
 * @param {number} detected
 * @param {number} total
 * @returns {State}
 */
export function recordHistory(state, level, detected, total) {
  const date = new Date().toISOString().slice(0, 10);
  const history = state.history.filter((h) => h.date !== date);
  history.push({ date, level, detected, total });
  history.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { ...state, history };
}
