import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  isAgentWorktreePath,
  isInTreeWorktreePath,
  classifyWorktreeCategory,
  decideWorktreeReap,
  planReap,
  parseWorktreeListPorcelain,
  hasOpenPrForBranch,
  hasMergedPrForBranch,
  isWorktreeLive,
  hasRecentFileActivity,
  findUnregisteredOnDiskWorktrees,
  buildReapReport,
  removeWorktree,
} from "../reap-worktrees.mjs";

// ---------------------------------------------------------------------------
// isAgentWorktreePath — pure path predicate: only a direct
// `.claude/worktrees/agent-*` leaf directory counts, never a nested file,
// a differently-named worktree, or the main checkout.
// ---------------------------------------------------------------------------

describe("isAgentWorktreePath", () => {
  test("matches a direct agent-* leaf under .claude/worktrees", () => {
    expect(
      isAgentWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-a8e4e51f881ee1206"
      )
    ).toBe(true);
  });

  test("does not match a manually-named worktree (not agent-prefixed)", () => {
    expect(
      isAgentWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint"
      )
    ).toBe(false);
  });

  test("does not match the main checkout", () => {
    expect(isAgentWorktreePath("/Users/mbutler/github/mattbutlerengineering")).toBe(false);
  });

  test("does not match a file nested inside an agent worktree", () => {
    expect(
      isAgentWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123/package.json"
      )
    ).toBe(false);
  });

  test("does not match a path that merely contains 'agent-' elsewhere", () => {
    expect(isAgentWorktreePath("/Users/mbutler/github/some-agent-repo/.claude/worktrees/foo")).toBe(
      false
    );
  });

  test("resolves .. traversal before matching (defense in depth)", () => {
    expect(
      isAgentWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-x/../agent-y"
      )
    ).toBe(true);
    expect(
      isAgentWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-x/../../etc"
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isInTreeWorktreePath — #4122: the widened predicate. True for ANY direct
// leaf under `.claude/worktrees/`, agent-prefixed or hand-created — this is
// what makes hand-created worktrees visible to the reaper at all, instead of
// falling through the old agent-only filter unexamined.
// ---------------------------------------------------------------------------

describe("isInTreeWorktreePath", () => {
  test("matches an agent-prefixed leaf", () => {
    expect(
      isInTreeWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123"
      )
    ).toBe(true);
  });

  test("matches a hand-created (non agent-*) leaf", () => {
    expect(
      isInTreeWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint"
      )
    ).toBe(true);
  });

  test("does not match the main checkout", () => {
    expect(isInTreeWorktreePath("/Users/mbutler/github/mattbutlerengineering")).toBe(false);
  });

  test("does not match a nested file inside a worktree", () => {
    expect(
      isInTreeWorktreePath(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123/package.json"
      )
    ).toBe(false);
  });

  test("does not match a worktree registered entirely outside .claude/worktrees/", () => {
    expect(isInTreeWorktreePath("/Users/mbutler/github/mbe-worktrees/3357-services-seam")).toBe(
      false
    );
  });
});

// ---------------------------------------------------------------------------
// classifyWorktreeCategory — the named-state mechanism (#4122) that keeps
// "never examined" (out-of-tree) structurally distinct from "examined"
// (agent / hand-created), instead of relying on a reason string alone.
// ---------------------------------------------------------------------------

describe("classifyWorktreeCategory", () => {
  test("classifies an agent-prefixed in-tree leaf as agent", () => {
    expect(
      classifyWorktreeCategory(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123"
      )
    ).toBe("agent");
  });

  test("classifies a non agent-prefixed in-tree leaf as hand-created", () => {
    expect(
      classifyWorktreeCategory(
        "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint"
      )
    ).toBe("hand-created");
  });

  test("classifies the main checkout as out-of-tree", () => {
    expect(classifyWorktreeCategory("/Users/mbutler/github/mattbutlerengineering")).toBe(
      "out-of-tree"
    );
  });

  test("classifies a worktree registered outside .claude/worktrees/ as out-of-tree", () => {
    expect(classifyWorktreeCategory("/Users/mbutler/github/mbe-worktrees/3357-services-seam")).toBe(
      "out-of-tree"
    );
  });
});

