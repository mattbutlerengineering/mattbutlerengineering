#!/usr/bin/env node

/**
 * Generates apps/marketing/public/acmm-report.json from the root ACMM state
 * file only (`.claude/acmm/state.json`). Consumed by the AcmmPage repo-level
 * dashboard at /acmm.
 *
 * The 16 per-workspace `.claude/acmm/state.json` / `report.md` pairs this
 * generator used to fan out over were frozen in April on an old 85-criterion
 * catalog and nothing ever refreshed them (#5855) — several scored L6 purely
 * by inheriting root paths, and one sat at 0/85. This generator reads only
 * the root state, which is the one thing `.github/workflows/acmm-regression.yml`
 * actually keeps current.
 *
 * Usage: node scripts/generate-acmm-report.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyEvalsReading } from "../plugins/acmm/scripts/evals-freshness.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(ROOT, "apps", "marketing", "public", "acmm-report.json");

/** Read the root ACMM state file, or null when it doesn't exist yet. */
export function loadRootState(rootDir) {
  const statePath = resolve(rootDir, ".claude", "acmm", "state.json");
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8"));
}

/**
 * Reduce a `behavioral.evals` reading to what the page is allowed to show:
 * a live pass rate only when the reading is inside the freshness window,
 * `null` + `evalsStale: true` otherwise. Reuses the shared threshold rather
 * than re-implementing it (#5855 AC 3).
 */
function transformEvals(evalsReading, opts) {
  const { state, lastRun } = classifyEvalsReading(evalsReading, opts);
  if (state === "current") {
    return { evalPassRate: evalsReading.passRate, evalsStale: false, evalsLastRun: lastRun };
  }
  return { evalPassRate: null, evalsStale: true, evalsLastRun: lastRun };
}

/** Transform the raw root state.json into the repo-level report entry. Pure, no I/O. */
export function transformRepoState(state, opts = {}) {
  const total = Object.keys(state.checks ?? {}).length;
  const detected = state.detectedIds?.length ?? 0;
  return {
    currentLevel: state.currentLevel ?? 1,
    levelName: state.levelName ?? "Unknown",
    role: state.role ?? "",
    lastRun: state.lastRun ?? null,
    summary: {
      detected,
      total,
      coverage: total > 0 ? detected / total : 0,
    },
    behavioral: {
      ciFlakeRate: state.behavioral?.flake?.rate_30d ?? 0,
      agentPrAcceptanceRate: state.behavioral?.agent_pr?.acceptance_rate_30d ?? 0,
      agentPrRevertRate: state.behavioral?.agent_pr?.revert_rate_30d ?? 0,
      ...transformEvals(state.behavioral?.evals, opts),
    },
    checks: Object.fromEntries(
      Object.entries(state.checks ?? {}).map(([id, check]) => [id, { passed: check.passed }])
    ),
    behavioralGates: (state.computation?.behavioralGates ?? []).map((g) => ({
      level: g.level,
      name: g.name,
      passed: g.passed,
      value: g.value ?? null,
      threshold: g.threshold,
      unverifiable: g.unverifiable ?? false,
    })),
  };
}

// Run only when executed directly (`node generate-acmm-report.mjs`),
// not when imported for unit testing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = loadRootState(ROOT);
  if (!state) {
    throw new Error(
      `No root ACMM state found at ${resolve(ROOT, ".claude", "acmm", "state.json")}`
    );
  }

  const report = {
    schema: "acmm-report/v2",
    generatedAt: new Date().toISOString(),
    repo: transformRepoState(state),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log(`Generated ${OUTPUT_PATH} (level ${report.repo.currentLevel})`);
}
