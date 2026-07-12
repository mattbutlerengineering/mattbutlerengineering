import { describe, it, expect } from "vitest";
import { evaluationSkipDecision } from "../evaluation-skip-policy.js";

function buildDiff(files: string[], linesPerFile = 5): string {
  return files
    .map((f) => {
      const lines = Array.from({ length: linesPerFile }, (_, i) => `+line ${i + 1}`).join("\n");
      return `diff --git a/${f} b/${f}\n${lines}`;
    })
    .join("\n");
}

/**
 * Builds a realistic `git diff`-style unified diff, including the `---`/`+++`
 * file headers that `buildDiff()` above omits. `evaluationSkipDecision`'s
 * small-diff threshold counts those header lines (2 per file) toward the
 * total, so boundary tests must use this helper to be diagnostic.
 */
function buildRealisticDiff(files: { path: string; addedLines: number }[]): string {
  return files
    .map(({ path, addedLines }) => {
      const content = Array.from({ length: addedLines }, (_, i) => `+line ${i + 1}`).join("\n");
      return [
        `diff --git a/${path} b/${path}`,
        `--- a/${path}`,
        `+++ b/${path}`,
        `@@ -1,0 +1,${addedLines} @@`,
        content,
      ].join("\n");
    })
    .join("\n");
}

describe("evaluationSkipDecision", () => {
  it("does not skip a normal non-trivial diff", () => {
    const diff = buildDiff(["src/routes.ts"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({ skip: false });
  });

  // ── empty_diff ──────────────────────────────────────────────────────

  it("skips an empty diff with reason empty_diff", () => {
    expect(evaluationSkipDecision({ diff: "" })).toEqual({
      skip: true,
      reason: "empty_diff",
    });
  });

  it("skips a whitespace-only diff with reason empty_diff", () => {
    expect(evaluationSkipDecision({ diff: "   \n  \n" })).toEqual({
      skip: true,
      reason: "empty_diff",
    });
  });

  // ── trivial_commit ──────────────────────────────────────────────────

  it("skips a chore(deps): commit title with reason trivial_commit", () => {
    const diff = buildDiff(["package.json"], 100);
    expect(
      evaluationSkipDecision({
        diff,
        commitTitle: "chore(deps): bump lodash to 4.18",
      })
    ).toEqual({ skip: true, reason: "trivial_commit" });
  });

  it("skips a fix(security): commit title with reason trivial_commit", () => {
    const diff = buildDiff(["package-lock.json"], 200);
    expect(
      evaluationSkipDecision({
        diff,
        commitTitle: "fix(security): patch CVE-2025-1234",
      })
    ).toEqual({ skip: true, reason: "trivial_commit" });
  });

  it("is case-insensitive for dependency bump titles", () => {
    const diff = buildDiff(["package.json"], 100);
    expect(evaluationSkipDecision({ diff, commitTitle: "CHORE(DEPS): upgrade all" })).toEqual({
      skip: true,
      reason: "trivial_commit",
    });
  });

  it("does not skip a regular feat: commit title", () => {
    const diff = buildDiff(["src/feature.ts"], 100);
    expect(evaluationSkipDecision({ diff, commitTitle: "feat: add new endpoint" })).toEqual({
      skip: false,
    });
  });

  // ── test_only_changes ───────────────────────────────────────────────

  it("skips when only .test.ts files changed with reason test_only_changes", () => {
    const diff = buildDiff(["src/routes.test.ts", "src/utils.test.ts"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({
      skip: true,
      reason: "test_only_changes",
    });
  });

  it("skips when only .spec.ts files changed", () => {
    const diff = buildDiff(["src/auth.spec.ts"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({
      skip: true,
      reason: "test_only_changes",
    });
  });

  it("skips when only .test.js files changed", () => {
    const diff = buildDiff(["src/helpers.test.js"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({
      skip: true,
      reason: "test_only_changes",
    });
  });

  it("skips when only .spec.jsx files changed", () => {
    const diff = buildDiff(["src/Button.spec.jsx"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({
      skip: true,
      reason: "test_only_changes",
    });
  });

  it("does not skip when mix of test and non-test files changed", () => {
    const diff = buildDiff(["src/routes.ts", "src/routes.test.ts"], 60);
    expect(evaluationSkipDecision({ diff })).toEqual({ skip: false });
  });

  it("does not skip when no file headers are present in diff", () => {
    const diff = "+some change\n-old line";
    expect(evaluationSkipDecision({ diff })).toEqual({ skip: false });
  });

  // ── small_diff_tests_passed ─────────────────────────────────────────

  it("skips when diff < 50 lines and tests passed with reason small_diff_tests_passed", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({
      skip: true,
      reason: "small_diff_tests_passed",
    });
  });

  it("does not skip when diff < 50 lines but tests did NOT pass", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(evaluationSkipDecision({ diff, testsPassed: false })).toEqual({
      skip: false,
    });
  });

  it("does not skip when diff < 50 lines and testsPassed is undefined", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(evaluationSkipDecision({ diff })).toEqual({ skip: false });
  });

  it("does not skip when diff >= 50 lines even if tests passed", () => {
    const diff = buildDiff(["src/routes.ts"], 55);
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({
      skip: false,
    });
  });

  // ── small_diff_tests_passed: realistic diffs (with ---/+++ headers) ─
  //
  // The `---`/`+++` file headers count toward the SMALL_DIFF_LINE_LIMIT
  // total (2 lines/file), matching legacy `countDiffLines` semantics.
  // `buildDiff()` above omits those headers, so it can't pin this boundary
  // — these use `buildRealisticDiff()` instead.

  it("does not skip a single-file diff with 49 real changed lines (51 total, at the boundary)", () => {
    const diff = buildRealisticDiff([{ path: "src/app.ts", addedLines: 49 }]);
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({ skip: false });
  });

  it("does not skip a 5-file diff with 45 real changed lines total (55 total)", () => {
    const diff = buildRealisticDiff(
      Array.from({ length: 5 }, (_, i) => ({ path: `src/file${i}.ts`, addedLines: 9 }))
    );
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({ skip: false });
  });

  it("skips a single-file diff just below the limit (47 real lines, 49 total)", () => {
    const diff = buildRealisticDiff([{ path: "src/app.ts", addedLines: 47 }]);
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({
      skip: true,
      reason: "small_diff_tests_passed",
    });
  });

  it("does not skip a single-file diff exactly at the limit (48 real lines, 50 total)", () => {
    const diff = buildRealisticDiff([{ path: "src/app.ts", addedLines: 48 }]);
    expect(evaluationSkipDecision({ diff, testsPassed: true })).toEqual({ skip: false });
  });

  // ── precedence: trivial_commit before test_only / small-diff ────────

  it("prefers trivial_commit reason over test-only when both apply", () => {
    const diff = buildDiff(["src/foo.test.ts"], 20);
    expect(
      evaluationSkipDecision({
        diff,
        commitTitle: "chore(deps): bump x",
        testsPassed: true,
      })
    ).toEqual({ skip: true, reason: "trivial_commit" });
  });
});
