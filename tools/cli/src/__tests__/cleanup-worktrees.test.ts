import { describe, it, expect, vi, beforeEach } from "vitest";
import { readdirSync, statSync } from "node:fs";

// Expose a mock fn to avoid importing the real @mbe/agent-core (no dist built
// in a fresh worktree) — same pattern used by wave.test.ts.
const mockRunGit = vi.fn();

vi.mock("@mbe/agent-core", () => ({
  runGit: mockRunGit,
}));

vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(),
}));

const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

/** Default runGit stub: resolves rev-parse/branch -r, no-ops everything else. */
function defaultRunGitImpl(remoteBranchesOutput = "  origin/main\n  origin/other") {
  return async (args: readonly string[]) => {
    if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return "/repo";
    if (args[0] === "branch" && args[1] === "-r") return remoteBranchesOutput;
    return "";
  };
}

describe("cleanup-worktrees command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mockRunGit.mockImplementation(defaultRunGitImpl());
  });

  async function runCleanup(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("reports when no worktrees exist", async () => {
    mockReaddirSync.mockReturnValue([]);
    await runCleanup([]);
    expect(logSpy).toHaveBeenCalledWith("No orphaned worktrees to clean up.");
  });

  it("identifies orphaned worktrees", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-1"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 2 * 24 * 60 * 60 * 1000 } as any);

    await runCleanup(["--days", "1"]);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Found 1 orphaned worktrees"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("agent-1"));
  });

  it("removes worktrees when --force is used, calling runGit with an arg array (never a shell string)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-2"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 2 * 24 * 60 * 60 * 1000 } as any);

    await runCleanup(["--force"]);

    expect(mockRunGit).toHaveBeenCalledWith(
      ["worktree", "remove", "--force", "--", expect.stringContaining("agent-2")],
      expect.objectContaining({ cwd: "/repo" })
    );
    expect(mockRunGit).toHaveBeenCalledWith(
      ["branch", "-D", "--", "worktree-agent-2"],
      expect.objectContaining({ cwd: "/repo" })
    );
  });

  it("passes a worktree name containing shell metacharacters through as a single argv element (regression: former interpolation-injection risk)", async () => {
    // A directory name that would break out of a naive `"${wtPath}"` shell string.
    const dangerousName = 'agent-2"; rm -rf / #';
    mockReaddirSync.mockReturnValue([dangerousName] as unknown as Parameters<
      typeof mockReaddirSync.mockReturnValue
    >[0]);
    mockStatSync.mockReturnValue({
      mtimeMs: Date.now() - 2 * 24 * 60 * 60 * 1000,
    } as unknown as ReturnType<typeof statSync>);

    await runCleanup(["--force"]);

    const worktreeRemoveCall = mockRunGit.mock.calls.find((call) => call[0][0] === "worktree");
    expect(worktreeRemoveCall).toBeDefined();
    const argv = worktreeRemoveCall![0] as string[];
    // The dangerous string must be a single argv element (arg-array form),
    // never concatenated into a shell command string.
    expect(argv[argv.length - 1]).toContain(dangerousName);
    expect(Array.isArray(argv)).toBe(true);
  });
});

