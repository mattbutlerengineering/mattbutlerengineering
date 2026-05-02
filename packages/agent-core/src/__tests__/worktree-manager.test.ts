import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock child_process and fs
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  rm: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import {
  createWorktree,
  removeWorktree,
  commitChanges,
  hasChanges,
  validateGitRef,
  validatePath,
} from "../worktree-manager.js";

// Helper to set up promisified execFile mock
function setupExecFileMock(stdoutResponses: string[] = [""]) {
  let callIndex = 0;
  vi.mocked(execFile).mockImplementation(
    ((...args: unknown[]) => {
      const callback = args[args.length - 1];
      const stdout = stdoutResponses[callIndex] ?? "";
      callIndex++;
      if (typeof callback === "function") {
        (callback as (err: null, result: { stdout: string }) => void)(null, {
          stdout,
        });
      }
      return {} as ReturnType<typeof execFile>;
    }) as typeof execFile
  );
}

// ── Input validation ─────────────────────────────────────────────────────────

describe("validateGitRef", () => {
  it("accepts valid branch names", () => {
    expect(() => validateGitRef("main", "branch")).not.toThrow();
    expect(() => validateGitRef("feature/foo-bar", "branch")).not.toThrow();
    expect(() => validateGitRef("agent/fix-login-abc123", "branch")).not.toThrow();
    expect(() => validateGitRef("v1.2.3", "tag")).not.toThrow();
    expect(() => validateGitRef("release_2024", "branch")).not.toThrow();
  });

  it("rejects refs starting with a dash (argument injection)", () => {
    expect(() => validateGitRef("--evil", "branch")).toThrow("Invalid branch");
    expect(() => validateGitRef("-n", "branch")).toThrow("Invalid branch");
  });

  it("rejects refs starting with a dot", () => {
    expect(() => validateGitRef(".hidden", "branch")).toThrow("Invalid branch");
  });

  it("rejects refs with shell metacharacters", () => {
    expect(() => validateGitRef("main;rm -rf /", "branch")).toThrow("Invalid branch");
    expect(() => validateGitRef("main$(whoami)", "branch")).toThrow("Invalid branch");
    expect(() => validateGitRef("main`id`", "branch")).toThrow("Invalid branch");
    expect(() => validateGitRef("a|b", "branch")).toThrow("Invalid branch");
    expect(() => validateGitRef("a&b", "branch")).toThrow("Invalid branch");
  });

  it("rejects empty strings", () => {
    expect(() => validateGitRef("", "branch")).toThrow("Invalid branch");
  });
});

describe("validatePath", () => {
  it("accepts valid paths", () => {
    expect(() => validatePath("/repo/path", "repoPath")).not.toThrow();
    expect(() => validatePath("/home/user/project", "repoPath")).not.toThrow();
    expect(() => validatePath("relative/path", "repoPath")).not.toThrow();
  });

  it("rejects paths with shell metacharacters", () => {
    expect(() => validatePath("/repo;rm -rf /", "path")).toThrow("Invalid path");
    expect(() => validatePath("/repo$(whoami)", "path")).toThrow("Invalid path");
    expect(() => validatePath("/repo`id`", "path")).toThrow("Invalid path");
    expect(() => validatePath("/repo|cat", "path")).toThrow("Invalid path");
    expect(() => validatePath("/repo&bg", "path")).toThrow("Invalid path");
    expect(() => validatePath("/repo\ncd /", "path")).toThrow("Invalid path");
  });

  it("rejects empty strings", () => {
    expect(() => validatePath("", "path")).toThrow("Invalid path");
  });
});

// ── createWorktree rejects malicious inputs ──────────────────────────────────

describe("createWorktree input validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects baseBranch starting with --", async () => {
    await expect(
      createWorktree("/repo", "--upload-pack=evil", "task")
    ).rejects.toThrow("Invalid baseBranch");
  });

  it("rejects baseBranch with shell metacharacters", async () => {
    await expect(
      createWorktree("/repo", "main;rm -rf /", "task")
    ).rejects.toThrow("Invalid baseBranch");
  });

  it("rejects repoPath with shell metacharacters", async () => {
    await expect(
      createWorktree("/repo$(whoami)", "main", "task")
    ).rejects.toThrow("Invalid repoPath");
  });
});

// ── Full worktree mode (default) ──────────────────────────────────────────────

describe("createWorktree (full mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a full worktree with a generated branch name", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "Fix login bug");

    expect(result.branchName).toMatch(/^agent\/fix-login-bug-[a-f0-9]{6}$/);
    expect(result.path).toContain(".agent-worktrees");
    expect(result.mode).toBe("full");
    expect(execFile).toHaveBeenCalled();
  });

  it("defaults to full mode when no options are provided", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "task");

    expect(result.mode).toBe("full");
  });

  it("explicitly uses full mode when mode: 'full' is passed with -- separator", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "task", { mode: "full" });

    expect(result.mode).toBe("full");
    // 'git worktree add' should be the command used with `--` separator
    const calls = vi.mocked(execFile).mock.calls;
    const gitArgs = calls[0][1] as string[];
    expect(gitArgs).toContain("worktree");
    expect(gitArgs).toContain("add");
    expect(gitArgs).toContain("--");
  });

  it("generates branch names from task descriptions", async () => {
    setupExecFileMock([""]);

    const result = await createWorktree("/repo", "main", "Add user AUTH!!! Feature");

    expect(result.branchName).toMatch(/^agent\/add-user-auth-feature-[a-f0-9]{6}$/);
  });

  it("truncates long task descriptions in branch names", async () => {
    setupExecFileMock([""]);

    const longDesc = "A".repeat(100);
    const result = await createWorktree("/repo", "main", longDesc);

    // Branch name should be: "agent/" + slug (max 40) + "-" + 6 hex chars
    const slugPart = result.branchName.replace(/^agent\//, "").replace(/-[a-f0-9]{6}$/, "");
    expect(slugPart.length).toBeLessThanOrEqual(40);
  });
});

