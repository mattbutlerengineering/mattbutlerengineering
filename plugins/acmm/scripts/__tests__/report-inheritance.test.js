/**
 * Tests for local/inherited origin markers in sub-project ACMM reports.
 *
 * Issue #2012 — when auditing a sub-project with inheritance enabled, each
 * detected criterion should be marked `[local]` or `[inherited]`, and each
 * per-level section should show a summary count (e.g. "L4: 2 local / 1 inherited").
 * Root-level audits must be unaffected (no markers).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { writeReport } from "../outputs/report.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function tmpDir() {
  return mkdtempSync(join(tmpdir(), "acmm-report-"));
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/** Minimal state shape that writeReport() needs. */
function makeState(detectedIds = []) {
  return {
    lastRun: "2026-01-01T00:00:00.000Z",
    currentLevel: 3,
    levelName: "Executor",
    role: "Executor",
    checks: Object.fromEntries(
      detectedIds.map((id) => [id, { passed: true, evidence: "detected at: test-path" }])
    ),
    detectedIds,
    behavioral: null,
    history: [],
    issuesCreated: {},
  };
}

/** Minimal computation shape. */
function makeComputation(level = 3) {
  return {
    level,
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

/** Two minimal criteria at different levels. */
const CRITERIA_L2 = [
  {
    id: "crit-local-1",
    level: 2,
    source: "acmm",
    category: "foundation",
    name: "Local criterion",
    description: "Satisfied locally",
    detection: { type: "path", pattern: "AGENTS.md" },
  },
];
const CRITERIA_L3 = [
  {
    id: "crit-inherited-1",
    level: 3,
    source: "acmm",
    category: "ci",
    name: "Inherited criterion",
    description: "Satisfied via repo root",
    detection: { type: "path", pattern: ".github/workflows/ci.yml" },
  },
];
const ALL_CRITERIA = [...CRITERIA_L2, ...CRITERIA_L3];

const SOURCES = [
  {
    id: "acmm",
    name: "ACMM",
    url: "https://example.com",
    citation: "ACMM",
    criteria: ALL_CRITERIA,
  },
];

// ── Tests ──────────────────────────────────────────────────────────────────

test("report: sub-project with inheritance — detected criteria marked [local] and [inherited]", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  const detectedIds = ["crit-local-1", "crit-inherited-1"];
  const state = makeState(detectedIds);
  const computation = makeComputation(3);

  // origins map: one local, one inherited
  const origins = new Map([
    ["crit-local-1", "local"],
    ["crit-inherited-1", "inherited"],
  ]);

  writeReport(dir, {
    state,
    criteria: ALL_CRITERIA,
    sources: SOURCES,
    computation,
    diff: null,
    hollowCriteria: [],
    origins,
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  // Local criterion should show [local] marker
  assert.ok(report.includes("[local]"), `Expected [local] marker in report but got:\n${report}`);

  // Inherited criterion should show [inherited] marker
  assert.ok(
    report.includes("[inherited]"),
    `Expected [inherited] marker in report but got:\n${report}`
  );

  cleanup(dir);
});

test("report: sub-project — per-level summary shows local/inherited counts", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  const detectedIds = ["crit-local-1", "crit-inherited-1"];
  const state = makeState(detectedIds);
  const computation = makeComputation(3);

  const origins = new Map([
    ["crit-local-1", "local"],
    ["crit-inherited-1", "inherited"],
  ]);

  writeReport(dir, {
    state,
    criteria: ALL_CRITERIA,
    sources: SOURCES,
    computation,
    diff: null,
    hollowCriteria: [],
    origins,
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  // Level 2 has 1 local, 0 inherited
  assert.ok(
    report.includes("1 local"),
    `Expected "1 local" count in L2 section but got:\n${report}`
  );

  // Level 3 has 0 local, 1 inherited
  assert.ok(
    report.includes("1 inherited"),
    `Expected "1 inherited" count in L3 section but got:\n${report}`
  );

  cleanup(dir);
});

test("report: root-level audit — no [local] or [inherited] markers appear", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  const detectedIds = ["crit-local-1"];
  const state = makeState(detectedIds);
  const computation = makeComputation(2);

  // Root audit: no origins map passed
  writeReport(dir, {
    state,
    criteria: ALL_CRITERIA,
    sources: SOURCES,
    computation,
    diff: null,
    hollowCriteria: [],
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  assert.ok(
    !report.includes("[local]"),
    `Root audit report should NOT contain [local] but got:\n${report}`
  );
  assert.ok(
    !report.includes("[inherited]"),
    `Root audit report should NOT contain [inherited] but got:\n${report}`
  );

  cleanup(dir);
});

test("report: sub-project — not-found criteria have no origin marker", () => {
  const dir = tmpDir();
  mkdirSync(join(dir, ".claude/acmm"), { recursive: true });

  // Only crit-local-1 detected, crit-inherited-1 not found
  const detectedIds = ["crit-local-1"];
  const state = makeState(detectedIds);
  const computation = makeComputation(2);

  const origins = new Map([
    ["crit-local-1", "local"],
    ["crit-inherited-1", "not-found"],
  ]);

  writeReport(dir, {
    state,
    criteria: ALL_CRITERIA,
    sources: SOURCES,
    computation,
    diff: null,
    hollowCriteria: [],
    origins,
  });

  const report = readFileSync(join(dir, ".claude/acmm/report.md"), "utf-8");

  // Only local marker — no inherited since crit-inherited-1 is not-found
  assert.ok(report.includes("[local]"), `Expected [local] marker for detected local criterion`);
  assert.ok(
    !report.includes("[inherited]"),
    `Should NOT have [inherited] marker when origin is not-found`
  );

  cleanup(dir);
});
