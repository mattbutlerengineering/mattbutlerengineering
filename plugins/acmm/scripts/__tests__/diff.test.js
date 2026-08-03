/**
 * Tests for computeDetectionDiff — #3719.
 *
 * A criterion that is `unverifiable` in the CURRENT run (gh CLI absent/erroring)
 * must never show up as "regressed", even if it was detected in the prior run.
 * Its status this run is unknown, not confirmed false — reporting it as a
 * regression (and filing a GitHub issue for it under --apply) is a false
 * positive caused by the running environment, not the codebase.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { computeDetectionDiff } from "../diff.js";

describe("computeDetectionDiff", () => {
  test("first run (no prior lastRun) returns null", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(),
      detectedIds: new Set(["a"]),
      unverifiableIds: new Set(),
      isFirstRun: true,
      currentLevel: 2,
      priorLevel: 0,
    });
    assert.equal(diff, null);
  });

  test("criterion detected before, unverifiable now → excluded from removed", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(["acmm:nightly-compliance", "acmm:claude-md"]),
      detectedIds: new Set(["acmm:claude-md"]),
      unverifiableIds: new Set(["acmm:nightly-compliance"]),
      isFirstRun: false,
      currentLevel: 5,
      priorLevel: 5,
    });
    assert.deepEqual(diff.removed, [], "unverifiable-this-run must not be reported as regressed");
  });

  test("criterion detected before, genuinely absent now (not unverifiable) → still in removed", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(["acmm:claude-md", "acmm:agents-md"]),
      detectedIds: new Set(["acmm:claude-md"]),
      unverifiableIds: new Set(),
      isFirstRun: false,
      currentLevel: 5,
      priorLevel: 5,
    });
    assert.deepEqual(
      diff.removed,
      ["acmm:agents-md"],
      "a real disappearance must still be flagged"
    );
  });

  test("newly detected criterion → in added", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(["acmm:claude-md"]),
      detectedIds: new Set(["acmm:claude-md", "acmm:agents-md"]),
      unverifiableIds: new Set(),
      isFirstRun: false,
      currentLevel: 5,
      priorLevel: 5,
    });
    assert.deepEqual(diff.added, ["acmm:agents-md"]);
  });

  test("mixed: one real regression, one unverifiable-masked non-regression", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(["acmm:real-gap", "acmm:gh-degraded", "acmm:claude-md"]),
      detectedIds: new Set(["acmm:claude-md"]),
      unverifiableIds: new Set(["acmm:gh-degraded"]),
      isFirstRun: false,
      currentLevel: 5,
      priorLevel: 5,
    });
    assert.deepEqual(diff.removed, ["acmm:real-gap"]);
  });

  test("levelDelta and countDelta computed from detected/prior sizes and levels", () => {
    const diff = computeDetectionDiff({
      priorIds: new Set(["a", "b"]),
      detectedIds: new Set(["a", "b", "c"]),
      unverifiableIds: new Set(),
      isFirstRun: false,
      currentLevel: 5,
      priorLevel: 4,
    });
    assert.equal(diff.levelDelta, 1);
    assert.equal(diff.countDelta, 1);
    assert.equal(diff.priorLevel, 4);
    assert.equal(diff.priorCount, 2);
  });
});