// ---------------------------------------------------------------------------
// decideWorktreeReap — the whole safety gate. The two refusals that matter
// most: a live owning process, and an open PR. Neither dirtiness nor git
// ancestry ("merged into main") is a decision input at all — squash merges
// make ancestry meaningless and the prettier hook makes dirtiness universal.
//
// #4122: the gate is now category-aware (`classifyWorktreeCategory`).
// "agent" worktrees keep the original rules verbatim. "hand-created"
// worktrees add one more requirement — positive merged-PR evidence
// (`hasMergedPr === true`) — checked LAST, after the same live/open-pr/
// recent-activity refusals. "out-of-tree" worktrees are never examined at
// all: they refuse unconditionally, regardless of how favorable every other
// field looks, so a never-examined worktree can never be silently reaped.
// ---------------------------------------------------------------------------

describe("decideWorktreeReap", () => {
  const agentPath = "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123";

  test("refuses a worktree belonging to a live session, regardless of PR state", () => {
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: true,
      hasOpenPr: false,
    });
    expect(decision).toEqual({ eligible: false, reason: "live-session" });
  });

  test("refuses a worktree with an open PR, regardless of liveness", () => {
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: false,
      hasOpenPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "open-pr" });
  });

  test("refuses when both live and has an open PR (live takes priority as the reported reason)", () => {
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: true,
      hasOpenPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "live-session" });
  });

  test("is eligible when not live, no open PR — even if the branch is squash-merge-orphaned and the tree is dirty", () => {
    // No `dirty` or `mergedIntoMain` field exists on the input at all: this
    // test proves the decision genuinely cannot see those signals, not just
    // that it ignores them when present.
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: false,
      hasOpenPr: false,
    });
    expect(decision).toEqual({ eligible: true, reason: "eligible" });
  });

  // #3986: `isLive` (lsof) samples zero PIDs for long stretches of a
  // worker's mid-implementation lifecycle (thinking, awaiting API response,
  // streaming a reply — no child process holds a handle under the worktree
  // path during any of that). A worker also has no PR until it finishes and
  // pushes, so `hasOpenPr` is false for the entire pre-PR implementation
  // phase too. Both gates can read false SIMULTANEOUSLY while the worker is
  // unambiguously alive — this is the exact flicker the issue reports.
  // `isRecentlyActive` is the third, independent gate that closes it.
  test("refuses a worktree with recent filesystem activity even when isLive and hasOpenPr both read false (the flicker window)", () => {
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "recent-activity" });
  });

  test("is eligible when not live, no open PR, and no recent activity — genuinely abandoned worktrees are still reaped", () => {
    const decision = decideWorktreeReap({
      path: agentPath,
      branch: "worktree-agent-abc123",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
    });
    expect(decision).toEqual({ eligible: true, reason: "eligible" });
  });
});

// ---------------------------------------------------------------------------
// decideWorktreeReap — hand-created worktrees (#4122). Same live/open-pr/
// recent-activity refusals as "agent", PLUS a positive-evidence requirement
// (`hasMergedPr === true`) that only this category needs. No merge evidence
// ⇒ retained, fail closed — absence of proof is not proof of absence.
// ---------------------------------------------------------------------------

describe("decideWorktreeReap — hand-created worktrees", () => {
  const handCreatedPath =
    "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint";

  test("eligible when not live, no open PR, no recent activity, and the branch has a merged PR", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: true, reason: "eligible-merged" });
  });

  test("retained with no-merge-evidence when hasMergedPr is false, even with every other signal favorable", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
      hasMergedPr: false,
    });
    expect(decision).toEqual({ eligible: false, reason: "no-merge-evidence" });
  });

  test("retained with no-merge-evidence when hasMergedPr is undefined (never checked) — fails closed, never assumes merged", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
    });
    expect(decision).toEqual({ eligible: false, reason: "no-merge-evidence" });
  });

  test("refuses on live-session even when hasMergedPr is true (open-pr/live still take priority)", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: true,
      hasOpenPr: false,
      isRecentlyActive: false,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "live-session" });
  });

  test("refuses on open-pr even when hasMergedPr is true", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: true,
      isRecentlyActive: false,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "open-pr" });
  });

  test("refuses on recent-activity even when hasMergedPr is true", () => {
    const decision = decideWorktreeReap({
      path: handCreatedPath,
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: true,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "recent-activity" });
  });
});

// ---------------------------------------------------------------------------
// decideWorktreeReap — out-of-tree worktrees (#4122). The "never examined"
// state: always refused, unconditionally — this is the anti-conflation test
// AC4 requires. Every other field is set to the MOST favorable value
// possible (not live, no open PR, no recent activity, hasMergedPr: true) to
// prove the refusal genuinely doesn't depend on examining them at all.
// ---------------------------------------------------------------------------

