#!/usr/bin/env node

/**
 * ACMM audit runner.
 *
 * Usage:
 *   node scripts/acmm/audit.js                     # dry run — write state + report, no issues, no badge
 *   node scripts/acmm/audit.js --apply             # + create deduplicated GitHub issues for gaps
 *   node scripts/acmm/audit.js --badge             # + rewrite README badge
 *   node scripts/acmm/audit.js --apply --badge     # full run (what scheduled triggers call)
 *   node scripts/acmm/audit.js --trend             # print history only, don't re-check
 *
 * Exit code: 0 on completion regardless of level (diagnostic, not gating).
 */

import { CHECKS, computeLevel, byDimension } from "./rubric.js";
import { RUNNERS } from "./checks.js";
import { loadState, saveState, recordHistory } from "./state.js";
import { writeReport } from "./outputs/report.js";
import { updateBadge } from "./outputs/badge.js";
import { applyIssuesForFailures, ensureAcmmLabel } from "./outputs/issues.js";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const BADGE = args.has("--badge");
const TREND = args.has("--trend");
const cwd = process.cwd();

/* ── --trend mode: just print history and exit ─────────── */
if (TREND) {
  const state = loadState(cwd);
  if (state.history.length === 0) {
    console.log("ACMM: no history yet. Run `/acmm-audit` to seed it.");
    process.exit(0);
  }
  console.log("ACMM trend:");
  console.log("  Date        Level  Passed");
  for (const h of state.history) {
    console.log(`  ${h.date}  L${h.level}     ${h.passed}/${h.total}`);
  }
  process.exit(0);
}

/* ── Run all checks in parallel ──────────────────────────── */
const startedAt = Date.now();
const prior = loadState(cwd);

/** @type {Record<string, { passed: boolean, evidence: string }>} */
const results = {};
await Promise.all(
  CHECKS.map(async (c) => {
    const runner = RUNNERS[c.id];
    if (!runner) {
      results[c.id] = { passed: false, evidence: `no runner for ${c.id} (rubric/checks out of sync)` };
      return;
    }
    try {
      results[c.id] = await runner(cwd);
    } catch (err) {
      results[c.id] = { passed: false, evidence: `runner threw: ${err instanceof Error ? err.message : String(err)}` };
    }
  }),
);

/* ── Score ───────────────────────────────────────────────── */
const passedCount = Object.values(results).filter((r) => r.passed).length;
const totalCount = CHECKS.length;
const passedMap = Object.fromEntries(Object.entries(results).map(([id, r]) => [id, r.passed]));
const level = computeLevel(passedMap);

let nextState = {
  ...prior,
  lastRun: new Date().toISOString(),
  currentLevel: level,
  checks: results,
};
nextState = recordHistory(nextState, level, passedCount, totalCount);

/* ── Write state + report ────────────────────────────────── */
saveState(cwd, nextState);
const reportPath = writeReport(cwd, { state: nextState, checks: CHECKS });

/* ── Optionally: --badge ─────────────────────────────────── */
let badgeOutcome = "skipped";
if (BADGE) badgeOutcome = updateBadge(cwd, level);

/* ── Optionally: --apply (issues) ───────────────────────── */
let applyResult = null;
if (APPLY) {
  try {
    ensureAcmmLabel();
    const failing = CHECKS.filter((c) => !results[c.id]?.passed);
    applyResult = applyIssuesForFailures(failing, prior.issuesCreated || {});
    saveState(cwd, { ...nextState, issuesCreated: applyResult.issuesCreated });
  } catch (err) {
    console.error(`--apply failed: ${err instanceof Error ? err.message : String(err)}`);
    applyResult = { createdCount: 0, skippedOpen: 0, issuesCreated: prior.issuesCreated || {}, error: true };
  }
}

/* ── Console summary ─────────────────────────────────────── */
const grouped = byDimension(CHECKS);
const gapCount = totalCount - passedCount;
console.log("");
console.log(`ACMM Level ${level}  ·  ${passedCount}/${totalCount} passing  ·  ${gapCount} gap${gapCount === 1 ? "" : "s"}`);
console.log("");
for (const [dim, dimChecks] of Object.entries(grouped)) {
  const dimPassed = dimChecks.filter((c) => results[c.id]?.passed).length;
  const firstGap = dimChecks.find((c) => !results[c.id]?.passed);
  const mark = dimPassed === dimChecks.length ? "✓" : "·";
  const trail = firstGap ? `  (next gap: ${firstGap.id} — ${firstGap.description})` : "";
  console.log(`  ${mark} ${dim.padEnd(12)} ${dimPassed}/${dimChecks.length}${trail}`);
}

console.log("");
console.log(`report: ${reportPath}`);
if (BADGE) console.log(`badge:  ${badgeOutcome}`);
if (APPLY && applyResult) {
  console.log(`issues: created ${applyResult.createdCount}, skipped-open ${applyResult.skippedOpen}`);
}
if (!APPLY && gapCount > 0) {
  console.log("");
  console.log("Run with --apply to file GitHub issues for the gaps (ship-loop will pick them up).");
}

const durationMs = Date.now() - startedAt;
console.log(`\ndone in ${durationMs}ms`);
