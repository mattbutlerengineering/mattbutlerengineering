/**
 * Tests for the human-touch reason breakdown rendered beside
 * `human-touch-ratio` in the ACMM report (issue #3846, part 4/4 of
 * #3805/#3806).
 *
 * Data source: `metrics/queue-telemetry.jsonl` rows carrying
 * `human_touch_reason` (taxonomy from #3843, classified by #3935/#3942).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReport } from "../outputs/report.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "acmm-report-htr-"));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function writeTelemetry(dir, rows) {
  mkdirSync(join(dir, "metrics"), { recursive: true });
  const content = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(join(dir, "metrics/queue-telemetry.jsonl"), content, "utf-8");
}

function makeState() {
  return {
    lastRun: "2026-01-01T00:00:00.000Z",
    currentLevel: 3,
    levelName: "Executor",
    role: "Executor",
    checks: {},
    detectedIds: [],
    behavioral: {
      agent_pr: {
        sample_size: 6,
        merged_count: 5,
        closed_unmerged_count: 0,
        open_count: 1,
        acceptance_rate_30d: 1,
        revert_rate_30d: 0,
        median_time_to_merge_hours: 2,
        human_touch_ratio: 0.4,
        insufficient_data: false,
      },
    },
    history: [],
    issuesCreated: {},
  };
}

function makeComputation() {
  return {
    level: 3,
    levelName: "Executor",
    role: "Executor",
    antiPattern: null,
    nextTransitionTrigger: null,
    missingForNextLevel: [],
    requiredByLevel: { 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 },
    detectedByLevel: { 2: 1, 3: 1, 4: 0, 5: 0, 6: 0 },
    prerequisites: { met: 0, total: 0 },
    crossCutting: {
      learning: { met: 0, total: 0 },
      traceability: { met: 0, total: 0 },
    },
    behavioralGates: [],
  };
}

const SOURCES = [];

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("report: reason breakdown renders beside human-touch-ratio when reasoned rows exist", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  writeTelemetry(dir, [
    { issue_number: 1, human_touch_reason: "review-fix", merged_at: daysAgo(1) },
    { issue_number: 2, human_touch_reason: "review-fix", merged_at: daysAgo(2) },
    { issue_number: 3, human_touch_reason: "ci-failure", merged_at: daysAgo(3) },
    // Outside the 30-day window — must not be counted.
    { issue_number: 4, human_touch_reason: "other", merged_at: daysAgo(40) },
    // No human_touch_reason — must not be counted.
    { issue_number: 5, merged_at: daysAgo(1) },
  ]);

  writeReport(dir, {
    state: makeState(),
    criteria: [],
    sources: SOURCES,
    computation: makeComputation(),
    diff: null,
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  assert.ok(
    report.includes("Human-touch ratio"),
    `Expected human-touch-ratio line but got:\n${report}`
  );
  assert.ok(
    report.includes("review-fix: 2"),
    `Expected review-fix: 2 in breakdown but got:\n${report}`
  );
  assert.ok(
    report.includes("ci-failure: 1"),
    `Expected ci-failure: 1 in breakdown but got:\n${report}`
  );
  assert.ok(
    !report.includes("other: 1"),
    `Row outside the 30-day window must not be counted:\n${report}`
  );
  assert.match(
    report,
    /directional|approximate/i,
    `Expected directional/approximate copy caveat but got:\n${report}`
  );

  cleanup(dir);
});

test("report: no reason breakdown section when no rows carry human_touch_reason", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  writeTelemetry(dir, [{ issue_number: 1, merged_at: daysAgo(1) }]);

  writeReport(dir, {
    state: makeState(),
    criteria: [],
    sources: SOURCES,
    computation: makeComputation(),
    diff: null,
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  assert.ok(
    report.includes("Human-touch ratio"),
    `Existing human-touch-ratio line must still render unchanged:\n${report}`
  );
  assert.ok(
    !report.includes("Reason breakdown"),
    `Zero-data case must not render a breakdown section:\n${report}`
  );

  cleanup(dir);
});

test("report: no queue-telemetry.jsonl file at all — report renders unchanged, no crash", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  assert.doesNotThrow(() => {
    writeReport(dir, {
      state: makeState(),
      criteria: [],
      sources: SOURCES,
      computation: makeComputation(),
      diff: null,
    });
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");
  assert.ok(report.includes("Human-touch ratio"));
  assert.ok(!report.includes("Reason breakdown"));

  cleanup(dir);
});
