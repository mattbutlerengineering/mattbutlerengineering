import { describe, it, expect, vi } from "vitest";
import { scheduleWorktreeReap } from "../worktree-reaper.js";

const BASE_OPTS = {
  repoPath: "/repo",
  worktreePath: "/repo/.agent-worktrees/agent-fix-bug-abc123",
  mode: "full" as const,
  // No real delays in tests.
  baseDelayMs: 0,
  maxRetries: 3,
};

describe("scheduleWorktreeReap", () => {
  it("retries worktree removal and resolves when a retry succeeds", async () => {
    // First attempt throws (lock contention), second succeeds.
    const removeFn = vi
      .fn<
        (repoPath: string, worktreePath: string, mode?: "full" | "lightweight") => Promise<void>
      >()
      .mockRejectedValueOnce(new Error("fatal: worktree is locked"))
      .mockResolvedValueOnce(undefined);

    const outcome = await scheduleWorktreeReap({ ...BASE_OPTS, removeFn });

    expect(outcome.succeeded).toBe(true);
    expect(outcome.attempts).toBe(2);
    // Removal was retried with the same isolation target (ADR-005: same worktree, no new model).
    expect(removeFn).toHaveBeenCalledTimes(2);
    expect(removeFn).toHaveBeenLastCalledWith(
      "/repo",
      "/repo/.agent-worktrees/agent-fix-bug-abc123",
      "full"
    );
  });

  it("surfaces exhaustion at error level with the worktree path", async () => {
    const removeFn = vi
      .fn<
        (repoPath: string, worktreePath: string, mode?: "full" | "lightweight") => Promise<void>
      >()
      .mockRejectedValue(new Error("fatal: worktree is locked"));
    const errorLog = vi.fn();

    const outcome = await scheduleWorktreeReap({
      ...BASE_OPTS,
      removeFn,
      logger: { error: errorLog },
    });

    expect(outcome.succeeded).toBe(false);
    // maxRetries: 3 → 1 initial + 3 retries = 4 attempts.
    expect(removeFn).toHaveBeenCalledTimes(4);
    expect(errorLog).toHaveBeenCalledTimes(1);
    const [message] = errorLog.mock.calls[0];
    expect(message).toContain("/repo/.agent-worktrees/agent-fix-bug-abc123");
    expect(message).toContain("fatal: worktree is locked");
  });

  it("does not log an error when the first retry succeeds", async () => {
    const removeFn = vi
      .fn<
        (repoPath: string, worktreePath: string, mode?: "full" | "lightweight") => Promise<void>
      >()
      .mockRejectedValueOnce(new Error("fatal: worktree is locked"))
      .mockResolvedValueOnce(undefined);
    const errorLog = vi.fn();

    const outcome = await scheduleWorktreeReap({
      ...BASE_OPTS,
      removeFn,
      logger: { error: errorLog },
    });

    expect(outcome.succeeded).toBe(true);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("defaults to the lightweight mode target when given lightweight", async () => {
    const removeFn = vi
      .fn<
        (repoPath: string, worktreePath: string, mode?: "full" | "lightweight") => Promise<void>
      >()
      .mockResolvedValue(undefined);

    const outcome = await scheduleWorktreeReap({
      ...BASE_OPTS,
      mode: "lightweight",
      removeFn,
    });

    expect(outcome.succeeded).toBe(true);
    expect(removeFn).toHaveBeenCalledWith(
      "/repo",
      "/repo/.agent-worktrees/agent-fix-bug-abc123",
      "lightweight"
    );
  });
});