describe("decideWorktreeReap — out-of-tree worktrees", () => {
  test("always refuses, even when every other signal is maximally favorable", () => {
    const decision = decideWorktreeReap({
      path: "/Users/mbutler/github/mbe-worktrees/3357-services-seam",
      branch: "3357-services-seam",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "out-of-tree" });
  });

  test("the main checkout itself is classified out-of-tree and always refused", () => {
    const decision = decideWorktreeReap({
      path: "/Users/mbutler/github/mattbutlerengineering",
      branch: "main",
      isLive: false,
      hasOpenPr: false,
      isRecentlyActive: false,
      hasMergedPr: true,
    });
    expect(decision).toEqual({ eligible: false, reason: "out-of-tree" });
  });
});

// ---------------------------------------------------------------------------
// planReap — aggregates decisions over a batch, pure, non-mutating.
// ---------------------------------------------------------------------------

describe("planReap", () => {
  const base = "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees";

  test("splits worktrees into toReap and retained and does not mutate input", () => {
    const worktrees = [
      { path: `${base}/agent-live`, branch: "worktree-agent-live", isLive: true, hasOpenPr: false },
      {
        path: `${base}/agent-openpr`,
        branch: "worktree-agent-openpr",
        isLive: false,
        hasOpenPr: true,
      },
      {
        path: `${base}/agent-dead`,
        branch: "worktree-agent-dead",
        isLive: false,
        hasOpenPr: false,
      },
    ];
    const snapshot = JSON.stringify(worktrees);

    const plan = planReap(worktrees);

    expect(plan.considered).toBe(3);
    expect(plan.toReap.map((w) => w.path)).toEqual([`${base}/agent-dead`]);
    expect(plan.retained.map((w) => w.path)).toEqual([
      `${base}/agent-live`,
      `${base}/agent-openpr`,
    ]);
    expect(JSON.stringify(worktrees)).toBe(snapshot);
  });

  test("returns zeroed counts for an empty list", () => {
    expect(planReap([])).toEqual({ considered: 0, toReap: [], retained: [] });
  });

  test("handles nullish input safely", () => {
    expect(planReap(null)).toEqual({ considered: 0, toReap: [], retained: [] });
  });
});

// ---------------------------------------------------------------------------
// buildReapReport — #4122's anti-conflation summary. `plan.considered` only
// ever reflects worktrees that were actually examined (agent + hand-created,
// in-tree); this combines it with the two categories that are deliberately
// NEVER examined (out-of-tree, unregistered-on-disk) so `Considered: 3`
// can never again read as a clean sweep of everything that exists.
// ---------------------------------------------------------------------------

describe("buildReapReport", () => {
  test("combines examined plan counts with never-examined out-of-tree and unregistered-on-disk counts", () => {
    const plan = {
      considered: 2,
      toReap: [{ path: "a" }],
      retained: [{ path: "b" }],
    };
    const report = buildReapReport(plan, {
      outOfTreeCount: 4,
      unregisteredOnDisk: ["agent-ac0d717e0bdebd347"],
    });
    expect(report).toEqual({
      examined: 2,
      eligible: 1,
      retained: 1,
      outOfTree: 4,
      unregisteredOnDisk: ["agent-ac0d717e0bdebd347"],
    });
  });

  test("defaults out-of-tree and unregistered-on-disk to empty/zero when omitted", () => {
    const plan = { considered: 0, toReap: [], retained: [] };
    expect(buildReapReport(plan)).toEqual({
      examined: 0,
      eligible: 0,
      retained: 0,
      outOfTree: 0,
      unregisteredOnDisk: [],
    });
  });
});

// ---------------------------------------------------------------------------
// parseWorktreeListPorcelain — pure parser for `git worktree list --porcelain`
// ---------------------------------------------------------------------------

