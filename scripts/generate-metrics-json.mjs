#!/usr/bin/env node

/**
 * Generates apps/marketing/public/metrics.json from ACMM state data.
 * Consumed by the MetricsPage quality dashboard.
 *
 * Usage: node scripts/generate-metrics-json.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = resolve(__dirname, "..", ".claude", "acmm", "state.json");
const OUTPUT_PATH = resolve(__dirname, "..", "apps", "marketing", "public", "metrics.json");
const FRESHNESS_MAX_AGE_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_CHANGES_LIMIT = 20;
const GITHUB_URL_PREFIX = "https://github.com/";

/**
 * Guards the dashboard from silently going stale: throws when the ACMM
 * state's `lastRun` timestamp is missing or older than `maxAgeDays`.
 *
 * @param {string | undefined} lastRun - ISO timestamp of the last ACMM audit run.
 * @param {{ now?: Date; maxAgeDays?: number; statePath?: string }} [options]
 */
export function checkFreshness(
  lastRun,
  { now = new Date(), maxAgeDays = FRESHNESS_MAX_AGE_DAYS, statePath = STATE_PATH } = {}
) {
  if (!lastRun) {
    throw new Error(
      `ACMM state file ${statePath} has no lastRun timestamp — cannot verify freshness`
    );
  }
  const ageDays = (now.getTime() - new Date(lastRun).getTime()) / MS_PER_DAY;
  if (ageDays > maxAgeDays) {
    throw new Error(
      `ACMM state file ${statePath} is ${ageDays.toFixed(1)} days stale (lastRun: ${lastRun}) — exceeds the ${maxAgeDays}-day freshness threshold. Re-run the ACMM audit before regenerating metrics.`
    );
  }
}

/**
 * Projects the merged agent PRs recorded by the ACMM audit
 * (`behavioral.agent_pr.recent_changes`) into the public `recentAgentChanges`
 * list: newest first, capped, and limited to fields already public on GitHub.
 *
 * The ACMM state file is an external input here and every surviving entry is
 * rendered into a public page (the `url` lands in an anchor `href`), so entries
 * missing a field — or carrying a url that is not a github.com link — are
 * dropped rather than published. A state written before this field existed
 * yields `[]`.
 *
 * @param {Record<string, any>} state - Parsed ACMM state file.
 * @param {{ limit?: number }} [options]
 */
export function selectRecentAgentChanges(state, { limit = RECENT_CHANGES_LIMIT } = {}) {
  const changes = state?.behavioral?.agent_pr?.recent_changes;
  if (!Array.isArray(changes)) return [];

  return changes
    .filter(
      (c) =>
        Number.isFinite(c?.number) &&
        Boolean(c?.title) &&
        Boolean(c?.mergedAt) &&
        String(c?.url ?? "").startsWith(GITHUB_URL_PREFIX)
    )
    .map((c) => ({ number: c.number, title: c.title, url: c.url, mergedAt: c.mergedAt }))
    .sort((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt))
    .slice(0, limit);
}

// Run only when executed directly (`node generate-metrics-json.mjs`),
// not when imported for unit testing.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));

  try {
    checkFreshness(state.lastRun);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const comp = state.computation;

  const metrics = {
    schema: "acmm-metrics/v1",
    generatedAt: new Date().toISOString(),
    level: state.currentLevel,
    levelName: state.levelName,
    role: state.role,
    summary: {
      detected: state.detectedIds?.length ?? 0,
      total: Object.keys(state.checks ?? {}).length,
      coverage: state.detectedIds?.length
        ? state.detectedIds.length / Object.keys(state.checks ?? {}).length
        : 0,
    },
    prerequisites: comp?.prerequisites ?? { met: 0, total: 0 },
    behavioral: {
      ciFlakeRate: state.behavioral?.flake?.rate_30d ?? 0,
      agentPrAcceptanceRate: state.behavioral?.agent_pr?.acceptance_rate_30d ?? 0,
      agentPrRevertRate: state.behavioral?.agent_pr?.revert_rate_30d ?? 0,
      evalPassRate: state.behavioral?.evals?.passRate ?? 0,
      evalMedianScore: state.behavioral?.evals?.medianScore ?? 0,
    },
    history: (state.history ?? []).map((h) => ({
      date: h.date,
      level: h.level,
      detected: h.detected,
      total: h.total,
    })),
    recentAgentChanges: selectRecentAgentChanges(state),
    detectedByLevel: comp?.detectedByLevel ?? {},
    behavioralGates: (comp?.behavioralGates ?? []).map((g) => ({
      level: g.level,
      name: g.name,
      passed: g.passed,
      value: g.value,
      threshold: g.threshold,
    })),
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(metrics, null, 2) + "\n");
  console.log(
    `Generated ${OUTPUT_PATH} (level ${metrics.level}, ${metrics.summary.detected}/${metrics.summary.total} criteria)`
  );
}
