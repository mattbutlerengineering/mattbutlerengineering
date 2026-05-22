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

const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
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
