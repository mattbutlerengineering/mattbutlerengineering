/**
 * Human-touch reason breakdown reader for the ACMM report (issue #3846,
 * part 4/4 of the human-touch-reason-telemetry chain — #3805/#3806).
 *
 * Tallies `human_touch_reason` (taxonomy from #3843, classified by #3935,
 * backfilled by #3942) across `metrics/queue-telemetry.jsonl` rows within a
 * 30-day window, so the breakdown sits next to the existing
 * `human-touch-ratio` figure with a real per-reason count instead of one
 * aggregate percentage.
 *
 * Directional signal, not ground truth: the classifier infers reasons from
 * commit-message text, CI status, and review-comment counts — never treat
 * these counts as an audited source of truth.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { HUMAN_TOUCH_REASONS } from "../../../scripts/collect-queue-telemetry.mjs";

export const QUEUE_TELEMETRY_PATH = "metrics/queue-telemetry.jsonl";
const WINDOW_DAYS = 30;

/**
 * @typedef {Object} ReasonBreakdown
 * @property {Record<string, number>} counts  taxonomy reason -> count in window
 * @property {number} total                   sum of counts
 */

/**
 * Pure compute over parsed telemetry rows.
 *
 * @param {Array<{human_touch_reason?: string, merged_at?: string|null, claimed_at?: string}>} rows
 * @param {{ now?: Date, windowDays?: number }} [opts]
 * @returns {ReasonBreakdown | null} null when no reasoned rows fall in the window
 */
export function computeReasonBreakdown(rows, opts = {}) {
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - (opts.windowDays ?? WINDOW_DAYS) * 24 * 60 * 60 * 1000;

  const counts = Object.fromEntries(HUMAN_TOUCH_REASONS.map((r) => [r, 0]));
  let total = 0;

  for (const row of rows ?? []) {
    if (!row || typeof row.human_touch_reason !== "string") continue;
    if (!HUMAN_TOUCH_REASONS.includes(row.human_touch_reason)) continue;
    const ts = Date.parse(row.merged_at ?? row.claimed_at ?? "");
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    counts[row.human_touch_reason] += 1;
    total += 1;
  }

  return total === 0 ? null : { counts, total };
}

/**
 * Read `metrics/queue-telemetry.jsonl` and compute the breakdown. Non-fatal —
 * returns null on any missing/unreadable/empty file, mirroring
 * `loadLatestColdStart` in `cold-start.js`.
 *
 * @param {string} cwd
 * @returns {ReasonBreakdown | null}
 */
export function loadReasonBreakdown(cwd) {
  const p = join(cwd, QUEUE_TELEMETRY_PATH);
  if (!existsSync(p)) return null;
  try {
    const rows = readFileSync(p, "utf-8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return computeReasonBreakdown(rows);
  } catch {
    return null;
  }
}
