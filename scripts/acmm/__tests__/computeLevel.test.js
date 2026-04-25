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
