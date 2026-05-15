import { test } from "node:test";
import assert from "node:assert/strict";

import { runEval, dryRunRunner } from "../evals/run.js";
import { parseTask } from "../evals/schema.js";

function task(overrides = {}) {
  return parseTask({
    id: "t",
    prompt: "do a thing",
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 0.1,
    maxTurns: 5,
    rubric: { mustPass: ["lint"], diffSizeMax: 5, mustTouch: ["README.md"] },
    ...overrides,
  });
}

test("runEval: scores an injected runner result", async () => {
  const result = await runEval(task(), {
    runner: async () => ({
      outcome: { completed: true, verification: "pass", diffSize: 3, touchedFiles: ["README.md"] },
      costUsd: 0.07,
      numTurns: 4,
    }),
  });
  assert.equal(result.taskId, "t");
  assert.equal(result.success, true);
  assert.equal(result.costUsd, 0.07);
  assert.equal(result.numTurns, 4);
  assert.ok(typeof result.timestamp === "string");
  assert.ok(result.durationMs >= 0);
});

test("runEval: catches runner exceptions and records error", async () => {
  const result = await runEval(task(), {
    runner: async () => {
      throw new Error("boom");
    },
  });
  assert.equal(result.success, false);
  assert.equal(result.error, "boom");
  assert.equal(result.breakdown.completed, false);
});

test("runEval: dry-run mode produces deterministic synthetic outcome", async () => {
  const a = await runEval(task({ id: "stable-id" }), { dryRun: true });
  const b = await runEval(task({ id: "stable-id" }), { dryRun: true });
  assert.equal(a.success, b.success);
  assert.equal(a.score, b.score);
});

test("dryRunRunner: respects rubric mustTouch when synthesizing", async () => {
  const t = task({
    id: "x",
    rubric: { mustPass: ["lint"], diffSizeMax: 5, mustTouch: ["foo/bar.js"] },
  });
  const r = await dryRunRunner(t);
  // Either synthetic-pass with the required path, or synthetic-fail with empty
  if (r.outcome.verification === "pass") {
    assert.deepEqual(r.outcome.touchedFiles, ["foo/bar.js"]);
  } else {
    assert.deepEqual(r.outcome.touchedFiles, []);
  }
});
