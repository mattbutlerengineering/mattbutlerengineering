/**
 * AC1: local extensions move to a new non-gating `local` source.
 *
 * The `acmm` source keeps gating the published level; `local` never does
 * (`definesLevels: false`). These 16 ids must exist under `local:` and must
 * NOT exist under `acmm:` any more — a repo-invented criterion that still
 * gates the level under a different name is not a fix.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { SOURCES, ALL_CRITERIA } from "../sources/index.js";
import { localSource } from "../sources/local.js";

const MOVED_SUFFIXES = [
  "multi-repo-orchestration",
  "agent-attestation",
  "ai-compliance-doc",
  "ai-health-dashboard",
  "ai-service-fallback",
  "budget-policy",
  "explanation-standards",
  "self-correction-metric",
  "override-analytics",
  "review-burden",
  "onboarding-benchmark",
  "repo-bench",
  "prompt-injection-sandbox",
  "feedback-loop-inventory",
  "code-graph",
  "mcp-server-config",
];

test("local source is registered and never gates the level", () => {
  const registered = SOURCES.find((s) => s.id === "local");
  assert.ok(registered, "local source must be registered in SOURCES");
  assert.equal(registered.definesLevels, false, "local source must not gate the level");
  assert.equal(registered, localSource);
});

test("every moved criterion exists as local:<x> and no longer as acmm:<x>", () => {
  const ids = new Set(ALL_CRITERIA.map((c) => c.id));
  for (const suffix of MOVED_SUFFIXES) {
    assert.ok(ids.has(`local:${suffix}`), `local:${suffix} should exist`);
    assert.ok(!ids.has(`acmm:${suffix}`), `acmm:${suffix} should no longer exist`);
  }
});

test("acmm:token-tracking is gone (absorbed into local:budget-policy)", () => {
  const ids = new Set(ALL_CRITERIA.map((c) => c.id));
  assert.ok(!ids.has("acmm:token-tracking"));
  assert.ok(!ids.has("local:token-tracking"));
  const budgetPolicy = ALL_CRITERIA.find((c) => c.id === "local:budget-policy");
  const patterns = budgetPolicy.detection.pattern;
  assert.ok(
    patterns.includes(".claude/acmm/cost-metrics.json"),
    "local:budget-policy should absorb token-tracking's pattern"
  );
});

test("local:code-graph drops tsconfig.json from its patterns", () => {
  const codeGraph = ALL_CRITERIA.find((c) => c.id === "local:code-graph");
  assert.ok(codeGraph, "local:code-graph should exist");
  assert.ok(
    !codeGraph.detection.pattern.includes("tsconfig.json"),
    "tsconfig.json should be dropped — every TS repo passes"
  );
});

test("no duplicate ids across sources after the move", () => {
  const ids = ALL_CRITERIA.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate IDs across sources");
});
