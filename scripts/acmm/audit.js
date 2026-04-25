#!/usr/bin/env node

/**
 * ACMM audit runner — canonical 6-level model.
 *
 * Ports the criterion catalog from kubestellar/console:
 *   web/src/lib/acmm/sources/{acmm,fullsend,agentic-engineering-framework,claude-reflect}.ts
 *
 * Usage:
 *   node scripts/acmm/audit.js                     # dry run — write state + report
 *   node scripts/acmm/audit.js --apply             # + create deduplicated GitHub issues for gaps
 *   node scripts/acmm/audit.js --badge             # + rewrite README badge
 *   node scripts/acmm/audit.js --apply --badge     # full run (what scheduled triggers call)
 *   node scripts/acmm/audit.js --trend             # print history only
 *
 * Exit code: 0 on completion regardless of level (diagnostic, not gating).
 */

import { ALL_CRITERIA, SOURCES } from "./sources/index.js";
import { detectAll } from "./detection.js";
import { computeLevel } from "./computeLevel.js";
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
  console.log("  Date        Level  Detected");
  for (const h of state.history) {
    console.log(`  ${h.date}  L${h.level}     ${h.detected}/${h.total}`);
  }
  process.exit(0);
}

/* ── Run detection on all 85 criteria ──────────────────── */
const startedAt = Date.now();
const prior = loadState(cwd);
const detectedIds = detectAll(cwd, ALL_CRITERIA);
const computation = computeLevel(detectedIds);
const detectedCount = detectedIds.size;
const totalCount = ALL_CRITERIA.length;

/* ── Build per-criterion results map (id → {passed, evidence}) ── */
const results = {};
for (const c of ALL_CRITERIA) {
  const passed = detectedIds.has(c.id);
  const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
  results[c.id] = {
    passed,
    evidence: passed ? `detected at one of: ${patterns.join(", ")}` : `none of: ${patterns.join(", ")}`,
  };
}

const nextState = recordHistory(
  {
    ...prior,
    lastRun: new Date().toISOString(),
    currentLevel: computation.level,
    levelName: computation.levelName,
    role: computation.role,
    checks: results,
    detectedIds: [...detectedIds],
    computation,
  },
  computation.level,
  detectedCount,
  totalCount,
);

/* ── Write state + report ────────────────────────────────── */
saveState(cwd, nextState);
const reportPath = writeReport(cwd, { state: nextState, criteria: ALL_CRITERIA, sources: SOURCES, computation });

/* ── Optionally: --badge ─────────────────────────────────── */
let badgeOutcome = "skipped";
if (BADGE) badgeOutcome = updateBadge(cwd, computation.level);

/* ── Optionally: --apply (issues for gaps in next level) ── */
let applyResult = null;
if (APPLY) {
  try {
    ensureAcmmLabel();
    // File issues only for criteria gating the NEXT level — avoids issue spam
    // for L5/L6 items when we're still climbing L3.
    const failingForNext = computation.missingForNextLevel;
    applyResult = applyIssuesForFailures(failingForNext, prior.issuesCreated || {});
    saveState(cwd, { ...nextState, issuesCreated: applyResult.issuesCreated });
  } catch (err) {
    console.error(`--apply failed: ${err instanceof Error ? err.message : String(err)}`);
    applyResult = { createdCount: 0, skippedOpen: 0, issuesCreated: prior.issuesCreated || {}, error: true };
  }
}

/* ── Console summary ─────────────────────────────────────── */
console.log("");
console.log(`ACMM Level ${computation.level} (${computation.levelName})  ·  ${detectedCount}/${totalCount} criteria detected`);
console.log(`Role: ${computation.role}`);
console.log("");
console.log("Per-level detection (scannable):");
for (const n of [2, 3, 4, 5, 6]) {
  const req = computation.requiredByLevel[n] ?? 0;
  const det = computation.detectedByLevel[n] ?? 0;
  const pct = req > 0 ? Math.round((det / req) * 100) : 0;
  const passed = pct >= 70 || (n === 2 && det >= 1);
  const mark = computation.level >= n ? "✓" : passed ? "·" : " ";
  console.log(`  ${mark} L${n}: ${det}/${req} (${pct}%)`);
}
console.log("");
console.log(`Prerequisites (soft): ${computation.prerequisites.met}/${computation.prerequisites.total}`);
console.log(`Cross-cutting learning: ${computation.crossCutting.learning.met}/${computation.crossCutting.learning.total}`);
console.log(`Cross-cutting traceability: ${computation.crossCutting.traceability.met}/${computation.crossCutting.traceability.total}`);

if (computation.nextTransitionTrigger) {
  console.log("");
  console.log(`Next: ${computation.nextTransitionTrigger}`);
  console.log(`Missing for next level (${computation.missingForNextLevel.length}):`);
  for (const c of computation.missingForNextLevel.slice(0, 6)) {
    console.log(`  • ${c.id} — ${c.name}`);
  }
  if (computation.missingForNextLevel.length > 6) {
    console.log(`  … ${computation.missingForNextLevel.length - 6} more`);
  }
}

console.log("");
console.log(`report: ${reportPath}`);
if (BADGE) console.log(`badge:  ${badgeOutcome}`);
if (APPLY && applyResult) {
  console.log(`issues: created ${applyResult.createdCount}, skipped-open ${applyResult.skippedOpen}`);
}
if (!APPLY && computation.missingForNextLevel.length > 0) {
  console.log("");
  console.log("Run with --apply to file GitHub issues for the next-level gaps (ship-loop will pick them up).");
}

const durationMs = Date.now() - startedAt;
console.log(`\ndone in ${durationMs}ms`);
