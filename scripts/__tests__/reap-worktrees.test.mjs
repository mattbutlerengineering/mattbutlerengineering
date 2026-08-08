import { describe, test, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import {
  isAgentWorktreePath,
  decideWorktreeReap,
  planReap,
  parseWorktreeListPorcelain,
  hasOpenPrForBranch,
  isWorktreeLive,
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
// decideWorktreeReap — the whole safety gate. The two refusals that matter
// most: a live owning process, and an open PR. Neither dirtiness nor git
// ancestry ("merged into main") is a decision input at all — squash merges
// make ancestry meaningless and the prettier hook makes dirtiness universal.
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

  test("refuses a non-agent-worktree path even if not live and no open PR", () => {
    const decision = decideWorktreeReap({
      path: "/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/3169-node20-eslint",
      branch: "fix/3169-node20-eslint-guardrail",
      isLive: false,
      hasOpenPr: false,
    });
    expect(decision).toEqual({ eligible: false, reason: "not-agent-worktree" });
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
});
