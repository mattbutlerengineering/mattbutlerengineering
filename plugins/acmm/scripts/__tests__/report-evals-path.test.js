/**
 * Test for correct evals path in report output (#4412).
 * Verifies that the eval-fixtures footnote references the correct path:
 * `plugins/acmm/scripts/evals/` not the stale `scripts/acmm/evals/`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReport } from "../outputs/report.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-report-evals-path-"));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("report evals section references correct path plugins/acmm/scripts/evals/", () => {
  const fx = fixture();

  // Build minimal state + computation with evals behavioral data
  const state = {
    detectedIds: [],
    history: [],
    behavioral: {
      evals: {
        status: "green",
        passRate: 0.95,
        n: 10,
        medianScore: 0.9,
        medianCostUsd: 0.05,
        medianTurns: 4,
        perModel: {},
      },
    },
    lastRun: new Date().toISOString(),
    currentLevel: 1,
    levelName: "Assisted / Ad Hoc",
    role: "Executor",
  };

  const computation = {
    level: 1,
    levelName: "Assisted / Ad Hoc",
    role: "Executor",
    characteristic: "",
    antiPattern: "",
    nextTransitionTrigger: null,
    detectedByLevel: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    requiredByLevel: { 2: 3, 3: 5, 4: 14, 5: 16, 6: 8 },
    missingForNextLevel: [],
    prerequisites: { met: 0, total: 0 },
    crossCutting: {
      learning: { met: 0, total: 0 },
      traceability: { met: 0, total: 0 },
    },
    behavioralGates: [],
  };

  const reportPath = writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation,
    diff: null,
  });

  const content = readFileSync(reportPath, "utf-8");

  // Verify the evals section exists
  assert.ok(
    content.includes("## Agent evals (last 30 days)"),
    "report should contain Agent evals section"
  );

  // Verify the evals footnote references the CORRECT path
  assert.ok(
    content.includes("plugins/acmm/scripts/evals/tasks/"),
    "report should reference plugins/acmm/scripts/evals/tasks/ (not stale scripts/acmm/evals/)"
  );

  assert.ok(
    content.includes("node plugins/acmm/scripts/evals/index.js"),
    "report should reference node plugins/acmm/scripts/evals/index.js (not stale scripts/acmm/evals/)"
  );

  // Verify the stale path is NOT present
  assert.ok(
    !content.includes("scripts/acmm/evals/tasks/"),
    "report should NOT reference stale scripts/acmm/evals/tasks/ path"
  );

  assert.ok(
    !content.includes("node scripts/acmm/evals/index.js"),
    "report should NOT reference stale node scripts/acmm/evals/index.js path"
  );

  fx.cleanup();
});
