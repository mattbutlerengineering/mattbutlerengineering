import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isAutoMergeEligible, BLOCKED_TIER_LABELS } from "../merge-queue-eligibility.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/merge-queue.yml"), "utf8");

// ---------------------------------------------------------------------------
// isAutoMergeEligible — pure decision (#3787)
//
// docs/change-tiers.md: "T2 and above always require human approval. The
// user (Matt) is the only required reviewer." Pre-#3787, merge-queue.yml
// only read has-pr/needs-review, so a tier:standard/sensitive/critical PR
// with no needs-review label got auto-merge enabled anyway (reproduced live
// on PR #3786, a tier:sensitive turbo.json change).
// ---------------------------------------------------------------------------

describe("isAutoMergeEligible", () => {
  it("is eligible for has-pr with no tier label and no needs-review (today's behavior preserved)", () => {
    const result = isAutoMergeEligible(["has-pr"]);
    expect(result.eligible).toBe(true);
  });

  it("is eligible for has-pr + tier:trivial with no needs-review", () => {
    const result = isAutoMergeEligible(["has-pr", "tier:trivial"]);
    expect(result.eligible).toBe(true);
  });

  it("is not eligible when has-pr is missing", () => {
    const result = isAutoMergeEligible(["tier:trivial"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/has-pr/);
  });

  it("is not eligible when needs-review is present (unchanged behavior)", () => {
    const result = isAutoMergeEligible(["has-pr", "needs-review"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/needs-review/);
  });

  for (const tier of BLOCKED_TIER_LABELS) {
    it(`is not eligible for has-pr + ${tier} even with no needs-review label (#3787)`, () => {
      const result = isAutoMergeEligible(["has-pr", tier]);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(new RegExp(tier.replace(":", "\\:")));
    });
  }

  it("reproduces PR #3786: tier:sensitive + has-pr, no needs-review -> blocked", () => {
    // Live incident (2026-08-04): #3786 (turbo.json, correctly tier:sensitive)
    // had auto-merge enabled twice by this workflow because it carried no
    // needs-review label. This is the regression case #3787 fixes.
    const result = isAutoMergeEligible(["has-pr", "tier:sensitive"]);
    expect(result.eligible).toBe(false);
  });

  it("blocks tier:critical even alongside has-pr and no needs-review", () => {
    const result = isAutoMergeEligible(["has-pr", "tier:critical"]);
    expect(result.eligible).toBe(false);
  });

  it("treats a missing labels array as ineligible (no has-pr)", () => {
    expect(isAutoMergeEligible().eligible).toBe(false);
    expect(isAutoMergeEligible([]).eligible).toBe(false);
  });

  it("does not mutate the input array", () => {
    const labels = ["has-pr", "tier:trivial"];
    const snapshot = JSON.stringify(labels);
    isAutoMergeEligible(labels);
    expect(JSON.stringify(labels)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// Workflow wiring — merge-queue.yml must call the eligibility script and gate
// `gh pr merge --auto` on its result, not on a re-typed has-pr/needs-review
// check that would silently drift from isAutoMergeEligible again.
// ---------------------------------------------------------------------------

describe("merge-queue.yml wiring", () => {
  it("invokes merge-queue-eligibility.mjs instead of a bespoke label check", () => {
    expect(WORKFLOW).toMatch(/node scripts\/merge-queue-eligibility\.mjs check/);
  });

  it("gates gh pr merge --auto on the eligibility result", () => {
    const mergeAt = WORKFLOW.indexOf("gh pr merge");
    const eligibilityAt = WORKFLOW.indexOf("merge-queue-eligibility.mjs");
    expect(eligibilityAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(eligibilityAt);
  });
});
