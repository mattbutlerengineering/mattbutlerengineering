/**
 * Human-touch reason breakdown reader for the ACMM report (issue #3846,
 * part 4/4 of the human-touch-reason-telemetry chain — #3805/#3806), widened
 * in #4395 (part 5/5 of the classifier-widening chain — proposal #4324,
 * following #4391-#4394) to surface the `lint-fixup` /
 * `generated-artifact-regen` / `ci-rerun` categories those issues added to
 * the taxonomy, and to give the breakdown its own "actionable" framing now
 * that `other` is expected to be a minority rather than the dominant bucket.
 *
 * Tallies `human_touch_reason` (taxonomy from #3843, classified by #3935,
 * backfilled by #3942/#4470) across `metrics/queue-telemetry.jsonl` rows
 * within a 30-day window, so the breakdown sits next to the existing
 * `human-touch-ratio` figure with a real per-reason count instead of one
 * aggregate percentage.
 *
 * Directional signal, not ground truth: the classifier infers reasons from
 * commit-message text, CI status, and review-comment counts — never treat
 * these counts as an audited source of truth.
 *
 * This module deliberately does not touch the L6 human-touch-ratio gate
 * (`computeLevel.js`'s 50% threshold) — that gate measures a different
 * thing (share of merged PRs with any non-author commit) and is an
 * explicit non-goal of #4324.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HUMAN_TOUCH_REASONS } from "../../../scripts/collect-queue-telemetry.mjs";

export const QUEUE_TELEMETRY_PATH = "metrics/queue-telemetry.jsonl";
const WINDOW_DAYS = 30;
// Below this share, "other" is a minority of reasoned touches and the
// breakdown is actionable (a real target exists for the next optimization
// pass); at or above it, "other" still dominates and the breakdown isn't
// actionable yet.
const OTHER_MINORITY_THRESHOLD = 0.5;

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

/**
 * Pure text formatter for the reason breakdown — used by the CLI entry
 * point below, and directly unit-tested. Lists every non-zero taxonomy
 * category (widened in #4391-#4394 to include `lint-fixup` /
 * `generated-artifact-regen` / `ci-rerun`) in taxonomy order, then frames
 * whether the breakdown is actionable based on `other`'s share — not on the
 * assumption (true when this module shipped, #3846) that `other` dominates.
 *
 * @param {ReasonBreakdown | null} breakdown
 * @returns {string}
 */
export function formatReasonBreakdownReport(breakdown) {
  if (!breakdown) {
    return "Human-touch reason breakdown: no data in the last 30 days.";
  }

  const lines = [`Human-touch reason breakdown (30d, n=${breakdown.total}):`];
  for (const reason of HUMAN_TOUCH_REASONS) {
    const count = breakdown.counts[reason] ?? 0;
    if (count === 0) continue;
    const pct = ((count / breakdown.total) * 100).toFixed(0);
    lines.push(`  ${reason}: ${count} (${pct}%)`);
  }

  const otherShare = (breakdown.counts.other ?? 0) / breakdown.total;
  const otherPct = (otherShare * 100).toFixed(0);
  lines.push(
    otherShare < OTHER_MINORITY_THRESHOLD
      ? `other is a minority (${otherPct}%) — breakdown is actionable, most touches have a diagnosed reason.`
      : `other still dominates (${otherPct}%) — breakdown is not yet actionable, classifier heuristics need more coverage.`
  );

  return lines.join("\n");
}

/**
 * CLI entry point. Only runs when this file is executed directly (`node
 * plugins/acmm/scripts/human-touch-reasons.js`) — imported use (report.js,
 * tests) never triggers it.
 */
function main() {
  const breakdown = loadReasonBreakdown(process.cwd());
  console.log(formatReasonBreakdownReport(breakdown));
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
