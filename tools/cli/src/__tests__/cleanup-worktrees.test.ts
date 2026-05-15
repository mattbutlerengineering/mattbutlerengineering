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

    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining("git worktree remove"), expect.anything());
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git branch -D "worktree-agent-2"'), expect.anything());
  });
});
