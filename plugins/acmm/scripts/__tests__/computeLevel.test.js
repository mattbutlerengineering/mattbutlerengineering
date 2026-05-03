import { test } from "node:test";
import assert from "node:assert/strict";

import { computeLevel } from "../computeLevel.js";
import { ALL_CRITERIA, SOURCES } from "../sources/index.js";

test("computeLevel: empty detection set → L1 (Assisted)", () => {
  const result = computeLevel(new Set());
  assert.equal(result.level, 1);
  assert.equal(result.levelName, "Assisted / Ad Hoc");
  assert.equal(result.role, "Executor");
});

test("computeLevel: any single agent-instructions file satisfies L2", () => {
  // L2's OR-group: any of CLAUDE.md, AGENTS.md, copilot-instructions, cursor-rules
  const result = computeLevel(new Set(["acmm:claude-md"]));
  assert.equal(result.level, 2);
  assert.equal(result.levelName, "Instructed");
  assert.equal(result.role, "Rule-writer");
});

test("computeLevel: 70% threshold gates L3+", () => {
  // L3 has 4 scannable items. 70% = 3 of 4 needed.
  // Two hits (besides the L2 OR-group) should NOT be enough.
  const twoHits = computeLevel(
    new Set(["acmm:claude-md", "acmm:ci-matrix", "acmm:pr-acceptance-metric"]),
  );
  assert.equal(twoHits.level, 2, "2 of 4 = 50%, below 70% threshold, stays at L2");

  const threeHits = computeLevel(
    new Set(["acmm:claude-md", "acmm:ci-matrix", "acmm:pr-acceptance-metric", "acmm:pr-review-rubric"]),
  );
  assert.equal(threeHits.level, 3, "3 of 4 = 75%, crosses 70% threshold, advances to L3");
});

test("computeLevel: stops at first failed level", () => {
  // L4-only detection without L3 should NOT skip-grade to L4.
  const result = computeLevel(
    new Set([
      "acmm:claude-md", // L2 OR-group
      "acmm:auto-qa-tuning",
      "acmm:nightly-compliance",
      "acmm:auto-label",
      "acmm:ai-fix-workflow",
      "acmm:tier-classifier",
      "acmm:security-ai-md",
      "acmm:structured-workflows",
    ]),
  );
  assert.equal(result.level, 2, "skipping L3 caps at L2 even with strong L4 signals");
});

test("ALL_CRITERIA: 4 sources, level distribution covers L0–L6", () => {
  assert.equal(SOURCES.length, 4);
  const ids = new Set(ALL_CRITERIA.map((c) => c.id));
  assert.equal(ids.size, ALL_CRITERIA.length, "no duplicate IDs across sources");

  const byLevel = {};
  for (const c of ALL_CRITERIA) byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;
  // We expect L0 (prereqs), L2, L3, L4, L5, L6 to all have entries.
  for (const n of [0, 2, 3, 4, 5, 6]) {
    assert.ok(byLevel[n] > 0, `level ${n} should have ≥1 criterion`);
  }
});

test("ALL_CRITERIA: every criterion has detection.type and pattern", () => {
  for (const c of ALL_CRITERIA) {
    assert.ok(c.detection, `criterion ${c.id} missing detection`);
    assert.ok(["path", "any-of", "glob"].includes(c.detection.type), `${c.id} has invalid detection type`);
    assert.ok(c.detection.pattern, `${c.id} missing detection pattern`);
  }
});

// ── Behavioral gate tests ───────────────────────────────────────────────────

// IDs that push infrastructure to L3 (L2 OR-group + 3/4 L3 criteria = 75%)
const L3_IDS = new Set([
  "acmm:claude-md",
  "acmm:pr-acceptance-metric",
  "acmm:pr-review-rubric",
  "acmm:ci-matrix",
]);

