import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { measureEvals, measureJudgedEvals } from "../evals.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-evals-"));
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
      JSON.stringify(run({ success: true, score: 1 })) +
        "\n" +
        "not json\n" +
        JSON.stringify(run({ success: true, score: 0.9 })) +
        "\n",
      "utf-8"
    );
    const s = measureEvals(fx.root);
    assert.equal(s.n, 2);
  } finally {
    fx.cleanup();
  }
});

/* ── measureJudgedEvals: reads metrics/eval-reports.jsonl (#7581) ── */

function reportFixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "acmm-judged-"));
  mkdirSync(join(root, "metrics"), { recursive: true });
  writeFileSync(
    join(root, "metrics/eval-reports.jsonl"),
    rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf-8"
  );
  return root;
}

function judgedTask(overrides = {}) {
  return {
    taskId: "t",
    passed: true,
    score: 1,
    judgeResult: { passed: true, confidence: 0.9, reasoning: "ok" },
    costUsd: 0.5,
    turns: 10,
    ...overrides,
  };
}

test("measureJudgedEvals: ignores rows with no judge result (pre-judge)", () => {
  const root = reportFixture([
    {
      timestamp: new Date().toISOString(),
      adapter: "claude-cli",
      tasks: [{ taskId: "t", passed: true, score: 1 }],
    },
  ]);
  try {
    const s = measureJudgedEvals(root);
    assert.equal(s.n, 0);
    assert.equal(s.lastRun, null);
    assert.equal(s.freshness, "never-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measureJudgedEvals: ignores tasks whose judge could not run", () => {
  const failed = judgedTask({
    passed: false,
    judgeResult: { passed: false, confidence: 0, evaluationFailed: true },
  });
  const root = reportFixture([
    { timestamp: new Date().toISOString(), adapter: "claude-cli", tasks: [failed, failed] },
  ]);
  try {
    const s = measureJudgedEvals(root);
    assert.equal(s.n, 0);
    assert.equal(s.freshness, "never-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measureJudgedEvals: aggregates judged tasks only", () => {
  const ts = new Date().toISOString();
  const root = reportFixture([
    { timestamp: ts, adapter: "claude-cli", tasks: [{ taskId: "old", passed: true, score: 1 }] },
    {
      timestamp: ts,
      adapter: "claude-cli",
      tasks: [
        judgedTask({ passed: true, score: 1 }),
        judgedTask({ passed: true, score: 0.8 }),
        judgedTask({ passed: false, score: 0.4 }),
      ],
    },
  ]);
  try {
    const s = measureJudgedEvals(root);
    assert.equal(s.n, 3);
    assert.equal(s.passRate, 0.6667);
    assert.equal(s.medianScore, 0.8);
    assert.equal(s.lastRun, ts);
    assert.equal(s.freshness, "current");
    assert.deepEqual(Object.keys(s.perModel), ["claude-cli"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("measureJudgedEvals: missing file is never-run, not zero", () => {
  const root = mkdtempSync(join(tmpdir(), "acmm-judged-"));
  try {
    const s = measureJudgedEvals(root);
    assert.equal(s.n, 0);
    assert.equal(s.freshness, "never-run");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