describe("parseWorktreeListPorcelain", () => {
  test("parses multiple entries with branches", () => {
    const raw = [
      "worktree /Users/mbutler/github/mattbutlerengineering",
      "HEAD 9db62855abc",
      "branch refs/heads/main",
      "",
      "worktree /Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123",
      "HEAD e72fa99e",
      "branch refs/heads/worktree-agent-abc123",
      "",
    ].join("\n");

    const entries = parseWorktreeListPorcelain(raw);
    expect(entries).toEqual([
      { path: "/Users/mbutler/github/mattbutlerengineering", branch: "main" },
      {
        path: "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/agent-abc123",
        branch: "worktree-agent-abc123",
      },
    ]);
  });

  test("leaves branch null for a detached worktree", () => {
    const raw = ["worktree /tmp/detached", "HEAD abc123", "detached", ""].join("\n");
    expect(parseWorktreeListPorcelain(raw)).toEqual([{ path: "/tmp/detached", branch: null }]);
  });

  test("returns an empty array for empty input", () => {
    expect(parseWorktreeListPorcelain("")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// hasOpenPrForBranch — injectable exec, fails safe (refuse) on any error
// ---------------------------------------------------------------------------

describe("hasOpenPrForBranch", () => {
  test("returns true when gh reports at least one open PR", () => {
    const exec = () => JSON.stringify([{ number: 42 }]);
    expect(hasOpenPrForBranch("worktree-agent-abc123", { exec })).toBe(true);
  });

  test("returns false when gh reports no open PRs", () => {
    const exec = () => JSON.stringify([]);
    expect(hasOpenPrForBranch("worktree-agent-abc123", { exec })).toBe(false);
  });

  test("fails safe to true when gh errors", () => {
    const exec = () => {
      throw new Error("gh: command failed");
    };
    expect(hasOpenPrForBranch("worktree-agent-abc123", { exec })).toBe(true);
  });

  test("fails safe to true for a null/empty branch (cannot query)", () => {
    const exec = () => {
      throw new Error("should not be called");
    };
    expect(hasOpenPrForBranch(null, { exec })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasMergedPrForBranch — #4122 positive-evidence check for the hand-created
// removal policy. Fails safe to FALSE (no evidence ⇒ do not remove), the
// mirror image of hasOpenPrForBranch's fail-safe-to-true: both directions
// land on "refuse to reap", just from opposite defaults, because absence of
// proof of a merge is not proof of absence of one — and vice versa for an
// open PR. Uses `gh pr list --state all --json number,mergedAt` (never
// `git merge-base --is-ancestor`) because this repo squash-merges, so a
// branch tip is never literally an ancestor of `main` even after a real
// merge — see branch-cleanup.mjs's `hasMergedPr` for the same lesson.
// ---------------------------------------------------------------------------

describe("hasMergedPrForBranch", () => {
  test("returns true when gh reports a PR with a non-null mergedAt", () => {
    const exec = () => JSON.stringify([{ number: 4127, mergedAt: "2026-08-12T02:00:00Z" }]);
    expect(hasMergedPrForBranch("3169-node20-eslint", { exec })).toBe(true);
  });

  test("returns false when every PR entry has mergedAt: null (closed without merging)", () => {
    const exec = () => JSON.stringify([{ number: 4127, mergedAt: null }]);
    expect(hasMergedPrForBranch("3169-node20-eslint", { exec })).toBe(false);
  });

  test("returns false when gh reports no PR at all for the branch", () => {
    const exec = () => JSON.stringify([]);
    expect(hasMergedPrForBranch("3169-node20-eslint", { exec })).toBe(false);
  });

  test("fails safe to false when gh errors", () => {
    const exec = () => {
      throw new Error("gh: command failed");
    };
    expect(hasMergedPrForBranch("3169-node20-eslint", { exec })).toBe(false);
  });

  test("fails safe to false for a null/empty branch (cannot query)", () => {
    const exec = () => {
      throw new Error("should not be called");
    };
    expect(hasMergedPrForBranch(null, { exec })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWorktreeLive — injectable exec, fails safe (refuse/live) on any error
// ---------------------------------------------------------------------------

describe("isWorktreeLive", () => {
  test("returns true when lsof reports at least one PID", () => {
    const exec = () => "12345\n";
    expect(isWorktreeLive("/some/worktree", { exec })).toBe(true);
  });

  test("returns false when lsof exits 1 with empty output (no matching process)", () => {
    const exec = () => {
      const err = new Error("lsof: no matches");
      err.status = 1;
      err.stdout = "";
      throw err;
    };
    expect(isWorktreeLive("/some/worktree", { exec })).toBe(false);
  });

  test("fails safe to true when lsof is missing (ENOENT)", () => {
    const exec = () => {
      const err = new Error("spawn lsof ENOENT");
      err.code = "ENOENT";
      throw err;
    };
    expect(isWorktreeLive("/some/worktree", { exec })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// hasRecentFileActivity — the #3986 companion gate to isLive. Answers "has
// this worktree been touched (edited, written to) within the staleness
// window", independent of whether any process currently holds a handle
// under it. Real fs against throwaway tmpdir fixtures, no injected fakes,
// since mtime semantics are exactly what's under test.
// ---------------------------------------------------------------------------

describe("hasRecentFileActivity", () => {
  let dir;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  test("true when a file was modified within the staleness window", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-activity-"));
    fs.writeFileSync(path.join(dir, "recent.txt"), "x");
    expect(hasRecentFileActivity(dir, { nowMs: Date.now(), staleMs: 45 * 60 * 1000 })).toBe(true);
  });

  test("false when every file predates the staleness window", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-activity-"));
    fs.writeFileSync(path.join(dir, "old.txt"), "x");
    // Rather than fiddling with real file mtimes cross-platform, fast-forward
    // "now" past the staleness window instead — same effect, deterministic.
    const farFutureNow = Date.now() + 46 * 60 * 1000;
    expect(hasRecentFileActivity(dir, { nowMs: farFutureNow, staleMs: 45 * 60 * 1000 })).toBe(
      false
    );
  });

  test("ignores activity inside skipped directories (node_modules, .git, etc.)", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-activity-"));
    fs.mkdirSync(path.join(dir, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(dir, "node_modules", "recent.txt"), "x");
    const farFutureNow = Date.now() + 46 * 60 * 1000;
    expect(hasRecentFileActivity(dir, { nowMs: farFutureNow, staleMs: 45 * 60 * 1000 })).toBe(
      false
    );
  });

  test("finds recent activity nested several directories deep", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-activity-"));
    const nested = path.join(dir, "scripts", "__tests__");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "reap-worktrees.test.mjs"), "x");
    expect(hasRecentFileActivity(dir, { nowMs: Date.now(), staleMs: 45 * 60 * 1000 })).toBe(true);
  });

  test("fails safe to true when the worktree path cannot be read at all", () => {
    expect(hasRecentFileActivity("/nonexistent/does-not-exist-3986")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// findUnregisteredOnDiskWorktrees — #4122's second, distinct defect: a
// directory can exist on disk under `.claude/worktrees/` while NOT
// appearing in `git worktree list` at all (observed live:
// `agent-ac0d717e0bdebd347`). This state cannot be reasoned about via PR
// state — there is no branch to query — so it is surfaced separately and
// `git worktree remove` is never attempted against it; only reported, with
// `git worktree prune` as the suggested remedy (never auto-run by this
// script). Pure: takes already-collected path/leaf-name lists, no fs calls.
// ---------------------------------------------------------------------------

describe("findUnregisteredOnDiskWorktrees", () => {
  const root = "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees";

  test("returns leaf names present on disk but not registered", () => {
    const registeredPaths = [`${root}/agent-abc123`, `${root}/3169-node20-eslint`];
    const onDiskLeafNames = ["agent-abc123", "3169-node20-eslint", "agent-ac0d717e0bdebd347"];
    expect(findUnregisteredOnDiskWorktrees(registeredPaths, onDiskLeafNames, root)).toEqual([
      "agent-ac0d717e0bdebd347",
    ]);
  });

  test("returns an empty array when every on-disk entry is registered", () => {
    const registeredPaths = [`${root}/agent-abc123`];
    const onDiskLeafNames = ["agent-abc123"];
    expect(findUnregisteredOnDiskWorktrees(registeredPaths, onDiskLeafNames, root)).toEqual([]);
  });

  test("treats every on-disk entry as unregistered when the registered list is empty", () => {
    const onDiskLeafNames = ["agent-abc123", "3169-node20-eslint"];
    expect(findUnregisteredOnDiskWorktrees([], onDiskLeafNames, root)).toEqual([
      "agent-abc123",
      "3169-node20-eslint",
    ]);
  });

  test("returns an empty array for empty on-disk input regardless of registered paths", () => {
    expect(findUnregisteredOnDiskWorktrees([`${root}/agent-abc123`], [], root)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// removeWorktree — refuses to touch a non-agent-worktree path even when
// directly invoked (defense in depth, independent of decideWorktreeReap).
// ---------------------------------------------------------------------------

describe("removeWorktree safety guard", () => {
  test("throws instead of shelling out for a path outside .claude/worktrees/agent-*", () => {
    const exec = () => {
      throw new Error("exec should never be called");
    };
    expect(() =>
      removeWorktree(
        { path: "/Users/mbutler/github/mattbutlerengineering", branch: "main" },
        { exec }
      )
    ).toThrow(/refus/i);
  });

  // #4122: widening what may be removed is deliberate and narrow — a
  // hand-created worktree is only ever removable with `hasMergedPr: true`
  // attached to the exact call, never on path shape alone.
  test("throws for a hand-created worktree path without hasMergedPr, even though the caller tries", () => {
    const exec = () => {
      throw new Error("exec should never be called");
    };
    expect(() =>
      removeWorktree(
        {
          path: "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint",
          branch: "fix/3169-node20-eslint-guardrail",
        },
        { exec }
      )
    ).toThrow(/refus/i);
  });

  test("throws for a hand-created worktree path when hasMergedPr is explicitly false", () => {
    const exec = () => {
      throw new Error("exec should never be called");
    };
    expect(() =>
      removeWorktree(
        {
          path: "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint",
          branch: "fix/3169-node20-eslint-guardrail",
          hasMergedPr: false,
        },
        { exec }
      )
    ).toThrow(/refus/i);
  });
});

// ---------------------------------------------------------------------------
// Integration: real `git worktree remove --force` against a throwaway repo
// created in os.tmpdir() — never touches anything under the real
// .claude/worktrees/. Proves the shell-out side actually works, not just
// the pure decision logic.
// ---------------------------------------------------------------------------

describe("removeWorktree integration (throwaway repo)", () => {
  let repoDir;
  let worktreePath;

  afterEach(() => {
    if (repoDir) fs.rmSync(repoDir, { recursive: true, force: true });
    repoDir = undefined;
  });

  test("actually removes a real worktree and deletes its local branch", () => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-worktrees-fixture-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "README.md"), "fixture\n");
    execFileSync("git", ["add", "README.md"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });

    const worktreesDir = path.join(repoDir, ".claude", "worktrees");
    fs.mkdirSync(worktreesDir, { recursive: true });
    worktreePath = path.join(worktreesDir, "agent-fixture01");

    execFileSync(
      "git",
      ["worktree", "add", "-b", "worktree-agent-fixture01", worktreePath, "main"],
      { cwd: repoDir }
    );
    // Simulate the permanent prettier-hook dirt + a squash-merge-orphaned
    // commit: neither should block removal.
    fs.writeFileSync(path.join(worktreePath, "dirty.txt"), "uncommitted\n");
    execFileSync("git", ["add", "-A"], { cwd: worktreePath });
    execFileSync("git", ["commit", "-q", "-m", "orphaned work"], { cwd: worktreePath });
    fs.writeFileSync(path.join(worktreePath, "extra-dirt.txt"), "still dirty\n");

    expect(fs.existsSync(worktreePath)).toBe(true);

    removeWorktree({ path: worktreePath, branch: "worktree-agent-fixture01" }, { cwd: repoDir });

    expect(fs.existsSync(worktreePath)).toBe(false);
    const branches = execFileSync("git", ["branch", "--list", "worktree-agent-fixture01"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(branches.trim()).toBe("");
  });

  // #4122: a hand-created worktree removes successfully ONLY when the call
  // carries positive `hasMergedPr: true` evidence — the narrow widening the
  // issue asks for, proven end to end against a real worktree.
  test("removes a hand-created worktree when hasMergedPr: true is attached to the call", () => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "reap-worktrees-fixture-"));
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: repoDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, "README.md"), "fixture\n");
    execFileSync("git", ["add", "README.md"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });

    const worktreesDir = path.join(repoDir, ".claude", "worktrees");
    fs.mkdirSync(worktreesDir, { recursive: true });
    worktreePath = path.join(worktreesDir, "3169-node20-eslint");

    execFileSync(
      "git",
      ["worktree", "add", "-b", "fix/3169-node20-eslint-guardrail", worktreePath, "main"],
      { cwd: repoDir }
    );

    expect(fs.existsSync(worktreePath)).toBe(true);

    removeWorktree(
      { path: worktreePath, branch: "fix/3169-node20-eslint-guardrail", hasMergedPr: true },
      { cwd: repoDir }
    );

    expect(fs.existsSync(worktreePath)).toBe(false);
    const branches = execFileSync("git", ["branch", "--list", "fix/3169-node20-eslint-guardrail"], {
      cwd: repoDir,
      encoding: "utf8",
    });
    expect(branches.trim()).toBe("");
  });
});
