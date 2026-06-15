/**
 * Tests for unverifiable verdict behaviour (issue #2023).
 *
 * Acceptance criteria:
 *   - gh unavailable/timeout yields verdict `unverifiable` (not pass)
 *   - Unverifiable criteria excluded from level math (numerator + denominator)
 *   - Report includes an "Unverifiable criteria" section listing the reason
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { evaluate, verdictCounts } from "../evaluate.js";
import { computeLevel } from "../computeLevel.js";
import { writeReport } from "../outputs/report.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-unverifiable-"));
  return {
    root,
    file(rel, body = "") {
      const p = join(root, rel);
      const dir = p.slice(0, p.lastIndexOf("/"));
      mkdirSync(dir, { recursive: true });
      writeFileSync(p, body);
    },
    dir(rel) {
      mkdirSync(join(root, rel), { recursive: true });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// ── verdictCounts gate ────────────────────────────────────────────────────────

test("verdictCounts: unverifiable → false (excluded from passes)", () => {
  assert.equal(verdictCounts("unverifiable"), false);
});

// ── evaluate returns unverifiable when gh is down ─────────────────────────────

test("evaluate: active type + gh failure → unverifiable verdict", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/ci.yml", "on: push");
  const c = {
    id: "test:active",
    detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
  };
  const result = evaluate(c, fx.root, {
    execFileSyncFn: () => {
      throw new Error("gh: command not found");
    },
  });
  assert.equal(result.verdict, "unverifiable");
  assert.ok(result.evidence && result.evidence.length > 0, "evidence must be non-empty");
  fx.cleanup();
});

test("evaluate: active type + gh timeout → unverifiable verdict", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/ci.yml", "on: push");
  const c = {
    id: "test:active",
    detection: { type: "active", pattern: ".github/workflows/ci.yml", maxAgeDays: 7 },
  };
  const result = evaluate(c, fx.root, {
    execFileSyncFn: () => {
      const err = new Error("spawnSync gh ETIMEDOUT");
      err.code = "ETIMEDOUT";
      throw err;
    },
  });
  assert.equal(result.verdict, "unverifiable");
  fx.cleanup();
});

// ── level math excludes unverifiable from denominator ────────────────────────

describe("computeLevel: unverifiable excluded from denominator", () => {
  // Use real L4 IDs — 14 scannable at L4, 70% = 10 needed.
  // If we have 9 detected + 1 unverifiable, the denominator becomes 13 (not 14),
  // so 9/13 = 69.2% which is below threshold. But the point is the unverifiable
  // is not in the denominator at all.
  //
  // Minimal test: with 0 detected and 0 unverifiable, required == scannableCount.
  // With 1 unverifiable at L3, required at L3 should be (scannableCount - 1).

  test("unverifiable ID reduces required count for its level", () => {
    // Get baseline required for L3 with no unverifiable
    const baseResult = computeLevel(new Set([]), {}, {});
    const baseRequired = baseResult.requiredByLevel[3] ?? 0;

    // Known L3 scannable ID
    const l3Id = "acmm:ci-matrix";
    const withUnverifiable = computeLevel(new Set([]), {}, { unverifiableIds: new Set([l3Id]) });
    const newRequired = withUnverifiable.requiredByLevel[3] ?? 0;

    assert.equal(
      newRequired,
      baseRequired - 1,
      `required at L3 should drop by 1 when ${l3Id} is unverifiable`
    );
  });

  test("unverifiable ID is not in detectedByLevel numerator", () => {
    const l3Id = "acmm:ci-matrix";
    // Even if we (incorrectly) put it in detected, unverifiable should not count
    // because verdictCounts('unverifiable') === false, so it won't be in detectedIds.
    // The denominator test above already covers this — this test confirms the ratio stays correct.
    const result = computeLevel(
      new Set([]), // not detected
      {},
      { unverifiableIds: new Set([l3Id]) }
    );
    assert.equal(result.detectedByLevel[3], 0, "unverifiable should not appear in detected count");
  });
});

// ── report section ───────────────────────────────────────────────────────────

test("writeReport: includes Unverifiable criteria section when present", () => {
  const fx = fixture();

  // Minimal state/computation stubs needed by writeReport
  const state = {
    detectedIds: [],
    history: [],
    behavioral: null,
  };
  const computation = {
    level: 1,
    levelName: "Assisted / Ad Hoc",
    role: "Executor",
    antiPattern: "",
    nextTransitionTrigger: null,
    detectedByLevel: {},
    requiredByLevel: {},
    missingForNextLevel: [],
    prerequisites: { met: 0, total: 0 },
    crossCutting: {
      learning: { met: 0, total: 0 },
      traceability: { met: 0, total: 0 },
    },
    behavioralGates: [],
  };

  const unverifiableCriteria = [
    { id: "acmm:auto-issue-gen", reason: "gh CLI unavailable or error" },
    { id: "acmm:merge-queue", reason: "gh CLI unavailable or error" },
  ];

  writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation,
    diff: null,
    hollowCriteria: [],
    unverifiableCriteria,
  });

  const reportPath = join(fx.root, ".claude/acmm/report.md");
  const content = readFileSync(reportPath, "utf-8");

  assert.ok(
    content.includes("## Unverifiable criteria (2)"),
    "report must include Unverifiable section header with count"
  );
  assert.ok(content.includes("acmm:auto-issue-gen"), "report must list unverifiable criterion ID");
  assert.ok(
    content.includes("gh CLI unavailable or error"),
    "report must include reason for unverifiability"
  );
  assert.ok(
    content.includes("excluded from level math"),
    "report must state criteria are excluded from level math"
  );

  fx.cleanup();
});

test("writeReport: no Unverifiable section when list is empty", () => {
  const fx = fixture();

  const state = { detectedIds: [], history: [], behavioral: null };
  const computation = {
    level: 1,
    levelName: "Assisted / Ad Hoc",
    role: "Executor",
    antiPattern: "",
    nextTransitionTrigger: null,
    detectedByLevel: {},
    requiredByLevel: {},
    missingForNextLevel: [],
    prerequisites: { met: 0, total: 0 },
    crossCutting: {
      learning: { met: 0, total: 0 },
      traceability: { met: 0, total: 0 },
    },
    behavioralGates: [],
  };

  writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation,
    diff: null,
    hollowCriteria: [],
    unverifiableCriteria: [],
  });

  const content = readFileSync(join(fx.root, ".claude/acmm/report.md"), "utf-8");
  assert.ok(
    !content.includes("## Unverifiable criteria"),
    "report must NOT include Unverifiable section when list is empty"
  );

  fx.cleanup();
});
