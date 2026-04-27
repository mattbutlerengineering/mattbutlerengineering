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
import { detectAll, detect } from "./detection.js";
import { computeLevel } from "./computeLevel.js";
import { loadState, saveState, recordHistory } from "./state.js";
import { writeReport } from "./outputs/report.js";
import { updateBadge } from "./outputs/badge.js";
import { applyIssuesForFailures, ensureAcmmLabel } from "./outputs/issues.js";
import { measureFlakeRate } from "./flake-rate.js";
import { measurePrOutcomes } from "./pr-outcomes.js";
import { measureEvals } from "./evals.js";
import path from "node:path";
import fs from "node:fs";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const BADGE = args.has("--badge");
const TREND = args.has("--trend");

// --project <path> support
let projectPath = process.cwd();
const projectIdx = process.argv.indexOf("--project");
if (projectIdx >= 0 && process.argv[projectIdx + 1]) {
  projectPath = path.resolve(process.cwd(), process.argv[projectIdx + 1]);
}
const cwd = projectPath;
const repoRoot = process.cwd();

// Load project acmm config if it exists
let acmmConfig = { 
  inherit: false, 
  globalPaths: [
    ".github/",
    "CONTRIBUTING.md",
    "docs/",
    "scripts/acmm/",
    ".claude/settings.json",
    "package.json",
    "pnpm-workspace.yaml",
    "turbo.json"
  ],
  // These MUST be local to be detected for a project, even if inherit is true
  localOnly: [
    "CLAUDE.md",
    "AGENTS.md",
    "llms.txt",
    "llms-full.txt",
    ".cursorrules"
  ]
};
try {
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (pkg.acmm) {
      if (pkg.acmm.globalPaths) {
         acmmConfig.globalPaths = [...new Set([...acmmConfig.globalPaths, ...pkg.acmm.globalPaths])];
      }
      if (pkg.acmm.inherit !== undefined) acmmConfig.inherit = pkg.acmm.inherit;
    }
  }
} catch (e) {
  // Ignore
}

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

// Modified detectAll logic to support inheritance
const detectedIds = new Set();
for (const c of ALL_CRITERIA) {
  // Try local first
  let passed = detect(cwd, c);
  
  // If failed and inheritance enabled, try root for allowed global paths
  if (!passed && acmmConfig.inherit) {
    const patterns = Array.isArray(c.detection.pattern) ? c.detection.pattern : [c.detection.pattern];
    
    // Check if any pattern is local-only
    const isLocalOnly = patterns.some(p => 
      acmmConfig.localOnly.some(lo => p.startsWith(lo) || p === lo)
    );

    if (!isLocalOnly) {
      const isGlobal = patterns.some(p => 
        acmmConfig.globalPaths.some(gp => p.startsWith(gp) || p === gp)
      );
      if (isGlobal) {
        passed = detect(repoRoot, c);
      }
    }
  }
  
  if (passed) detectedIds.add(c.id);
}

const computation = computeLevel(detectedIds);
const detectedCount = detectedIds.size;
const totalCount = ALL_CRITERIA.length;

/* ── Diff vs prior saved state ──────────────────────────── */
const priorIds = new Set(prior.detectedIds ?? []);
const isFirstRun = !prior.lastRun;
const diff = isFirstRun
  ? null
  : {
      added: [...detectedIds].filter((id) => !priorIds.has(id)).sort(),
      removed: [...priorIds].filter((id) => !detectedIds.has(id)).sort(),
      levelDelta: computation.level - (prior.currentLevel ?? 0),
      countDelta: detectedCount - priorIds.size,
      priorLevel: prior.currentLevel ?? 0,
      priorCount: priorIds.size,
    };

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

/* ── Behavioral signals (non-fatal — null when tools unavailable) ── */
const flake = measureFlakeRate();
const prOutcomes = measurePrOutcomes();
const evalsSummary = measureEvals(cwd);
const behavioral = {
  ...(prior.behavioral ?? {}),
  flake: flake
    ? {
        rate_30d: flake.flake_rate_30d,
        sample_size: flake.flake_sample_size,
        flaky_shas: flake.flaky_shas,
        measured_at: new Date().toISOString(),
      }
    : (prior.behavioral?.flake ?? null),
  agent_pr: prOutcomes
    ? { ...prOutcomes, measured_at: new Date().toISOString() }
    : (prior.behavioral?.agent_pr ?? null),
  evals: evalsSummary.n > 0
    ? { ...evalsSummary, measured_at: new Date().toISOString() }
    : (prior.behavioral?.evals ?? null),
};

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
    behavioral,
  },
  computation.level,
  detectedCount,
  totalCount,
);

/* ── Write state + report ────────────────────────────────── */
saveState(cwd, nextState);
const reportPath = writeReport(cwd, { state: nextState, criteria: ALL_CRITERIA, sources: SOURCES, computation, diff });

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

if (diff) {
  const arrow = diff.levelDelta > 0 ? "↑" : diff.levelDelta < 0 ? "↓" : null;
  const countArrow = diff.countDelta > 0 ? `+${diff.countDelta}` : diff.countDelta < 0 ? `${diff.countDelta}` : "±0";
  const levelStr = arrow ? `L${diff.priorLevel} ${arrow} L${computation.level}` : `L${computation.level} (unchanged)`;
  console.log("");
  console.log(`Since last run: ${levelStr}  ·  ${diff.priorCount} → ${detectedCount} detected (${countArrow})`);
  if (diff.added.length > 0) {
    console.log(`  + ${diff.added.length} newly detected: ${diff.added.slice(0, 4).join(", ")}${diff.added.length > 4 ? `, … (+${diff.added.length - 4} more)` : ""}`);
  }
  if (diff.removed.length > 0) {
    console.log(`  - ${diff.removed.length} regressed: ${diff.removed.slice(0, 4).join(", ")}${diff.removed.length > 4 ? `, … (+${diff.removed.length - 4} more)` : ""}`);
  }
  if (diff.added.length === 0 && diff.removed.length === 0) {
    console.log(`  · no criteria changed`);
  }
}
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

if (behavioral.flake) {
  const pct = (behavioral.flake.rate_30d * 100).toFixed(1);
  const n = behavioral.flake.sample_size;
  console.log(`Signal quality: CI flake rate ${pct}% (n=${n})`);
} else {
  console.log("Signal quality: flake rate unavailable (gh CLI missing or no CI runs)");
}

if (behavioral.agent_pr) {
  const o = behavioral.agent_pr;
  if (o.insufficient_data) {
    console.log(`Agent PR outcomes: insufficient data (n=${o.sample_size})`);
  } else {
    const acc = (o.acceptance_rate_30d * 100).toFixed(0);
    const rev = (o.revert_rate_30d * 100).toFixed(0);
    const ttm = o.median_time_to_merge_hours.toFixed(1);
    console.log(`Agent PR outcomes: ${acc}% accepted · ${rev}% reverted · ${ttm}h median time-to-merge (n=${o.sample_size})`);
  }
} else {
  console.log("Agent PR outcomes: unavailable (gh CLI missing or no PRs)");
}

if (behavioral.evals) {
  const e = behavioral.evals;
  const pct = (e.passRate * 100).toFixed(0);
  console.log(`Agent evals: ${pct}% pass · score ${e.medianScore.toFixed(2)} (n=${e.n}, status: ${e.status})`);
} else {
  console.log("Agent evals: no runs (seed via `node scripts/acmm/evals/index.js`)");
}

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
