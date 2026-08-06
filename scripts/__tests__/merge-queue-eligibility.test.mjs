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
// implement-queue SKILL.md wiring — Phase 2's "Worker→train boundary"
// protocol is a second, hand-followed code path from merge-queue.yml's.
// #3807 originally required both to call the same isAutoMergeEligible() so
// the tier check couldn't drift between them. #3861 (2026-08-06) deliberately
// reversed that for THIS skill only: a review-gated session (Reviewer +
// diff-matched specialists) no longer re-checks tier at all — see the
// skill's "No tier hold" section. merge-queue.yml and auto-merge.yml, which
// merge on CI signal alone with no review gate, are unaffected and still
// gate on isAutoMergeEligible (see the "merge-queue.yml wiring" tests
// above). Do not restore the isAutoMergeEligible assertions here — that
// would re-pin the exact deadlock #3861 fixed (three review-gate-passed
// PRs parked, nothing merged, on 2026-08-06).
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

  it("step 2 (low-risk fast path) does not gate on isAutoMergeEligible/tier (#3861 — No tier hold)", () => {
    expect(step2Section).not.toMatch(/isAutoMergeEligible/);
    expect(step2Section).toMatch(/No tier hold/);
    expect(step2Section).toMatch(/needs-review/);
    const mergeAt = step2Section.indexOf("gh pr merge");
    expect(mergeAt).toBeGreaterThan(-1);
  });

  it("step 5 (all-pass enqueue) does not gate on isAutoMergeEligible/tier (#3861 — No tier hold)", () => {
    expect(step5Section).not.toMatch(/isAutoMergeEligible/);
    expect(step5Section).toMatch(/No tier hold/);
    const mergeAt = step5Section.indexOf("gh pr merge");
    expect(mergeAt).toBeGreaterThan(-1);
  });

  it("documents a No tier hold section stating tier:standard/sensitive/critical do not block this skill's merges (#3861)", () => {
    const noTierHoldStart = SKILL_MD.indexOf("### No tier hold", step6Start);
    expect(noTierHoldStart).toBeGreaterThan(step6Start);
    const noTierHoldSection = SKILL_MD.slice(noTierHoldStart, noTierHoldStart + 2000);
    expect(noTierHoldSection).toMatch(/do NOT block a merge/);
    expect(noTierHoldSection).toMatch(/tier:standard/);
    expect(noTierHoldSection).toMatch(/tier:sensitive/);
    expect(noTierHoldSection).toMatch(/tier:critical/);
  });

  it("step 6 still holds a PR on a flag/block verdict via needs-review + do not enqueue (unaffected by #3861)", () => {
    expect(step6Section).toMatch(/needs-review/);
    expect(step6Section).toMatch(/do not enqueue/i);
  });
});
