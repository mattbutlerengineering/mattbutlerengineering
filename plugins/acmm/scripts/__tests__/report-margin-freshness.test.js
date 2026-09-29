/**
 * Tests for the per-level margin column (#5852 AC11) and behavioral input
 * freshness lines (#5852 AC3) in the markdown report.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReport } from "../outputs/report.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-report-margin-"));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function baseComputation(overrides = {}) {
  return {
    level: 2,
    levelName: "Instructed",
    role: "Rule-writer",
    characteristic: "",
    antiPattern: "",
    nextTransitionTrigger: null,
    detectedByLevel: { 2: 1, 3: 0, 4: 0, 5: 0, 6: 0 },
    requiredByLevel: { 2: 3, 3: 6, 4: 16, 5: 16, 6: 8 },
    marginByLevel: { 2: 0, 3: -4, 4: -12, 5: -12, 6: -6 },
    missingForNextLevel: [],
    prerequisites: { met: 0, total: 0 },
    crossCutting: {
      learning: { met: 0, total: 0 },
      traceability: { met: 0, total: 0 },
    },
    behavioralGates: [],
    ...overrides,
  };
}

test("per-level threshold table includes a Margin column, flagged when <= 1", () => {
  const fx = fixture();
  const state = {
    detectedIds: [],
    history: [],
    behavioral: null,
    lastRun: new Date().toISOString(),
    currentLevel: 2,
    levelName: "Instructed",
    role: "Rule-writer",
  };

  const reportPath = writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation: baseComputation({
      // L3 margin of 1 -> flagged; L4 margin of 5 -> not flagged
      marginByLevel: { 2: 0, 3: 1, 4: 5, 5: -12, 6: -6 },
    }),
    diff: null,
  });

  const content = readFileSync(reportPath, "utf-8");
  assert.ok(content.includes("| Margin |"), "table header should include a Margin column");
  assert.ok(content.includes("| L3 | 0 | 6 | 0% | ⚠️ 1 | ❌ |"), "L3 margin=1 should be flagged");
  assert.ok(content.includes("| L4 | 0 | 16 | 0% | 5 | ❌ |"), "L4 margin=5 should not be flagged");

  fx.cleanup();
});

test("Signal quality and Agent PR sections show freshness of the behavioral reading", () => {
  const fx = fixture();
  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();

  const state = {
    detectedIds: [],
    history: [],
    behavioral: {
      flake: { rate_30d: 0.02, sample_size: 40, measured_at: eightDaysAgo },
      agent_pr: {
        acceptance_rate_30d: 0.9,
        revert_rate_30d: 0.01,
        median_time_to_merge_hours: 3,
        human_touch_ratio: 0.1,
        merged_count: 40,
        closed_unmerged_count: 4,
        open_count: 2,
        sample_size: 46,
        insufficient_data: false,
        measured_at: eightDaysAgo,
      },
    },
    lastRun: now.toISOString(),
    currentLevel: 2,
    levelName: "Instructed",
    role: "Rule-writer",
  };

  const reportPath = writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation: baseComputation(),
    diff: null,
  });

  const content = readFileSync(reportPath, "utf-8");
  assert.match(content, /flake: STALE — 8d old/);
  assert.match(content, /agent_pr: STALE — 8d old/);

  fx.cleanup();
});

test("a fresh reading is reported as fresh, not stale", () => {
  const fx = fixture();
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString();

  const state = {
    detectedIds: [],
    history: [],
    behavioral: {
      flake: { rate_30d: 0.0, sample_size: 40, measured_at: oneDayAgo },
    },
    lastRun: now.toISOString(),
    currentLevel: 2,
    levelName: "Instructed",
    role: "Rule-writer",
  };

  const reportPath = writeReport(fx.root, {
    state,
    criteria: [],
    sources: [],
    computation: baseComputation(),
    diff: null,
  });

  const content = readFileSync(reportPath, "utf-8");
  assert.match(content, /flake: fresh \(1d old\)/);

  fx.cleanup();
});
