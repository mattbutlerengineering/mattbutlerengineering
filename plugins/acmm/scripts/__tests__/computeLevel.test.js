import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { computeLevel, BEHAVIORAL_GATES } from "../computeLevel.js";
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
  // L3 has 6 scannable items. 70% = 5 of 6 needed (ceil(6*0.7) = 5 — actually ≥70% ratio).
  // Four hits (besides the L2 OR-group) should NOT be enough (4/6 = 67%).
  const fourHits = computeLevel(
    new Set([
      "acmm:claude-md",
      "acmm:ci-matrix",
      "acmm:pr-acceptance-metric",
      "acmm:pr-review-rubric",
      "acmm:onboarding-benchmark",
    ])
  );
  assert.equal(fourHits.level, 2, "4 of 6 = 67%, below 70% threshold, stays at L2");

  const fiveHits = computeLevel(
    new Set([
      "acmm:claude-md",
      "acmm:ci-matrix",
      "acmm:pr-acceptance-metric",
      "acmm:pr-review-rubric",
      "acmm:onboarding-benchmark",
      "acmm:quality-dashboard",
    ])
  );
  assert.equal(fiveHits.level, 3, "5 of 6 = 83%, crosses 70% threshold, advances to L3");
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
    ])
  );
  assert.equal(result.level, 2, "skipping L3 caps at L2 even with strong L4 signals");
});

test("ALL_CRITERIA: sources exist, level distribution covers L0 and L2–L6", () => {
  assert.ok(SOURCES.length >= 4, "at least 4 source frameworks");
  const ids = new Set(ALL_CRITERIA.map((c) => c.id));
  assert.equal(ids.size, ALL_CRITERIA.length, "no duplicate IDs across sources");

  const byLevel = {};
  for (const c of ALL_CRITERIA) byLevel[c.level] = (byLevel[c.level] ?? 0) + 1;
  // L0 (prereqs), L2–L6 must all have entries (L1 has no scannable criteria by design).
  for (const n of [0, 2, 3, 4, 5, 6]) {
    assert.ok(byLevel[n] > 0, `level ${n} should have ≥1 criterion`);
  }
});

test("ALL_CRITERIA: every criterion has detection.type and pattern", () => {
  for (const c of ALL_CRITERIA) {
    assert.ok(c.detection, `criterion ${c.id} missing detection`);
    assert.ok(
      ["path", "any-of", "glob", "active", "grep"].includes(c.detection.type),
      `${c.id} has invalid detection type`
    );
    assert.ok(c.detection.pattern, `${c.id} missing detection pattern`);
  }
});

/* ── Behavioral gates ───────────────────────────────────── */

// Helper: IDs that satisfy L2 + L3+ levels
// L2 has 3 scannable items; the OR-group virtual criterion only needs 1 file
const L2_IDS = ["acmm:claude-md"];
// L3 has 6 items; 70% = 5 needed
const L3_IDS = [
  "acmm:ci-matrix",
  "acmm:pr-acceptance-metric",
  "acmm:pr-review-rubric",
  "acmm:onboarding-benchmark",
  "acmm:quality-dashboard",
];
// L4 has 16 items; 70% = 12 needed
const L4_IDS = [
  "acmm:auto-qa-tuning",
  "acmm:nightly-compliance",
  "acmm:copilot-review-apply",
  "acmm:auto-label",
  "acmm:ai-fix-workflow",
  "acmm:tier-classifier",
  "acmm:security-ai-md",
  "acmm:mcp-server-config",
  "acmm:code-graph",
  "acmm:repo-bench",
  "acmm:component-registry-integrity",
  "acmm:instruction-rot-detection",
];
// L5 has 16 items; 70% = 12 needed
const L5_IDS = [
  "acmm:github-actions-ai",
  "acmm:auto-qa-self-tuning",
  "acmm:public-metrics",
  "acmm:policy-as-code",
  "acmm:reflection-log",
  "acmm:audit-trail",
  "acmm:self-correction-metric",
  "acmm:state-backup",
  "acmm:ai-health-dashboard",
  "acmm:prompt-injection-sandbox",
  "acmm:agent-attestation",
  "acmm:ai-service-fallback",
];
// L6 has 8 items; 70% = 6 needed
const L6_IDS = [
  "acmm:auto-issue-gen",
  "acmm:multi-agent-orchestration",
  "acmm:merge-queue",
  "acmm:strategic-dashboard",
  "acmm:risk-assessment-config",
  "acmm:observability-runbook",
];

