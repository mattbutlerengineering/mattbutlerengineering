import { describe, it, expect } from "vitest";
import {
  AGE_FLOOR_DAYS,
  isProtectedBranch,
  matchesCleanupPattern,
  isOldEnough,
  hasMergedPr,
  decideBranch,
  planCleanup,
} from "../branch-cleanup.mjs";

// ---------------------------------------------------------------------------
// isProtectedBranch — main, production, release/* are never eligible
// ---------------------------------------------------------------------------

describe("isProtectedBranch", () => {
  it("protects main", () => {
    expect(isProtectedBranch("main")).toBe(true);
  });

  it("protects production", () => {
    expect(isProtectedBranch("production")).toBe(true);
  });

  it("protects any release/* branch", () => {
    expect(isProtectedBranch("release/1.2.3")).toBe(true);
    expect(isProtectedBranch("release/foo")).toBe(true);
  });

  it("does not protect an agent branch", () => {
    expect(isProtectedBranch("worktree-agent-abc123")).toBe(false);
  });

  it("does not protect a branch that merely contains 'release' as a substring", () => {
    expect(isProtectedBranch("prerelease/foo")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// matchesCleanupPattern — widened to include worktree-agent-* (#3624)
// ---------------------------------------------------------------------------

describe("matchesCleanupPattern", () => {
  it("matches worktree-agent-* (the largest real source of disposable branches)", () => {
    expect(matchesCleanupPattern("worktree-agent-a34c251117fb88831")).toBe(true);
  });

  it("matches the pre-existing agent/* pattern", () => {
    expect(matchesCleanupPattern("agent/fix-something")).toBe(true);
  });

  it("matches fix-issue/feat-issue/chore-issue patterns", () => {
    expect(matchesCleanupPattern("fix/issue-123")).toBe(true);
    expect(matchesCleanupPattern("feat/issue-456")).toBe(true);
    expect(matchesCleanupPattern("chore/issue-789")).toBe(true);
  });

  it("does not match an unrelated feature branch", () => {
    expect(matchesCleanupPattern("my-cool-feature")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isOldEnough — age floor, default 7 days
// ---------------------------------------------------------------------------

describe("isOldEnough", () => {
  const now = new Date("2026-08-02T00:00:00Z");

  it("is false for a branch merged 3 days ago", () => {
    expect(isOldEnough("2026-07-30T00:00:00Z", now)).toBe(false);
  });

  it("is true for a branch merged exactly 7 days ago", () => {
    expect(isOldEnough("2026-07-26T00:00:00Z", now, AGE_FLOOR_DAYS)).toBe(true);
  });

  it("is true for a branch merged 30 days ago", () => {
    expect(isOldEnough("2026-07-03T00:00:00Z", now)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasMergedPr — squash-merge-safe "was this branch merged" check (#3624)
// ---------------------------------------------------------------------------

describe("hasMergedPr", () => {
  it("is true when a PR entry has a non-null mergedAt", () => {
    expect(hasMergedPr([{ number: 1, mergedAt: "2026-07-01T00:00:00Z" }])).toBe(true);
  });

  it("is false when every PR entry has mergedAt: null (closed without merging)", () => {
    expect(hasMergedPr([{ number: 1, mergedAt: null }])).toBe(false);
  });

  it("is false when there is no PR at all for the branch", () => {
    expect(hasMergedPr([])).toBe(false);
  });

  it("is false for nullish input", () => {
    expect(hasMergedPr(null)).toBe(false);
    expect(hasMergedPr(undefined)).toBe(false);
  });

  it("is true if any of several PRs for the same head was merged", () => {
    const prs = [
      { number: 1, mergedAt: null },
      { number: 2, mergedAt: "2026-07-01T00:00:00Z" },
    ];
    expect(hasMergedPr(prs)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// decideBranch — the single source of truth combining all safety rails
// ---------------------------------------------------------------------------

describe("decideBranch", () => {
  const now = new Date("2026-08-02T00:00:00Z");
  const old = "2026-07-01T00:00:00Z";
  const recent = "2026-08-01T00:00:00Z";

  it("never deletes main even if somehow merged/old/matched", () => {
    const decision = decideBranch(
      { name: "main", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
      { now }
    );
    expect(decision).toEqual({ eligible: false, reason: "protected" });
  });

  it("never deletes production", () => {
    const decision = decideBranch(
      { name: "production", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
      { now }
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("protected");
  });

  it("never deletes a release/* branch", () => {
    const decision = decideBranch(
      { name: "release/2.0.0", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
      { now }
    );
    expect(decision.eligible).toBe(false);
    expect(decision.reason).toBe("protected");
  });

  it("skips a branch that has an open PR", () => {
    const decision = decideBranch(
      {
        name: "worktree-agent-abc123",
        mergedIntoMain: true,
        lastCommitDate: old,
        hasOpenPr: true,
      },
      { now }
    );
    expect(decision).toEqual({ eligible: false, reason: "open-pr" });
  });

  it("skips a branch merged less than 7 days ago", () => {
    const decision = decideBranch(
      {
        name: "worktree-agent-abc123",
        mergedIntoMain: true,
        lastCommitDate: recent,
        hasOpenPr: false,
      },
      { now }
    );
    expect(decision).toEqual({ eligible: false, reason: "too-recent" });
  });

  it("skips a branch that is not merged into main", () => {
    const decision = decideBranch(
      {
        name: "worktree-agent-abc123",
        mergedIntoMain: false,
        lastCommitDate: old,
        hasOpenPr: false,
      },
      { now }
    );
    expect(decision).toEqual({ eligible: false, reason: "not-merged" });
  });

  it("skips a branch that does not match any cleanup pattern", () => {
    const decision = decideBranch(
      { name: "some-random-branch", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
      { now }
    );
    expect(decision).toEqual({ eligible: false, reason: "pattern-mismatch" });
  });

  it("is eligible for a worktree-agent-* branch merged, old, and without an open PR", () => {
    const decision = decideBranch(
      {
        name: "worktree-agent-a34c251117fb88831",
        mergedIntoMain: true,
        lastCommitDate: old,
        hasOpenPr: false,
      },
      { now }
    );
    expect(decision).toEqual({ eligible: true, reason: "eligible" });
  });

  it("respects a custom age threshold", () => {
    const decision = decideBranch(
      {
        name: "worktree-agent-abc123",
        mergedIntoMain: true,
        lastCommitDate: recent,
        hasOpenPr: false,
      },
      { now, thresholdDays: 0 }
    );
    expect(decision.eligible).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// planCleanup — considered / matched / toDelete / retained summary
// ---------------------------------------------------------------------------

describe("planCleanup", () => {
  const now = new Date("2026-08-02T00:00:00Z");
  const old = "2026-07-01T00:00:00Z";

  it("reports considered as the full branch list, matched as pattern-only, and toDelete as fully eligible", () => {
    const branches = [
      { name: "main", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
      {
        name: "worktree-agent-a34c251117fb88831",
        mergedIntoMain: true,
        lastCommitDate: old,
        hasOpenPr: false,
      },
      {
        name: "worktree-agent-has-open-pr",
        mergedIntoMain: true,
        lastCommitDate: old,
        hasOpenPr: true,
      },
      { name: "fix/issue-42", mergedIntoMain: false, lastCommitDate: old, hasOpenPr: false },
      {
        name: "some-unrelated-branch",
        mergedIntoMain: true,
        lastCommitDate: old,
        hasOpenPr: false,
      },
    ];

    const plan = planCleanup(branches, { now });

    expect(plan.considered).toBe(5);
    // matched = branches whose name matches a cleanup pattern, regardless of merge/PR/age
    expect(plan.matched).toBe(3);
    expect(plan.toDelete.map((b) => b.name)).toEqual(["worktree-agent-a34c251117fb88831"]);
    expect(plan.retained).toHaveLength(4);
  });

  it("does not mutate the input array", () => {
    const branches = [
      { name: "worktree-agent-abc", mergedIntoMain: true, lastCommitDate: old, hasOpenPr: false },
    ];
    const snapshot = JSON.stringify(branches);
    planCleanup(branches, { now });
    expect(JSON.stringify(branches)).toBe(snapshot);
  });

  it("returns zeroed counts for an empty branch list", () => {
    const plan = planCleanup([], { now });
    expect(plan).toEqual({ considered: 0, matched: 0, toDelete: [], retained: [] });
  });
});
