import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isDiffTooLargeError } from "../gh-diff-failure.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const AUTO_REVIEW_WORKFLOW = readFileSync(
  resolve(ROOT, ".github/workflows/auto-review.yml"),
  "utf8"
);

describe("isDiffTooLargeError", () => {
  it("recognizes the too_large / 406 error gh pr diff emits past the 20000-line cap", () => {
    // Real output observed on PR #5117:
    // "could not find pull request diff: HTTP 406: Sorry, the diff exceeded
    // the maximum number of lines (20000) ... PullRequest.diff too_large"
    const output =
      "could not find pull request diff: HTTP 406: Sorry, the diff exceeded " +
      "the maximum number of lines (20000) for pull request 5117 ...\n" +
      "PullRequest.diff too_large";
    expect(isDiffTooLargeError(output)).toBe(true);
  });

  it("recognizes the error even without the literal too_large code, via the line-cap message", () => {
    const output = "HTTP 406: Sorry, the diff exceeded the maximum number of lines (20000)";
    expect(isDiffTooLargeError(output)).toBe(true);
  });

  it("does not treat an unrelated gh failure as the size cap", () => {
    expect(isDiffTooLargeError("HTTP 404: Not Found")).toBe(false);
    expect(isDiffTooLargeError("gh: connection reset by peer")).toBe(false);
    expect(isDiffTooLargeError("HTTP 401: Bad credentials")).toBe(false);
  });

  it("fails closed (not-too-large) on empty or non-string input", () => {
    expect(isDiffTooLargeError("")).toBe(false);
    expect(isDiffTooLargeError(undefined)).toBe(false);
    expect(isDiffTooLargeError(null)).toBe(false);
  });
});

describe("auto-review.yml — oversized-diff handling (#5156)", () => {
  it("classifies gh pr diff failures via the pure gh-diff-failure.mjs script", () => {
    expect(AUTO_REVIEW_WORKFLOW).toContain("scripts/gh-diff-failure.mjs");
  });

  it("does not fail the job when the diff is oversized", () => {
    expect(AUTO_REVIEW_WORKFLOW).toMatch(/diff_too_large/);
  });

  it("gates the heuristic review step on the diff not being oversized", () => {
    const reviewStepIndex = AUTO_REVIEW_WORKFLOW.indexOf("name: Run review checks");
    const reviewStepBlock = AUTO_REVIEW_WORKFLOW.slice(reviewStepIndex, reviewStepIndex + 400);
    expect(reviewStepBlock).toMatch(/if:\s*steps\.changes\.outputs\.diff_too_large\s*!=\s*'true'/);
  });

  it("posts a neutral note instead of the pass/fail comments when the diff is oversized", () => {
    expect(AUTO_REVIEW_WORKFLOW).toMatch(/diff too large/i);
  });
});
