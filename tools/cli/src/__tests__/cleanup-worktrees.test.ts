import { describe, it, expect, vi, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  existsSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

describe("cleanup-worktrees command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main\n  origin/other";
      return "";
    });
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

  it("removes worktrees when --force is used", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-2"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 2 * 24 * 60 * 60 * 1000 } as any);

    await runCleanup(["--force"]);

    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining("git worktree remove"),
      expect.anything()
    );
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git branch -D "worktree-agent-2"'),
      expect.anything()
    );
  });
});

describe("cleanup-worktrees – additional branch coverage", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Default: workspace found, aged worktree "agent-1" exists, not on remote
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main";
      if (cmd.includes("git branch -D")) return "";
      // git worktree remove succeeds by default
      return "";
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue(["agent-1"] as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockStatSync.mockReturnValue({ mtimeMs: Date.now() - 3 * 24 * 60 * 60 * 1000 } as any);
  });

  async function runCleanup2(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("falls back to rmSync when git worktree remove fails", async () => {
    const { rmSync } = await import("node:fs");
    const mockRmSync = vi.mocked(rmSync);
    mockRmSync.mockReturnValue(undefined as never);

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main";
      if (cmd.includes("git worktree remove")) throw new Error("worktree error");
      if (cmd.includes("git branch -D")) return "";
      return "";
    });

    await runCleanup2(["--force"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Removed directory: agent-1");
  });

  it("logs error when both git worktree remove and rmSync fail", async () => {
    const { rmSync } = await import("node:fs");
    const mockRmSync = vi.mocked(rmSync);
    mockRmSync.mockImplementation(() => {
      throw new Error("permission denied");
    });

    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main";
      if (cmd.includes("git worktree remove")) throw new Error("worktree error");
      if (cmd.includes("git branch -D")) return "";
      return "";
    });

    await runCleanup2(["--force"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Failed to remove agent-1");
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
    vi.spyOn(process, "cwd").mockReturnValue("/fallback");
  });

  async function runCleanup3(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("falls back to cwd when git rev-parse fails (line 10)", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) throw new Error("not a git repo");
      if (cmd.includes("git branch -r")) return "  origin/main";
      return "";
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockReaddirSync.mockReturnValue([] as any);

    await runCleanup3([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No orphaned worktrees");
  });

  it("returns empty array when readdirSync fails (line 20)", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main";
      return "";
    });
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT");
    });

    await runCleanup3([]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("No orphaned worktrees");
  });

  it("returns empty remote branches when git branch -r fails (line 33)", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) return "/repo";
      if (cmd.includes("git branch -r")) throw new Error("no remote");
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

  it("pushes worktree to toRemove when statSync throws during age check (line 72)", async () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main";
      return "";
    });
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
  });

  async function runCleanup4(args: string[]): Promise<void> {
    const { cleanupWorktreesCommand } = await import("../commands/cleanup-worktrees.js");
    await cleanupWorktreesCommand.parseAsync(["node", "mbe", ...args]);
  }

  it("skips worktrees whose branch exists in remote (hasRemote=true branch)", async () => {
    // worktree "agent-1" → branchName "worktree-agent-1"
    // remote has "origin/worktree-agent-1" → hasRemote is true → NOT pushed to toRemove
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes("rev-parse --show-toplevel")) return "/repo";
      if (cmd.includes("git branch -r")) return "  origin/main\n  origin/worktree-agent-1";
      return "";
    });
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
