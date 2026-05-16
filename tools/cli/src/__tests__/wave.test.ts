import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Expose mock functions to avoid importing @mbe/agent-core (no dist built)
const mockCreateWorktree = vi.fn();
const mockRemoveWorktree = vi.fn();

vi.mock("@mbe/agent-core", () => ({
  createWorktree: mockCreateWorktree,
  removeWorktree: mockRemoveWorktree,
}));

const mockExistsSync = vi.mocked(existsSync);
const mockSpawn = vi.mocked(spawn);
const mockExecSync = vi.mocked(execSync);

function makeFakeProcess(closeCode: number = 0): Partial<ChildProcess> {
  const proc = {
    on(event: string, cb: (...args: unknown[]) => void) {
      if (event === "close") {
        Promise.resolve().then(() => cb(closeCode));
      }
      return proc;
    },
  };
  return proc as unknown as Partial<ChildProcess>;
}

describe("wave command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
    mockExistsSync.mockImplementation((p: unknown) =>
      String(p).endsWith("pnpm-workspace.yaml")
    );
    mockExecSync.mockReturnValue("" as never);
    mockSpawn.mockReturnValue(makeFakeProcess(0) as ChildProcess);
    mockCreateWorktree.mockResolvedValue({
      branchName: "agent/task-1",
      path: "/repo/.worktrees/task-1",
    });
    mockRemoveWorktree.mockResolvedValue(undefined);
  });

  async function runWave(args: string[]): Promise<void> {
    const { waveCommand } = await import("../commands/wave.js");
    await waveCommand.parseAsync(args, { from: "user" });
  }

  it("runs tasks and reports completion", async () => {
    await runWave(["fix the bug"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Wave execution complete");
    expect(output).toContain("Done");
  });

  it("exits with 1 when all tasks fail", async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(1) as ChildProcess);

    await runWave(["fix the bug"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("tasks failed");
  });

  it("merges successful branches", async () => {
    await runWave(["fix the bug"]);

    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("git merge"))).toBe(true);
  });

  it("handles worktree creation errors gracefully", async () => {
    mockCreateWorktree.mockRejectedValue(new Error("worktree failed"));

    await runWave(["fix the bug"]);

    expect(exitSpy).toHaveBeenCalledWith(1);
    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("worktree failed");
  });

  it("handles multiple tasks in parallel", async () => {
    mockCreateWorktree
      .mockResolvedValueOnce({ branchName: "agent/task-1", path: "/repo/.worktrees/task-1" })
      .mockResolvedValueOnce({ branchName: "agent/task-2", path: "/repo/.worktrees/task-2" });

    await runWave(["task one", "task two"]);

    expect(mockCreateWorktree).toHaveBeenCalledTimes(2);
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Wave execution complete");
  });

  it("skips merge for failed tasks", async () => {
    mockSpawn.mockReturnValue(makeFakeProcess(1) as ChildProcess);

    await runWave(["fail task"]);

    // git merge should NOT be called for a failed task
    const execCalls = mockExecSync.mock.calls.map(([cmd]) => String(cmd));
    expect(execCalls.some((cmd) => cmd.includes("git merge"))).toBe(false);
  });

  it("logs merge failure message when git merge throws", async () => {
    // Task succeeds but git merge fails
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (String(cmd).includes("git merge")) throw new Error("merge conflict");
      return "" as never;
    });

    await runWave(["fix the bug"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("Failed to merge");
    expect(errOutput).toContain("conflicts");
  });
});