// ── Lightweight worktree mode ────────────────────────────────────────────────

describe("createWorktree (lightweight mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a lightweight clone and returns mode: 'lightweight'", async () => {
    // Two execFile calls: git clone, then git checkout -b
    setupExecFileMock(["", ""]);

    const result = await createWorktree("/repo", "main", "Fix typo", { mode: "lightweight" });

    expect(result.branchName).toMatch(/^agent\/fix-typo-[a-f0-9]{6}$/);
    expect(result.path).toContain(".agent-worktrees");
    expect(result.mode).toBe("lightweight");
  });

  it("uses git clone --depth 1 for the shallow clone step with -- separator", async () => {
    setupExecFileMock(["", ""]);

    await createWorktree("/repo", "main", "Fix typo", { mode: "lightweight" });

    const calls = vi.mocked(execFile).mock.calls;
    // First call should be the clone
    const firstArgs = calls[0][1] as string[];
    expect(firstArgs).toContain("clone");
    expect(firstArgs).toContain("--depth");
    expect(firstArgs).toContain("1");
    // `--` should appear to separate options from positional args
    expect(firstArgs).toContain("--");
  });

  it("creates a new branch in the cloned directory", async () => {
    setupExecFileMock(["", ""]);

    const result = await createWorktree("/repo", "main", "Fix typo", { mode: "lightweight" });

    const calls = vi.mocked(execFile).mock.calls;
    // Second call should be the branch creation
    const secondArgs = calls[1][1] as string[];
    expect(secondArgs).toContain("checkout");
    expect(secondArgs).toContain("-b");
    expect(secondArgs).toContain(result.branchName);
  });

  it("places the clone under .agent-worktrees with the branch name as directory", async () => {
    setupExecFileMock(["", ""]);

    const result = await createWorktree("/repo", "main", "Fix typo", { mode: "lightweight" });

    expect(result.path).toMatch(/\.agent-worktrees\/agent-fix-typo-[a-f0-9]{6}$/);
  });
});

// ── removeWorktree ────────────────────────────────────────────────────────────

describe("removeWorktree", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes an existing full worktree via git worktree remove with -- separator", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    setupExecFileMock([""]);

    await removeWorktree("/repo", "/repo/.agent-worktrees/test", "full");
    expect(execFile).toHaveBeenCalled();
    const gitArgs = vi.mocked(execFile).mock.calls[0][1] as string[];
    expect(gitArgs).toContain("worktree");
    expect(gitArgs).toContain("remove");
    expect(gitArgs).toContain("--");
    // `--` must come before the path (positional arg)
    const dashDashIdx = gitArgs.indexOf("--");
    const pathIdx = gitArgs.indexOf("/repo/.agent-worktrees/test");
    expect(dashDashIdx).toBeLessThan(pathIdx);
  });

  it("removes an existing lightweight worktree via rm (no git command)", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(rm).mockResolvedValueOnce(undefined);

    await removeWorktree("/repo", "/repo/.agent-worktrees/test", "lightweight");

    expect(execFile).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledWith("/repo/.agent-worktrees/test", {
      recursive: true,
      force: true,
    });
  });

  it("defaults to full mode when no mode is passed", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    setupExecFileMock([""]);

    await removeWorktree("/repo", "/repo/.agent-worktrees/test");
    const gitArgs = vi.mocked(execFile).mock.calls[0][1] as string[];
    expect(gitArgs).toContain("worktree");
  });

  it("skips removal if worktree does not exist", async () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);

    await removeWorktree("/repo", "/repo/.agent-worktrees/nonexistent");
    expect(execFile).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
  });
});

// ── commitChanges ─────────────────────────────────────────────────────────────

describe("commitChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and commits changes, returns SHA", async () => {
    setupExecFileMock(["", "M src/index.ts", "", "abc123"]);

    const sha = await commitChanges("/worktree", "feat: test commit");
    expect(sha).toBe("abc123");
  });

  it("returns empty string when there are no changes", async () => {
    setupExecFileMock(["", ""]);

    const sha = await commitChanges("/worktree", "feat: nothing");
    expect(sha).toBe("");
  });
});

// ── hasChanges ────────────────────────────────────────────────────────────────

describe("hasChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when there are changes", async () => {
    setupExecFileMock(["M src/index.ts"]);

    const result = await hasChanges("/worktree");
    expect(result).toBe(true);
  });

  it("returns false when there are no changes", async () => {
    setupExecFileMock([""]);

    const result = await hasChanges("/worktree");
    expect(result).toBe(false);
  });
});