/** Builds a Set of all IDs up to and including the given level */
function idsThrough(level) {
  const all = [...L2_IDS];
  if (level >= 3) all.push(...L3_IDS);
  if (level >= 4) all.push(...L4_IDS);
  if (level >= 5) all.push(...L5_IDS);
  if (level >= 6) all.push(...L6_IDS);
  return new Set(all);
}

describe("computeLevel with behavioral gates", () => {
  test("backward compatible: no behavioral param returns behavioralGates array", () => {
    const result = computeLevel(new Set(L2_IDS));
    assert.ok(Array.isArray(result.behavioralGates), "behavioralGates should be an array");
    assert.equal(result.behavioralGates.length, BEHAVIORAL_GATES.length);
    assert.equal(result.level, 2);
  });

  test("backward compatible: empty behavioral param does not block advancement", () => {
    const ids = idsThrough(3);
    const result = computeLevel(ids, {});
    assert.equal(result.level, 3, "should reach L3 with no behavioral data");
    // Gates with no data should all pass
    for (const g of result.behavioralGates) {
      assert.equal(g.passed, true, `gate ${g.name} should pass when no data`);
      assert.equal(g.dataAvailable, false, `gate ${g.name} should report no data`);
    }
  });

  test("L3 blocked by high flake rate in strict mode", () => {
    const ids = idsThrough(3);
    const behavioral = { flake: { rate_30d: 0.25 } }; // 25% > 20% threshold
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 2, "L3 should be blocked by high flake rate in strict mode");

    const flakeGate = result.behavioralGates.find((g) => g.name === "ci-flake-rate");
    assert.equal(flakeGate.passed, false);
    assert.equal(flakeGate.value, 0.25);
    assert.equal(flakeGate.strict, true);
    assert.equal(flakeGate.dataAvailable, true);
  });

  test("L3 warning but not blocked by high flake rate in soft mode", () => {
    const ids = idsThrough(3);
    const behavioral = { flake: { rate_30d: 0.25 } }; // 25% > 20% threshold
    const result = computeLevel(ids, behavioral, { strict: false });
    assert.equal(result.level, 3, "L3 should NOT be blocked in soft mode");

    const flakeGate = result.behavioralGates.find((g) => g.name === "ci-flake-rate");
    assert.equal(flakeGate.passed, false, "gate should report failure");
    assert.equal(flakeGate.strict, false);
  });

  test("L3 passes when flake rate is below threshold", () => {
    const ids = idsThrough(3);
    const behavioral = { flake: { rate_30d: 0.1 } }; // 10% < 20%
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 3, "L3 should pass when flake rate is low");

    const flakeGate = result.behavioralGates.find((g) => g.name === "ci-flake-rate");
    assert.equal(flakeGate.passed, true);
  });

  test("L4 blocked by low PR acceptance rate in strict mode", () => {
    const ids = idsThrough(4);
    const behavioral = {
      flake: { rate_30d: 0.05 }, // L3 gate passes
      agent_pr: { acceptance_rate_30d: 0.4 }, // 40% < 50% threshold
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 3, "L4 should be blocked by low PR acceptance");

    const prGate = result.behavioralGates.find((g) => g.name === "agent-pr-acceptance");
    assert.equal(prGate.passed, false);
    assert.equal(prGate.value, 0.4);
  });

  test("L5 blocked by insufficient auto-qa history in strict mode", () => {
    const ids = idsThrough(5);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8 },
      auto_qa_history_count: 1, // must be > 1
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 4, "L5 should be blocked by auto_qa_history_count <= 1");

    const qaGate = result.behavioralGates.find((g) => g.name === "auto-qa-tuning-history");
    assert.equal(qaGate.passed, false);
    assert.equal(qaGate.value, 1);
  });

  test("L6 blocked by high revert rate in strict mode", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.15 }, // 15% > 10%
      auto_qa_history_count: 3,
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 5, "L6 should be blocked by high revert rate");

    const revertGate = result.behavioralGates.find((g) => g.name === "agent-pr-revert-rate");
    assert.equal(revertGate.passed, false);
    assert.equal(revertGate.value, 0.15);
  });

  test("all gates pass: full advancement to L6", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.02, human_touch_ratio: 0.3 },
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 6, "should reach L6 when all gates pass");

    for (const g of result.behavioralGates) {
      assert.equal(g.passed, true, `gate ${g.name} should pass`);
    }
  });

  // ── human-touch-ratio gate (L6) ───────────────────────────

  test("L6 blocked by human_touch_ratio >= 50% in strict mode", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.02, human_touch_ratio: 1.0 },
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 5, "L6 blocked when human_touch_ratio >= 50%");

    const gate = result.behavioralGates.find((g) => g.name === "human-touch-ratio");
    assert.ok(gate, "human-touch-ratio gate should exist");
    assert.equal(gate.passed, false);
    assert.equal(gate.value, 1.0);
    assert.equal(gate.dataAvailable, true);
  });

  test("L6 passes when human_touch_ratio < 50%", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.02, human_touch_ratio: 0.3 },
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: true });
    assert.equal(result.level, 6, "L6 passes when human_touch_ratio < 50%");

    const gate = result.behavioralGates.find((g) => g.name === "human-touch-ratio");
    assert.ok(gate, "human-touch-ratio gate should exist");
    assert.equal(gate.passed, true);
  });

  test("human-touch-ratio gate reports unverifiable when data unavailable", () => {
    const ids = idsThrough(6);
    // agent_pr has no human_touch_ratio field
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.02 },
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: true });

    const gate = result.behavioralGates.find((g) => g.name === "human-touch-ratio");
    assert.ok(gate, "human-touch-ratio gate should exist");
    assert.equal(gate.dataAvailable, false);
    assert.equal(gate.unverifiable, true, "gate should report unverifiable when no data");
    assert.equal(gate.passed, false, "unverifiable gate should fail in strict mode");
    assert.equal(result.level, 5, "L6 blocked when human-touch-ratio is unverifiable");
  });

  test("human-touch-ratio gate unverifiable does not block in soft mode", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      agent_pr: { acceptance_rate_30d: 0.8, revert_rate_30d: 0.02 },
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: false });

    const gate = result.behavioralGates.find((g) => g.name === "human-touch-ratio");
    assert.ok(gate, "human-touch-ratio gate should exist");
    assert.equal(gate.unverifiable, true);
    assert.equal(result.level, 6, "L6 allowed in soft mode even when unverifiable");
  });

  test("human-touch-ratio unverifiable when no agent_pr data at all", () => {
    const ids = idsThrough(6);
    const behavioral = {
      flake: { rate_30d: 0.05 },
      // no agent_pr
      auto_qa_history_count: 5,
    };
    const result = computeLevel(ids, behavioral, { strict: true });

    const gate = result.behavioralGates.find((g) => g.name === "human-touch-ratio");
    assert.ok(gate, "human-touch-ratio gate should exist");
    assert.equal(gate.unverifiable, true, "unverifiable when agent_pr is absent");
    assert.equal(gate.dataAvailable, false);
  });

  test("gate results include expected fields", () => {
    const ids = idsThrough(3);
    const behavioral = { flake: { rate_30d: 0.25 } };
    const result = computeLevel(ids, behavioral, { strict: true });

    const gate = result.behavioralGates[0];
    assert.ok("level" in gate, "gate should have level");
    assert.ok("name" in gate, "gate should have name");
    assert.ok("passed" in gate, "gate should have passed");
    assert.ok("value" in gate, "gate should have value");
    assert.ok("threshold" in gate, "gate should have threshold");
    assert.ok("strict" in gate, "gate should have strict");
    assert.ok("direction" in gate, "gate should have direction");
    assert.ok("dataAvailable" in gate, "gate should have dataAvailable");
    assert.ok("description" in gate, "gate should have description");
  });

  test("soft mode: multiple failing gates produce warnings but allow advancement", () => {
    const ids = idsThrough(4);
    const behavioral = {
      flake: { rate_30d: 0.25 }, // L3 gate fails
      agent_pr: { acceptance_rate_30d: 0.3 }, // L4 gate fails
    };
    const result = computeLevel(ids, behavioral, { strict: false });
    assert.equal(result.level, 4, "should still reach L4 in soft mode");

    const failedGates = result.behavioralGates.filter((g) => !g.passed);
    assert.equal(failedGates.length, 2, "two gates should fail");
    for (const g of failedGates) {
      assert.equal(g.strict, false, "failed gates should be marked as soft");
    }
  });
});
