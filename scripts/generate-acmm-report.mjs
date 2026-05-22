#!/usr/bin/env node

/**
 * Generates apps/marketing/public/acmm-report.json from all workspace ACMM state files.
 * Consumed by the AcmmPage multi-workspace dashboard at /acmm.
 *
 * Usage: node scripts/generate-acmm-report.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, "..");
const OUTPUT_PATH = resolve(ROOT, "apps", "marketing", "public", "acmm-report.json");

const WORKSPACE_DIRS = [
  { dir: "apps", type: "app" },
  { dir: "services", type: "service" },
  { dir: "packages", type: "package" },
];

/** Transform a raw state.json into a workspace report entry. Pure function, no I/O. */
export function transformState(state, name, wsPath, type) {
  const total = Object.keys(state.checks ?? {}).length;
  const detected = state.detectedIds?.length ?? 0;
  return {
    name,
    path: wsPath,
    type,
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
      evalPassRate: state.behavioral?.evals?.passRate ?? 0,
    },
    checks: Object.fromEntries(
      Object.entries(state.checks ?? {}).map(([id, check]) => [id, { passed: check.passed }])
    ),
    behavioralGates: (state.computation?.behavioralGates ?? []).map((g) => ({
      level: g.level,
      name: g.name,
      passed: g.passed,
      value: g.value,
      threshold: g.threshold,
    })),
  };
}

/** Collect all workspace ACMM states from the monorepo. */
export function collectWorkspaces(rootDir) {
  const workspaces = [];
  for (const { dir, type } of WORKSPACE_DIRS) {
    const baseDir = join(rootDir, dir);
    if (!existsSync(baseDir)) continue;
    const entries = readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const statePath = join(baseDir, entry.name, ".claude", "acmm", "state.json");
      if (!existsSync(statePath)) continue;
      let state;
      try {
        state = JSON.parse(readFileSync(statePath, "utf8"));
      } catch {
        continue;
      }
      workspaces.push(transformState(state, entry.name, `${dir}/${entry.name}`, type));
    }
  }
  return workspaces;
}

const workspaces = collectWorkspaces(ROOT);
workspaces.sort((a, b) => b.currentLevel - a.currentLevel);

const report = {
  schema: "acmm-report/v1",
  generatedAt: new Date().toISOString(),
  workspaces,
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n");
console.log(`Generated ${OUTPUT_PATH} (${workspaces.length} workspaces)`);