test("computeLevel: behavioral gates returned with null when no behavioral data", () => {
  const result = computeLevel(L3_IDS);
  assert.ok(result.behavioralGates, "behavioralGates should be present");
  for (const gate of Object.values(result.behavioralGates)) {
    assert.equal(gate.passed, null, "all gates should be null when no behavioral data");
    assert.equal(gate.dataAvailable, false);
  }
});

test("computeLevel: soft mode — failed gate is a warning, level unchanged", () => {
  // L3 gate: flake rate must be < 20%. Rate of 0.25 fails the gate.
  const behavioral = { flake: { rate_30d: 0.25, sample_size: 10, flaky_shas: [] } };
  const result = computeLevel(L3_IDS, behavioral, false);
  assert.equal(result.level, 3, "soft mode: level stays at infrastructure level despite gate failure");
  assert.equal(result.infrastructureLevel, 3);
  assert.equal(result.behavioralGates[3].passed, false, "L3 gate should report failure");
});

test("computeLevel: strict mode — failed L3 gate caps level at L2", () => {
  const behavioral = { flake: { rate_30d: 0.25, sample_size: 10, flaky_shas: [] } };
  const result = computeLevel(L3_IDS, behavioral, true);
  assert.equal(result.infrastructureLevel, 3, "infrastructure level still 3");
  assert.equal(result.level, 2, "strict mode: level capped at L2 by L3 gate failure");
  assert.equal(result.strict, true);
});

test("computeLevel: strict mode — passing gates do not reduce level", () => {
  const behavioral = {
    flake: { rate_30d: 0.05, sample_size: 20, flaky_shas: [] },   // L3 gate passes
    agent_pr: {
      acceptance_rate_30d: 0.80,
      revert_rate_30d: 0.02,
      insufficient_data: false,
      sample_size: 30,
    },
    auto_qa_tuning: { history_count: 3 },                          // L5 gate passes
  };
  const result = computeLevel(L3_IDS, behavioral, true);
  assert.equal(result.level, 3, "all relevant gates pass — level unchanged");
  assert.equal(result.behavioralGates[3].passed, true);
});

test("computeLevel: L4 behavioral gate — acceptance rate <= 50% fails", () => {
  const behavioral = {
    agent_pr: { acceptance_rate_30d: 0.45, revert_rate_30d: 0.05, insufficient_data: false, sample_size: 20 },
  };
  const result = computeLevel(L3_IDS, behavioral, false);
  assert.equal(result.behavioralGates[4].passed, false, "L4 gate fails when acceptance_rate <= 50%");
  assert.equal(result.behavioralGates[4].dataAvailable, true);
});

test("computeLevel: insufficient_data skips L4 and L6 gates", () => {
  const behavioral = {
    agent_pr: { acceptance_rate_30d: 0.20, revert_rate_30d: 0.50, insufficient_data: true, sample_size: 2 },
  };
  const result = computeLevel(L3_IDS, behavioral, true);
  assert.equal(result.behavioralGates[4].passed, null, "L4 gate: null when insufficient_data");
  assert.equal(result.behavioralGates[6].passed, null, "L6 gate: null when insufficient_data");
  // No gate caps the level
  assert.equal(result.level, result.infrastructureLevel, "level unchanged when all data is unavailable");
});

test("computeLevel: L5 auto_qa_tuning gate — history_count <= 1 fails", () => {
  const behavioral = { auto_qa_tuning: { history_count: 1 } };
  const result = computeLevel(L3_IDS, behavioral, false);
  assert.equal(result.behavioralGates[5].passed, false, "L5 gate fails when history_count <= 1");
});

test("computeLevel: L5 auto_qa_tuning gate — history_count > 1 passes", () => {
  const behavioral = { auto_qa_tuning: { history_count: 2 } };
  const result = computeLevel(L3_IDS, behavioral, false);
  assert.equal(result.behavioralGates[5].passed, true, "L5 gate passes when history_count > 1");
});
