/**
 * Pure helper functions for the optimize-implement-queue daily skill.
 *
 * Responsibilities:
 *   - Build a process-metrics JSONL entry from a queueEfficiency sensor result.
 *   - Build a human-readable dated log entry for .claude/improvement-loop/log.md.
 *   - Build a regression issue body for GitHub issue creation.
 *   - Decide whether a flagged regression is real (difficulty-normalized check).
 *   - Append a log entry to the improvement-loop log (DI: dryRun flag).
 *
 * All functions are pure (except appendLogEntry which is DI-gated on dryRun).
 * No side effects — callers control all I/O.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ── Pure helpers ──────────────────────────────────────────────────────────────

/**
 * Difficulty-normalization threshold.
 * When >80% of merged PRs are size:xl the expected composite is lower — we
 * require a larger regression delta before treating it as real.
 */
const XL_DOMINANT_THRESHOLD = 0.8;
const XL_DOMINANT_MIN_COMPOSITE_DROP = 0.1;

/**
 * Compute the fraction of merged PRs that are size:xl.
 *
 * @param {Record<string, { count: number }>} distribution
 * @returns {number} 0–1
 */
function xlFraction(distribution) {
  if (!distribution || Object.keys(distribution).length === 0) return 0;
  const totalCount = Object.values(distribution).reduce((s, t) => s + (t.count ?? 0), 0);
  if (totalCount === 0) return 0;
  const xlCount = distribution["size:xl"]?.count ?? 0;
  return xlCount / totalCount;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a process-metrics JSONL entry from a queueEfficiency sensor result.
 * This entry is appended to the process-metrics store.
 *
 * @param {string} date - ISO date (YYYY-MM-DD)
 * @param {{ available: boolean, composite?: number, sub_metrics?: object, regressions?: Array }} sensorResult
 * @returns {object}
 */
export function buildQueueEfficiencyProcessEntry(date, sensorResult) {
  if (!sensorResult?.available) {
    return { date, sensor: "queueEfficiency", available: false };
  }

  return {
    date,
    sensor: "queueEfficiency",
    available: true,
    composite: sensorResult.composite ?? null,
    sub_metrics: sensorResult.sub_metrics ?? null,
    regression_count: (sensorResult.regressions ?? []).length,
  };
}

/**
 * Build a dated markdown log entry for .claude/improvement-loop/log.md.
 *
 * @param {string} date - ISO date (YYYY-MM-DD)
 * @param {{ available: boolean, composite?: number, regressions?: Array, distribution?: object, baseline?: object }} sensorResult
 * @param {number} issueCount - number of issues filed this run
 * @returns {string}
 */
export function buildOptimizeLogEntry(date, sensorResult, issueCount) {
  const lines = [`## ${date}`];
  lines.push("");

  if (!sensorResult?.available) {
    lines.push("**queueEfficiency:** unavailable");
    lines.push(`**Issues filed:** 0`);
    lines.push("");
    return lines.join("\n");
  }

  const regressions = sensorResult.regressions ?? [];
  const status =
    regressions.length === 0 ? "healthy" : `${regressions.length} regression(s) detected`;
  const composite = sensorResult.composite != null ? sensorResult.composite.toFixed(3) : "n/a";
  const baseline =
    sensorResult.baseline?.composite_median != null
      ? sensorResult.baseline.composite_median.toFixed(3)
      : "n/a";

  lines.push(`**queueEfficiency:** composite ${composite} (baseline ${baseline}) — ${status}`);

  const dist = sensorResult.distribution ?? {};
  const tierSummary = Object.entries(dist)
    .map(([tier, info]) => `${tier}:${info.count}`)
    .join(", ");
  if (tierSummary) {
    lines.push(`**Difficulty distribution:** ${tierSummary}`);
  }

  lines.push(`**Issues filed:** ${issueCount}`);

  if (regressions.length > 0) {
    lines.push("**Regressions:**");
    for (const r of regressions) {
      lines.push(
        `  - ${r.metric}: ${r.current} (was ${r.baseline ?? "n/a"}, Δ${r.delta ?? ""}) [${r.severity}]`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Build a GitHub issue body for a queue-efficiency regression.
 * Body follows the learning-loop issue format: self-contained acceptance criteria.
 *
 * @param {{ sensor: string, metric: string, current: number, baseline?: number, delta?: number, severity: string }} regression
 * @param {{ sub_metrics?: object, distribution?: object }} sensorResult
 * @returns {string}
 */
export function buildRegressionIssueBody(regression, sensorResult) {
  const dist = sensorResult?.distribution ?? {};
  const tierRows = Object.entries(dist)
    .map(
      ([tier, info]) => `| ${tier} | ${info.count} | ${info.avg_commits} | ${info.avg_ttm_hours}h |`
    )
    .join("\n");

  const distSection = tierRows
    ? `\n## Difficulty Distribution (Goodhart guard)\n\n| Tier | Count | Avg commits | Avg TTM |\n|------|-------|-------------|--------|\n${tierRows}\n`
    : "";

  return `## Regression Detected

**Sensor:** ${regression.sensor}
**Metric:** ${regression.metric}
**Current:** ${regression.current}
**Baseline:** ${regression.baseline ?? "n/a"}
**Delta:** ${regression.delta ?? "n/a"}
**Severity:** ${regression.severity}
${distSection}
## Acceptance Criteria

- [ ] \`${regression.metric}\` returns to baseline level or better (≥ ${regression.baseline ?? "previous value"})
- [ ] Verified by next optimize-implement-queue run (composite regression clears)
- [ ] Root cause identified (agent/prompt quality vs harder issues; use async eval to distinguish)

## Notes

- **Do NOT** run \`mbe agent eval\` synchronously — file a separate \`eval\` task if agent/prompt quality is suspected
- Difficulty-normalization is applied: regressions driven by size:xl-heavy weeks require a larger drop to flag
- Phase-2 auto-tuning (guard-railed model-routing tier adjustment via \`scripts/threshold-tuner.mjs\`) is NOT yet built — manual review required for now

_Detected by [optimize-implement-queue](../../.claude/skills/optimize-implement-queue/SKILL.md) daily skill_`;
}

/**
 * Decide whether a queueEfficiency sensor result represents a real regression,
 * accounting for difficulty normalization.
 *
 * Difficulty-normalization rule:
 *   If >80% of merged PRs in the current window are size:xl, the expected
 *   composite score is lower. We require a composite drop > 10% (not just
 *   the default 5%) before treating it as a real regression.
 *
 * @param {{ available: boolean, regressions?: Array, distribution?: object, composite?: number, baseline?: object }} sensorResult
 * @returns {boolean}
 */
export function isRealRegression(sensorResult) {
  if (!sensorResult?.available) return false;
  const regressions = sensorResult.regressions ?? [];
  if (regressions.length === 0) return false;

  // Check difficulty normalization: if xl-dominant, require larger composite drop.
  const xl = xlFraction(sensorResult.distribution ?? {});
  if (xl > XL_DOMINANT_THRESHOLD) {
    const compositeRegression = regressions.find((r) => r.metric === "composite");
    if (compositeRegression) {
      const dropMagnitude = Math.abs(compositeRegression.delta ?? 0);
      // Only flag if the drop exceeds the normalized threshold.
      if (dropMagnitude < XL_DOMINANT_MIN_COMPOSITE_DROP) return false;
    }
  }

  return true;
}

/**
 * Append a log entry to the improvement-loop log file.
 * Creates parent directories if they don't exist.
 * In dry-run mode, does nothing.
 *
 * @param {string} logPath - Absolute path to the log file.
 * @param {string} entry - Markdown text to append.
 * @param {boolean} dryRun - If true, skip all file writes.
 */
export function appendLogEntry(logPath, entry, dryRun) {
  if (dryRun) return;

  mkdirSync(dirname(logPath), { recursive: true });

  if (existsSync(logPath)) {
    // Read current content to check if we need a separator.
    const current = readFileSync(logPath, "utf-8");
    // Ensure entries are separated by a blank line.
    const separator = current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
    appendFileSync(logPath, separator + entry);
  } else {
    writeFileSync(logPath, entry, "utf-8");
  }
}
