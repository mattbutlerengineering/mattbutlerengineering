import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isAutoMergeEligible,
  isAutomationAutoMergeEligible,
  BLOCKED_TIER_LABELS,
  TIER_LABEL_PREFIX,
} from "../merge-queue-eligibility.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/merge-queue.yml"), "utf8");
const AUTO_MERGE_WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/auto-merge.yml"), "utf8");
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

describe("implement-queue SKILL.md wiring (#3807, revised #3861)", () => {
  const boundaryStart = SKILL_MD.indexOf("### Worker→train boundary");
  const step2Start = SKILL_MD.indexOf("2. **Low-risk fast path", boundaryStart);
  const step3Start = SKILL_MD.indexOf("3. **Reviewer sub-agent", step2Start);
  const step5Start = SKILL_MD.indexOf("5. **On all-pass verdict", step3Start);
  const step6Start = SKILL_MD.indexOf('6. **On `"flag"` verdict', step5Start);
  const noTierHoldStart = SKILL_MD.indexOf("### No tier hold", step6Start);
  const phase3Start = SKILL_MD.indexOf("## Phase 3", step6Start);

  const step2Section = SKILL_MD.slice(step2Start, step3Start);
  const step5Section = SKILL_MD.slice(step5Start, step6Start);
  const noTierHoldSection = SKILL_MD.slice(noTierHoldStart, phase3Start);

  it("finds the Worker→train boundary subsection and its numbered steps", () => {
    expect(boundaryStart).toBeGreaterThan(-1);
    expect(step2Start).toBeGreaterThan(boundaryStart);
    expect(step3Start).toBeGreaterThan(step2Start);
    expect(step5Start).toBeGreaterThan(step3Start);
    expect(step6Start).toBeGreaterThan(step5Start);
    expect(noTierHoldStart).toBeGreaterThan(step6Start);
    expect(phase3Start).toBeGreaterThan(noTierHoldStart);
  });

  it("step 2 (low-risk fast path) gates on needs-review, NOT on isAutoMergeEligible", () => {
    // Reversed by #3861 on Matt's 2026-08-06 decision ("restore no-HITL
    // fully"). Before that, this asserted step 2 called isAutoMergeEligible.
    // That tier check deadlocked the queue: three PRs that had passed the
    // review gate with green CI sat parked because tier-classifier had
    // labelled them tier:standard. The gate for a REVIEWED path is the
    // review verdict; tier gates the UNREVIEWED workflow paths below.
    expect(step2Section).toMatch(/needs-review/);
    expect(step2Section).not.toMatch(/isAutoMergeEligible/);
    const needsReviewAt = step2Section.indexOf("needs-review");
    const mergeAt = step2Section.indexOf("gh pr merge");
    expect(needsReviewAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(needsReviewAt);
  });

  it("step 5 (all-pass enqueue) enqueues directly with no tier re-check", () => {
    expect(step5Section).toMatch(/gh pr merge <N> --auto --squash --delete-branch/);
    expect(step5Section).not.toMatch(/isAutoMergeEligible/);
    expect(step5Section).toMatch(/no-tier-hold/);
  });

  it("documents the No tier hold carve-out with a resolvable anchor", () => {
    // Steps 2 and 5 both link to #no-tier-hold; a dangling link would leave
    // the "why doesn't this check tier?" question unanswered at the exact
    // moment an agent is deciding whether to merge.
    expect(noTierHoldSection).toMatch(/<a id="no-tier-hold"><\/a>/);
    expect(step2Section).toMatch(/#no-tier-hold/);
    expect(step5Section).toMatch(/#no-tier-hold/);
  });

  it("keeps tier binding for the UNREVIEWED workflow paths, so the eligibility functions stay load-bearing", () => {
    // The carve-out is reviewed-vs-unreviewed, not "tier no longer matters".
    // merge-queue.yml and auto-merge.yml run no review gate, so they must
    // keep gating on tier via this module. If this assertion ever has to be
    // deleted, the two workflows have lost their only tier gate.
    expect(noTierHoldSection).toMatch(/merge-queue\.yml/);
    expect(noTierHoldSection).toMatch(/auto-merge\.yml/);
    expect(noTierHoldSection).toMatch(/isAutoMergeEligible/);
  });

  it("warns against reintroducing a Phase 2 tier check, citing the deadlock", () => {
    // The failure mode this doc exists to prevent is a well-meaning future
    // agent "fixing" the missing tier check in step 2 or 5.
    expect(noTierHoldSection).toMatch(/[Dd]o not reintroduce a tier check/);
    expect(noTierHoldSection).toMatch(/deadlock/i);
  });

  it("still names what DOES hold a PR, so removing the tier gate is not read as removing all gates", () => {
    expect(noTierHoldSection).toMatch(/flag/);
    expect(noTierHoldSection).toMatch(/block/);
    expect(noTierHoldSection).toMatch(/needs-review/);
    expect(noTierHoldSection).toMatch(/CI Gate/);
  });
});

// ---------------------------------------------------------------------------
// isAutomationAutoMergeEligible — the auto-merge.yml carve-out (#3857)
//
// `auto-merge.yml` gates a different, hand-maintained sensitive-path regex
// than merge-queue.yml's tier check, and never read `tier:*` at all — the
// same hole #3787/#3796 closed in merge-queue.yml. The four workflows that
// apply the `auto-merge` label (production-feedback, pr-metrics, drift-fix,
// acmm-regression) never carry `has-pr` — that label gates the
// implement-queue's own review boundary and is deliberately NOT loosened
// here (see the docstring on isAutomationAutoMergeEligible). Instead this is
// a distinct, explicit automation path: same tier gate, `auto-merge` label
// in place of `has-pr`.
// ---------------------------------------------------------------------------

describe("isAutomationAutoMergeEligible", () => {
  it("is NOT eligible for auto-merge alone with no tier label — fails closed on an unclassified PR", () => {
    // Regression guard. An earlier revision of #3857 returned eligible: true
    // here, which was a REGRESSION against the sensitive-path regex it
    // replaced: that regex read the PR's own file list and always blocked
    // e.g. drift-fix.yml's committable infrastructure/worker/dep-graph.json.
    // A label-derived gate that no-ops on unlabelled PRs would let those
    // straight through. Measured 2026-08-06: 4 of 14 recent merged
    // automation PRs (#3826, #3816, #3638, #3637) carried no tier:* label,
    // so this is the common case for these workflows, not a corner case.
    const result = isAutomationAutoMergeEligible(["auto-merge"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/tier:\*/);
  });

  it("is eligible for auto-merge + tier:trivial", () => {
    const result = isAutomationAutoMergeEligible(["auto-merge", "tier:trivial"]);
    expect(result.eligible).toBe(true);
  });

  it("is NOT eligible when the auto-merge label is missing, even with has-pr present", () => {
    const result = isAutomationAutoMergeEligible(["has-pr"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/auto-merge/);
  });

  it("does not require has-pr — automation PRs never carry it (deliberate, documented carve-out)", () => {
    const result = isAutomationAutoMergeEligible(["auto-merge", "tier:trivial"]);
    expect(result.eligible).toBe(true);
    expect(result.reason).not.toMatch(/has-pr/);
  });

  for (const tier of BLOCKED_TIER_LABELS) {
    it(`is not eligible for auto-merge + ${tier} (a bot PR touching packages/rialto/src/** must not auto-merge)`, () => {
      const result = isAutomationAutoMergeEligible(["auto-merge", tier]);
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(new RegExp(tier.replace(":", "\\:")));
    });
  }

  it("is not eligible when needs-review is present alongside auto-merge", () => {
    const result = isAutomationAutoMergeEligible(["auto-merge", "needs-review"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/needs-review/);
  });

  it("treats a missing labels array as ineligible", () => {
    expect(isAutomationAutoMergeEligible().eligible).toBe(false);
    expect(isAutomationAutoMergeEligible([]).eligible).toBe(false);
  });

  it("does not mutate the input array", () => {
    const labels = ["auto-merge", "tier:trivial"];
    const snapshot = JSON.stringify(labels);
    isAutomationAutoMergeEligible(labels);
    expect(JSON.stringify(labels)).toBe(snapshot);
  });

  it("distinguishes 'classified low-risk' from 'never classified'", () => {
    // The whole point of the fail-closed check: these two label sets differ
    // only in whether tier-classifier ran, and must NOT decide the same way.
    expect(isAutomationAutoMergeEligible(["auto-merge", "tier:trivial"]).eligible).toBe(true);
    expect(isAutomationAutoMergeEligible(["auto-merge"]).eligible).toBe(false);
  });

  it("accepts any tier:* label as proof the classifier ran, not just tier:trivial", () => {
    // tier:trivial is the only non-blocking tier today, but the check is
    // "was this classified", not "is it trivial" — the blocking tiers are
    // already rejected earlier by BLOCKED_TIER_LABELS. If a new non-blocking
    // tier is ever added, this must keep passing without another edit here.
    const result = isAutomationAutoMergeEligible(["auto-merge", `${TIER_LABEL_PREFIX}trivial`]);
    expect(result.eligible).toBe(true);
  });

  it("reproduces the drift-fix.yml case: an unlabelled bot PR touching infrastructure/ is blocked", () => {
    // drift-fix.yml's checked-in add-paths: allowlist includes
    // infrastructure/worker/dep-graph.json and infrastructure/*/llms.txt.
    // Pre-#3857 the sensitive-path regex (^infrastructure/) blocked those
    // unconditionally. Post-fix, the absent tier label blocks them instead —
    // different mechanism, same outcome, which is the bar this change had to
    // clear to not be a net loosening.
    expect(isAutomationAutoMergeEligible(["auto-merge"]).eligible).toBe(false);
  });

  it("reports needs-review, not 'unclassified', when both apply", () => {
    // Ordering guard. The fail-closed check must come last: an explicit
    // needs-review label is a human decision and deserves its own reason,
    // otherwise the workflow log blames the tier-classifier for a block a
    // human deliberately applied. Caught by an existing test when the
    // fail-closed check was first added above needs-review.
    const result = isAutomationAutoMergeEligible(["auto-merge", "needs-review"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/needs-review/);
    expect(result.reason).not.toMatch(/did not run/);
  });

  it("keeps a blocking tier label as the reported reason even though it is also classified", () => {
    // Ordering guard: the blocked-tier branch must win over the
    // fail-closed branch so the reason stays specific and actionable.
    const result = isAutomationAutoMergeEligible(["auto-merge", "tier:critical"]);
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/tier:critical/);
    expect(result.reason).not.toMatch(/did not run/);
  });
});

// ---------------------------------------------------------------------------
// auto-merge.yml wiring (#3857) — must call the shared, tested eligibility
// script instead of re-deriving a bespoke sensitive-path regex that drifts
// from tier-classifier.yml.
// ---------------------------------------------------------------------------

describe("auto-merge.yml wiring (#3857)", () => {
  it("invokes merge-queue-eligibility.mjs in automation mode instead of a bespoke sensitive-path regex", () => {
    expect(AUTO_MERGE_WORKFLOW).toMatch(/node scripts\/merge-queue-eligibility\.mjs check/);
    expect(AUTO_MERGE_WORKFLOW).toMatch(/--mode automation/);
  });

  it("no longer hand-rolls the sensitive-path regex this issue replaces", () => {
    expect(AUTO_MERGE_WORKFLOW).not.toMatch(/\^\\\.github\/\|\^infrastructure\//);
    expect(AUTO_MERGE_WORKFLOW).not.toMatch(/SENSITIVE_FILES/);
  });

  it("gates gh pr merge --auto on the eligibility result", () => {
    const mergeAt = AUTO_MERGE_WORKFLOW.indexOf("gh pr merge");
    const eligibilityAt = AUTO_MERGE_WORKFLOW.indexOf("merge-queue-eligibility.mjs");
    expect(eligibilityAt).toBeGreaterThan(-1);
    expect(mergeAt).toBeGreaterThan(eligibilityAt);
  });

  it("still requires the auto-merge label before evaluating tier eligibility", () => {
    expect(AUTO_MERGE_WORKFLOW).toMatch(/HAS_AUTO_MERGE/);
  });

  it("still gates on trusted/bot authorship after the eligibility check", () => {
    const eligibilityAt = AUTO_MERGE_WORKFLOW.indexOf("merge-queue-eligibility.mjs");
    const trustedAt = AUTO_MERGE_WORKFLOW.indexOf("TRUSTED_AUTHORS");
    expect(trustedAt).toBeGreaterThan(eligibilityAt);
  });
});
