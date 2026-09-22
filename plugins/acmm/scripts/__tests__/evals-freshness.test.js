/**
 * Tests for evals-freshness.js — the classifier that keeps a carried-forward
 * eval reading from being published as a current one (#4199).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { classifyEvalsReading, formatEvalsLine } from "../evals-freshness.js";
import { measureEvals } from "../evals.js";
import { writeReport } from "../outputs/report.js";

/** The real `.claude/acmm/state.json` reading as committed on 2026-09-21. */
const REAL_STALE_READING = {
  n: 37,
  passRate: 0.8649,
  medianScore: 1,
  medianCostUsd: 0,
  medianTurns: 0,
  windowDays: 30,
  lastRun: "2026-05-10T21:42:57.095Z",
  perModel: { "claude-sonnet-4-6": { n: 37, passRate: 0.8649, medianScore: 1 } },
  status: "green",
  measured_at: "2026-05-30T17:04:57.036Z",
};

const NOW = new Date("2026-09-21T16:05:37.515Z");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-evals-freshness-"));
  return {
    root,
    seed(rows) {
      mkdirSync(join(root, "metrics"), { recursive: true });
      writeFileSync(
        join(root, "metrics/acmm-evals.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
        "utf-8"
      );
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function row(overrides = {}) {
  return {
    timestamp: NOW.toISOString(),
    taskId: "t",
    model: "claude-sonnet-4-6",
    success: true,
    score: 0.9,
    costUsd: 0.05,
    numTurns: 4,
    durationMs: 1000,
    ...overrides,
  };
}

/* ── classifyEvalsReading ───────────────────────────────── */

test("classifyEvalsReading: no reading at all is `absent`", () => {
  assert.equal(classifyEvalsReading(null, { now: NOW }).state, "absent");
  assert.equal(classifyEvalsReading(undefined, { now: NOW }).state, "absent");
});

test("classifyEvalsReading: a reading evidencing no run is `never-run`", () => {
  const reading = { n: 0, passRate: 0, medianScore: 0, lastRun: null, status: "unknown" };
  assert.equal(classifyEvalsReading(reading, { now: NOW }).state, "never-run");
});

test("classifyEvalsReading: an in-window run is `current`", () => {
  const reading = { n: 5, lastRun: "2026-09-20T00:00:00.000Z", status: "green" };
  const verdict = classifyEvalsReading(reading, { now: NOW, windowDays: 30 });
  assert.equal(verdict.state, "current");
  assert.equal(verdict.ageDays, 1);
});

test("classifyEvalsReading: the real 2026-09-21 state.json reading is `stale`, not `current`", () => {
  const verdict = classifyEvalsReading(REAL_STALE_READING, { now: NOW, windowDays: 30 });
  assert.equal(verdict.state, "stale");
  assert.equal(verdict.ageDays, 133);
});

test("classifyEvalsReading: classifies on lastRun, not measured_at", () => {
  // measured_at is when the *audit* looked — always recent, which is exactly
  // why the staleness was invisible. A reading re-stamped today whose
  // underlying run is four months old must still be stale.
  const reading = { ...REAL_STALE_READING, measured_at: NOW.toISOString() };
  assert.equal(classifyEvalsReading(reading, { now: NOW, windowDays: 30 }).state, "stale");
});

test("classifyEvalsReading: an unestablishable age never reads as `current`", () => {
  const reading = { n: 37, lastRun: "not-a-timestamp", status: "green" };
  const verdict = classifyEvalsReading(reading, { now: NOW, windowDays: 30 });
  assert.equal(verdict.state, "stale");
  assert.equal(verdict.ageDays, null);
});

/* ── formatEvalsLine ────────────────────────────────────── */

test("formatEvalsLine: a stale reading never renders as a bare pass-rate", () => {
  const line = formatEvalsLine(REAL_STALE_READING, { now: NOW, windowDays: 30 });
  assert.match(line, /stale/i);
  assert.match(line, /133 days/);
  assert.match(line, /2026-05-10/);
  // The exact string the audit printed nightly as if it were a current reading.
  assert.ok(
    !line.includes("86% pass · score 1.00 (n=37, status: green)"),
    `stale reading must not render as a current one, got: ${line}`
  );
});

test("formatEvalsLine: a current reading still renders the number", () => {
  const reading = {
    n: 5,
    passRate: 0.8,
    medianScore: 0.9,
    lastRun: "2026-09-20T00:00:00.000Z",
    status: "green",
  };
  const line = formatEvalsLine(reading, { now: NOW, windowDays: 30 });
  assert.match(line, /80% pass/);
  assert.match(line, /n=5/);
  assert.match(line, /status: green/);
  assert.ok(!/stale/i.test(line), `current reading must not be labelled stale, got: ${line}`);
});

test("formatEvalsLine: absent and never-run are distinguishable from a scored zero", () => {
  const absent = formatEvalsLine(null, { now: NOW, windowDays: 30 });
  assert.match(absent, /no runs/i);
  assert.ok(!absent.includes("0% pass"), `absent must not render as 0% pass, got: ${absent}`);

  const neverRun = formatEvalsLine(
    { n: 0, passRate: 0, medianScore: 0, lastRun: null, status: "unknown" },
    { now: NOW, windowDays: 30 }
  );
  assert.match(neverRun, /no runs/i);
  assert.ok(
    !neverRun.includes("0% pass"),
    `never-run must not render as 0% pass, got: ${neverRun}`
  );
});

/* ── measureEvals freshness ─────────────────────────────── */

test("measureEvals: a missing corpus is `never-run` with no lastRun", () => {
  const fx = fixture();
  try {
    const s = measureEvals(fx.root, { now: NOW, windowDays: 30 });
    assert.equal(s.freshness, "never-run");
    assert.equal(s.lastRun, null);
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: rows that all fall outside the window are `stale`, not `never-run`", () => {
  // The live acmm-evals.jsonl shape: 37 real rows, every one months old. Before
  // this distinction existed both cases collapsed to n=0 / lastRun=null, so
  // "the harness ran in May and stopped" was indistinguishable from "the
  // harness has never run".
  const fx = fixture();
  try {
    fx.seed([
      row({ timestamp: "2026-05-07T05:20:08.587Z" }),
      row({ timestamp: "2026-05-10T21:42:57.095Z" }),
    ]);
    const s = measureEvals(fx.root, { now: NOW, windowDays: 30 });
    assert.equal(s.n, 0);
    assert.equal(s.freshness, "stale");
    assert.equal(s.lastRun, "2026-05-10T21:42:57.095Z");
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: in-window rows are `current`", () => {
  const fx = fixture();
  try {
    fx.seed([row(), row(), row()]);
    const s = measureEvals(fx.root, { now: NOW, windowDays: 30 });
    assert.equal(s.n, 3);
    assert.equal(s.freshness, "current");
  } finally {
    fx.cleanup();
  }
});

/* ── report.md rendering ────────────────────────────────── */

function reportFor(evals) {
  const fx = fixture();
  try {
    const reportPath = writeReport(fx.root, {
      state: {
        detectedIds: [],
        history: [],
        behavioral: { evals },
        lastRun: new Date().toISOString(),
        currentLevel: 1,
        levelName: "Assisted / Ad Hoc",
        role: "Executor",
      },
      criteria: [],
      sources: [],
      computation: {
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
        crossCutting: { learning: { met: 0, total: 0 }, traceability: { met: 0, total: 0 } },
        behavioralGates: [],
      },
      diff: null,
    });
    return readFileSync(reportPath, "utf-8");
  } finally {
    fx.cleanup();
  }
}

test("writeReport: a stale reading is labelled stale, not published as a current green", () => {
  const content = reportFor(REAL_STALE_READING);
  assert.match(content, /## Agent evals \(last 30 days\)/);
  assert.match(content, /Stale — no eval run in this window/);
  assert.match(content, /2026-05-10/);
  // The unqualified bullet the report published nightly for a May measurement.
  assert.ok(
    !content.includes("- **✅ Pass rate:** 86% (n=37)"),
    "a stale reading must not render as the current-reading bullet"
  );
});

test("writeReport: a current reading still publishes the normal metrics block", () => {
  const content = reportFor({
    ...REAL_STALE_READING,
    lastRun: new Date().toISOString(),
  });
  assert.match(content, /- \*\*✅ Pass rate:\*\* 86% \(n=37\)/);
  assert.ok(!/Stale — no eval run/.test(content), "a current reading must not be labelled stale");
});
