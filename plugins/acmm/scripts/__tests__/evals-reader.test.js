import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { measureEvals } from "../evals.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-evals-"));
  return {
    root,
    seed(rows) {
      mkdirSync(join(root, "metrics"), { recursive: true });
      writeFileSync(
        join(root, "metrics/acmm-evals.jsonl"),
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
        "utf-8",
      );
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function run(overrides = {}) {
  return {
    timestamp: new Date().toISOString(),
    taskId: "t",
    model: "claude-sonnet-4-6",
    success: true,
    score: 0.9,
    breakdown: {},
    costUsd: 0.05,
    numTurns: 4,
    durationMs: 1000,
    ...overrides,
  };
}

test("measureEvals: returns empty/unknown when JSONL missing", () => {
  const fx = fixture();
  try {
    const s = measureEvals(fx.root);
    assert.equal(s.n, 0);
    assert.equal(s.status, "unknown");
    assert.equal(s.lastRun, null);
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: aggregates pass rate and median score", () => {
  const fx = fixture();
  try {
    fx.seed([
      run({ success: true, score: 0.9 }),
      run({ success: true, score: 0.8 }),
      run({ success: false, score: 0.4 }),
      run({ success: true, score: 0.95 }),
    ]);
    const s = measureEvals(fx.root);
    assert.equal(s.n, 4);
    assert.equal(s.passRate, 0.75);
    assert.equal(s.medianScore, 0.85);
    assert.equal(s.status, "yellow"); // 75% pass rate is yellow (<0.8)
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: status bands (green ≥0.8, yellow ≥0.5, red <0.5)", () => {
  const fx = fixture();
  try {
    fx.seed([
      run({ success: true, score: 0.9 }),
      run({ success: true, score: 0.9 }),
      run({ success: true, score: 0.9 }),
      run({ success: true, score: 0.9 }),
      run({ success: false, score: 0.4 }),
    ]);
    assert.equal(measureEvals(fx.root).status, "green"); // 80%
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: unknown when n < 3", () => {
  const fx = fixture();
  try {
    fx.seed([run({ success: true }), run({ success: true })]);
    assert.equal(measureEvals(fx.root).status, "unknown");
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: window filters out runs older than windowDays", () => {
  const fx = fixture();
  try {
    const now = new Date("2026-04-26T00:00:00Z");
    const old = new Date("2026-01-01T00:00:00Z").toISOString(); // ~115 days old
    const recent = new Date("2026-04-20T00:00:00Z").toISOString();
    fx.seed([
      run({ timestamp: old, success: true }),
      run({ timestamp: old, success: true }),
      run({ timestamp: recent, success: false }),
    ]);
    const s = measureEvals(fx.root, { windowDays: 30, now });
    assert.equal(s.n, 1);
    assert.equal(s.passRate, 0);
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: per-model breakdown", () => {
  const fx = fixture();
  try {
    fx.seed([
      run({ model: "claude-sonnet-4-6", success: true, score: 0.9 }),
      run({ model: "claude-sonnet-4-6", success: true, score: 0.9 }),
      run({ model: "claude-opus-4-7", success: false, score: 0.4 }),
    ]);
    const s = measureEvals(fx.root);
    assert.equal(s.perModel["claude-sonnet-4-6"].n, 2);
    assert.equal(s.perModel["claude-sonnet-4-6"].passRate, 1);
    assert.equal(s.perModel["claude-opus-4-7"].passRate, 0);
  } finally {
    fx.cleanup();
  }
});

test("measureEvals: skips malformed JSONL lines", () => {
  const fx = fixture();
  try {
    mkdirSync(join(fx.root, "metrics"), { recursive: true });
    writeFileSync(
      join(fx.root, "metrics/acmm-evals.jsonl"),
      JSON.stringify(run({ success: true, score: 1 })) + "\n" +
        "not json\n" +
        JSON.stringify(run({ success: true, score: 0.9 })) + "\n",
      "utf-8",
    );
    const s = measureEvals(fx.root);
    assert.equal(s.n, 2);
  } finally {
    fx.cleanup();
  }
});
