/**
 * Cold-start measurement reader for ACMM behavioral signal (issue #648).
 *
 * The actual measurement runs on a fresh GitHub Actions runner via
 * `.github/workflows/acmm-cold-start.yml`. That workflow appends a record to
 * `metrics/acmm-cold-start.json`, then opens a PR — humans review before the
 * record lands on main.
 *
 * This module just *reads* that file when an audit run happens locally,
 * surfacing the most recent measurement in the scorecard. We never measure
 * cold-start on a developer's hot-cached machine; only the CI runner does.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const COLD_START_PATH = "metrics/acmm-cold-start.json";

/**
 * @typedef {Object} ColdStartRecord
 * @property {string} ts                 ISO timestamp of measurement
 * @property {number} install_seconds
 * @property {number} test_seconds
 * @property {number} total_seconds
 * @property {boolean} test_passed
 * @property {boolean} [install_passed]
 * @property {string} [commit]           SHA the measurement was taken on
 */

/**
 * Read the metric file and return the most recent record, or null if the
 * file is missing/unreadable/empty. Non-fatal — never throws.
 *
 * @param {string} cwd
 * @returns {ColdStartRecord | null}
 */
export function loadLatestColdStart(cwd) {
  const p = join(cwd, COLD_START_PATH);
  if (!existsSync(p)) return null;
  try {
    const parsed = JSON.parse(readFileSync(p, "utf-8"));
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return normalizeRecord(parsed[parsed.length - 1]);
  } catch {
    return null;
  }
}

/**
 * Pick the latest record from an in-memory history (pure helper for tests).
 *
 * @param {ColdStartRecord[]} history
 * @returns {ColdStartRecord | null}
 */
export function latestRecord(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return normalizeRecord(history[history.length - 1]);
}

/**
 * Score a record into a traffic-light bucket.
 *
 * Thresholds derived from the issue: total <5min ✅, 5–15min ⚠️, >15min or
 * test failed ❌.
 *
 * @param {ColdStartRecord | null} rec
 * @returns {"healthy" | "watch" | "broken" | "unknown"}
 */
export function scoreColdStart(rec) {
  if (!rec) return "unknown";
  if (!rec.test_passed) return "broken";
  if (rec.total_seconds <= 5 * 60) return "healthy";
  if (rec.total_seconds <= 15 * 60) return "watch";
  return "broken";
}

function normalizeRecord(r) {
  if (!r || typeof r !== "object") return null;
  return {
    ts: String(r.ts ?? ""),
    install_seconds: Number(r.install_seconds ?? 0),
    test_seconds: Number(r.test_seconds ?? 0),
    total_seconds: Number(r.total_seconds ?? 0),
    test_passed: Boolean(r.test_passed),
    install_passed: r.install_passed === undefined ? true : Boolean(r.install_passed),
    commit: r.commit ? String(r.commit) : undefined,
  };
}
