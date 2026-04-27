import { test } from "node:test";
import assert from "node:assert/strict";

import { scoreRun } from "../evals/score.js";
import { parseTask, PASS_THRESHOLD } from "../evals/schema.js";

function baseTask(overrides = {}) {
  return parseTask({
    id: "t",
    prompt: "do a thing",
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 0.10,
    maxTurns: 5,
    rubric: {
      mustPass: ["lint"],
      diffSizeMax: 5,
      mustTouch: ["README.md"],
      mustNotTouch: ["package.json"],
      ...(overrides.rubric ?? {}),
    },
    ...overrides,
  });
}

test("scoreRun: perfect run scores 1.0 and is success", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: true,
    verification: "pass",
    diffSize: 3,
    touchedFiles: ["README.md"],
  });
  assert.equal(out.score, 1);
  assert.equal(out.success, true);
  assert.equal(out.breakdown.touchedRequired, true);
  assert.equal(out.breakdown.avoidedForbidden, true);
});

test("scoreRun: failing verification drops below pass threshold", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: true,
    verification: "fail",
    diffSize: 3,
    touchedFiles: ["README.md"],
  });
  assert.ok(out.score < PASS_THRESHOLD, `expected score < ${PASS_THRESHOLD}, got ${out.score}`);
  assert.equal(out.success, false);
});

test("scoreRun: oversized diff fails diffSizeOk but partial credit elsewhere", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: true,
    verification: "pass",
    diffSize: 999,
    touchedFiles: ["README.md"],
  });
  assert.equal(out.breakdown.diffSizeOk, false);
  assert.ok(out.score > 0 && out.score < 1);
});

test("scoreRun: touching forbidden file flips avoidedForbidden", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: true,
    verification: "pass",
    diffSize: 1,
    touchedFiles: ["README.md", "package.json"],
  });
  assert.equal(out.breakdown.avoidedForbidden, false);
});

test("scoreRun: missing required file flips touchedRequired", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: true,
    verification: "pass",
    diffSize: 1,
    touchedFiles: ["src/other.js"],
  });
  assert.equal(out.breakdown.touchedRequired, false);
});

test("scoreRun: not completed cannot succeed", () => {
  const task = baseTask();
  const out = scoreRun(task, {
    completed: false,
    verification: "skip",
    diffSize: 0,
    touchedFiles: [],
  });
  assert.equal(out.success, false);
  assert.equal(out.breakdown.completed, false);
});

test("scoreRun: weights override default contribution", () => {
  // Make completed worth 99% of the score
  const task = baseTask({
    rubric: {
      mustPass: ["lint"],
      diffSizeMax: 5,
      mustTouch: ["README.md"],
      mustNotTouch: ["package.json"],
      weights: { completed: 99, verification: 0.01, diffSize: 0.01, filePaths: 0.01 },
    },
  });
  const out = scoreRun(task, {
    completed: true,
    verification: "fail",
    diffSize: 999,
    touchedFiles: [],
  });
  assert.ok(out.score > 0.99, `expected >0.99, got ${out.score}`);
});

test("parseTask: rejects missing fields", () => {
  assert.throws(() => parseTask({ id: "x" }), /missing required field/);
});

test("parseTask: rejects unknown gate", () => {
  assert.throws(
    () =>
      parseTask({
        id: "t",
        prompt: "p",
        model: "m",
        maxBudgetUsd: 0.1,
        maxTurns: 1,
        rubric: { mustPass: ["typecheck"], diffSizeMax: 1, mustTouch: ["x"] },
      }),
    /unknown gate/,
  );
});

test("parseTask: defaults baseBranch to 'main'", () => {
  const t = parseTask({
    id: "t",
    prompt: "p",
    model: "m",
    maxBudgetUsd: 0.1,
    maxTurns: 1,
    rubric: { mustPass: ["lint"], diffSizeMax: 1, mustTouch: ["x"] },
  });
  assert.equal(t.baseBranch, "main");
});