describe("cleanup-worktrees – additional branch coverage", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockRunGit.mockImplementation(defaultRunGitImpl("  origin/main"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-1"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 3 * 24 * 60 * 60 * 1000 } as any);
  });

  async function runCleanup2(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("falls back to rmSync when git worktree remove fails, and warns instead of swallowing", async () => {
    const { rmSync } = await import("node:fs");
    const mockRmSync = vi.mocked(rmSync);
    mockRmSync.mockReturnValue(undefined as never);

    mockRunGit.mockImplementation(async (args: readonly string[]) => {
      if (args[0] === "rev-parse") return "/repo";
      if (args[0] === "branch" && args[1] === "-r") return "  origin/main";
      if (args[0] === "worktree") throw new Error("worktree error");
      return "";
    });

    await runCleanup2(["--force"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Removed directory: agent-1");
    const warnOutput = warnSpy.mock.calls.flat().join("\n");
    expect(warnOutput).toContain("worktree error");
  });

  it("logs error when both git worktree remove and rmSync fail", async () => {
    const { rmSync } = await import("node:fs");
    const mockRmSync = vi.mocked(rmSync);
    mockRmSync.mockImplementation(() => {
      throw new Error("permission denied");
    });

    mockRunGit.mockImplementation(async (args: readonly string[]) => {
      if (args[0] === "rev-parse") return "/repo";
      if (args[0] === "branch" && args[1] === "-r") return "  origin/main";
      if (args[0] === "worktree") throw new Error("worktree error");
      return "";
    });

    await runCleanup2(["--force"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Failed to remove agent-1");
  });

  it("warns (does not silently swallow) when git branch -D fails", async () => {
    mockRunGit.mockImplementation(async (args: readonly string[]) => {
      if (args[0] === "rev-parse") return "/repo";
      if (args[0] === "branch" && args[1] === "-r") return "  origin/main";
      if (args[0] === "branch" && args[1] === "-D") throw new Error("branch not found");
      return "";
    });

    await runCleanup2(["--force"]);

    const warnOutput = warnSpy.mock.calls.flat().join("\n");
    expect(warnOutput).toContain("Could not delete branch worktree-agent-1");
    expect(warnOutput).toContain("branch not found");
  });

  it("shows dry-run message without removing", async () => {
    await runCleanup2(["--dry-run"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Dry run");
  });

  it("shows --force hint when not --force and not --dry-run", async () => {
    await runCleanup2([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("--force");
  });
});

describe("cleanup-worktrees – error catch fallbacks", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function runCleanup3(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("falls back to cwd when git rev-parse fails", async () => {
    mockRunGit.mockImplementation(async (args: readonly string[]) => {
      if (args[0] === "rev-parse") throw new Error("not a git repo");
      if (args[0] === "branch" && args[1] === "-r") return "  origin/main";
      return "";
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue([] as any);

    await runCleanup3([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No orphaned worktrees");
  });

  it("returns empty array when readdirSync fails", async () => {
    mockRunGit.mockImplementation(defaultRunGitImpl("  origin/main"));
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await runCleanup3([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No orphaned worktrees");
  });

  it("returns empty remote branches when git branch -r fails", async () => {
    mockRunGit.mockImplementation(async (args: readonly string[]) => {
      if (args[0] === "rev-parse") return "/repo";
      if (args[0] === "branch" && args[1] === "-r") throw new Error("no remote");
      return "";
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-1"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 3 * 24 * 60 * 60 * 1000 } as any);

    await runCleanup3([]);

    // With no remote branches returned, all worktrees are treated as orphaned
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Found 1 orphaned worktrees");
  });

  it("pushes worktree to toRemove when statSync throws during age check", async () => {
    mockRunGit.mockImplementation(defaultRunGitImpl("  origin/main"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-err"] as any);
    mockStatSync.mockImplementation(() => {
      throw new Error("EACCES");
    });

    await runCleanup3([]);

    // statSync throws → worktree is pushed to toRemove anyway
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Found 1 orphaned worktrees");
  });
});

describe("cleanup-worktrees – hasRemote branch coverage", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  async function runCleanup4(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("skips worktrees whose branch exists in remote (hasRemote=true branch)", async () => {
    // worktree "agent-1" → branchName "worktree-agent-1"
    // remote has "origin/worktree-agent-1" → hasRemote is true → NOT pushed to toRemove
    mockRunGit.mockImplementation(defaultRunGitImpl("  origin/main\n  origin/worktree-agent-1"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-1"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 2 * 24 * 60 * 60 * 1000 } as any);

    await runCleanup4(["--days", "1"]);

    // hasRemote=true → nothing added to toRemove → "No orphaned worktrees"
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No orphaned worktrees");
  });
});
