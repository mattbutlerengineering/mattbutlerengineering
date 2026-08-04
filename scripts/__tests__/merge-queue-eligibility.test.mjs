import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isAutoMergeEligible, BLOCKED_TIER_LABELS } from "../merge-queue-eligibility.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/merge-queue.yml"), "utf8");
const SKILL_MD = readFileSync(resolve(ROOT, ".claude/skills/implement-queue/SKILL.md"), "utf8");

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

// ---------------------------------------------------------------------------
// implement-queue SKILL.md wiring (#3807) — Phase 2's "Worker→train boundary"
// protocol is a second, hand-followed code path with the same has-pr/
// needs-review-only auto-merge decision merge-queue.yml had before #3796. It
// must call the same isAutoMergeEligible() at both decision points (the
// low-risk fast path, step 2, and the all-pass enqueue, step 5) instead of
// re-deriving the tier check — same spirit as the "merge-queue.yml wiring"
// tests above, but for this markdown source.
// ---------------------------------------------------------------------------

describe("implement-queue SKILL.md wiring (#3807)", () => {
  const boundaryStart = SKILL_MD.indexOf("### Worker→train boundary");
  const step2Start = SKILL_MD.indexOf("2. **Low-risk fast path", boundaryStart);
  const step3Start = SKILL_MD.indexOf("3. **Reviewer sub-agent", step2Start);
  const step5Start = SKILL_MD.indexOf("5. **On all-pass verdict", step3Start);
  const step6Start = SKILL_MD.indexOf('6. **On `"flag"` verdict', step5Start);
  const phase3Start = SKILL_MD.indexOf("## Phase 3", step6Start);

  const step2Section = SKILL_MD.slice(step2Start, step3Start);
  const step5Section = SKILL_MD.slice(step5Start, step6Start);
  const step6Section = SKILL_MD.slice(step6Start, phase3Start);

  it("finds the Worker→train boundary subsection and its numbered steps", () => {
    expect(boundaryStart).toBeGreaterThan(-1);
    expect(step2Start).toBeGreaterThan(boundaryStart);
    expect(step3Start).toBeGreaterThan(step2Start);
    expect(step5Start).toBeGreaterThan(step3Start);
    expect(step6Start).toBeGreaterThan(step5Start);
    expect(phase3Start).toBeGreaterThan(step6Start);
  });

  it("step 2 (low-risk fast path) calls isAutoMergeEligible from merge-queue-eligibility.mjs before its gh pr merge --auto call", () => {
    expect(step2Section).toMatch(/isAutoMergeEligible/);
    expect(step2Section).toMatch(/merge-queue-eligibility\.mjs/);
    const eligibilityAt = step2Section.indexOf("isAutoMergeEligible");
    const mergeAt = step2Section.indexOf("gh pr merge");
    expect(eligibilityAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(eligibilityAt);
  });

  it("step 5 (all-pass enqueue) calls isAutoMergeEligible from merge-queue-eligibility.mjs before its gh pr merge --auto call", () => {
    expect(step5Section).toMatch(/isAutoMergeEligible/);
    expect(step5Section).toMatch(/merge-queue-eligibility\.mjs/);
    const eligibilityAt = step5Section.indexOf("isAutoMergeEligible");
    const mergeAt = step5Section.indexOf("gh pr merge");
    expect(eligibilityAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(eligibilityAt);
  });

  it("documents the blocking-tier outcome as needs-review + do not enqueue, same as step 6's flag/block verdict", () => {
    expect(step6Section).toMatch(/blocking tier/i);
    expect(step6Section).toMatch(/needs-review/);
    expect(step6Section).toMatch(/do not enqueue/i);
  });
});
