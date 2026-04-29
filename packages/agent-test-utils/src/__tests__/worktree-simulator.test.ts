import { describe, it, expect } from "vitest";
import {
  createWorktreeSimulator,
  assertOperationCalled,
  assertOperationNotCalled,
  CLEAN_REPO_FILES,
  DIRTY_REPO_FILES,
  CONFLICTED_REPO_FILES,
} from "../worktree-simulator.js";

describe("createWorktreeSimulator", () => {
  describe("default (clean) state", () => {
    it("createWorktree returns a WorktreeInfo", async () => {
      const sim = createWorktreeSimulator({ repoPath: "/repo" });
      const info = await sim.createWorktree("/repo", "fix bug");
      expect(info.path).toContain("/repo");
      expect(info.branchName).toBeTruthy();
      expect(info.mode).toBe("full");
    });

    it("hasChanges returns false for clean repo", async () => {
      const sim = createWorktreeSimulator({ state: "clean" });
      const result = await sim.hasChanges("/repo/worktree");
      expect(result).toBe(false);
    });

    it("runVerification passes for clean repo", async () => {
      const sim = createWorktreeSimulator({ state: "clean" });
      const result = await sim.runVerification("/repo/worktree");
      expect(result.passed).toBe(true);
      expect(result.lintOk).toBe(true);
      expect(result.typecheckOk).toBe(true);
      expect(result.testsOk).toBe(true);
    });

    it("provides CLEAN_REPO_FILES by default", () => {
      const sim = createWorktreeSimulator({ state: "clean" });
      expect(sim.files()).toBe(CLEAN_REPO_FILES);
    });
  });

  describe("dirty state", () => {
    it("hasChanges returns true", async () => {
      const sim = createWorktreeSimulator({ state: "dirty" });
      expect(await sim.hasChanges("/repo/worktree")).toBe(true);
    });

    it("runVerification passes for dirty repo", async () => {
      const sim = createWorktreeSimulator({ state: "dirty" });
      const result = await sim.runVerification("/repo/worktree");
      expect(result.passed).toBe(true);
    });

    it("provides DIRTY_REPO_FILES", () => {
      const sim = createWorktreeSimulator({ state: "dirty" });
      expect(sim.files()).toBe(DIRTY_REPO_FILES);
    });
  });

  describe("conflicted state", () => {
    it("hasChanges returns true", async () => {
      const sim = createWorktreeSimulator({ state: "conflicted" });
      expect(await sim.hasChanges("/repo/worktree")).toBe(true);
    });

    it("runVerification fails for conflicted repo", async () => {
      const sim = createWorktreeSimulator({ state: "conflicted" });
      const result = await sim.runVerification("/repo/worktree");
      expect(result.passed).toBe(false);
      expect(result.lintOk).toBe(false);
    });

    it("provides CONFLICTED_REPO_FILES", () => {
      const sim = createWorktreeSimulator({ state: "conflicted" });
      expect(sim.files()).toBe(CONFLICTED_REPO_FILES);
    });
  });

  describe("commitChanges", () => {
    it("returns a deterministic commit sha", async () => {
      const sim = createWorktreeSimulator();
      const sha = await sim.commitChanges("/repo/worktree");
      expect(sha).toBeTruthy();
      expect(typeof sha).toBe("string");
    });
  });

  describe("pushBranch", () => {
    it("succeeds by default", async () => {
      const sim = createWorktreeSimulator();
      await expect(sim.pushBranch("/repo", "agent/fix-bug")).resolves.toBeUndefined();
    });

    it("throws when failOnPush is true", async () => {
      const sim = createWorktreeSimulator({ failOnPush: true, pushFailCount: 10 });
      await expect(sim.pushBranch("/repo", "agent/fix-bug")).rejects.toThrow("push failed");
    });

    it("fails for pushFailCount times then succeeds", async () => {
      const sim = createWorktreeSimulator({ failOnPush: true, pushFailCount: 2 });

      // First two attempts fail
      await expect(sim.pushBranch("/repo", "branch")).rejects.toThrow();
      await expect(sim.pushBranch("/repo", "branch")).rejects.toThrow();
      // Third succeeds
      await expect(sim.pushBranch("/repo", "branch")).resolves.toBeUndefined();
    });
  });

  describe("failOnCreate", () => {
    it("throws when creating worktree", async () => {
      const sim = createWorktreeSimulator({ failOnCreate: true });
      await expect(sim.createWorktree("/repo", "task")).rejects.toThrow("git worktree add failed");
    });
  });

  describe("call recording", () => {
    it("records all operations in order", async () => {
      const sim = createWorktreeSimulator({ state: "dirty" });
      await sim.createWorktree("/repo", "task");
      await sim.hasChanges("/repo/wt");
      await sim.commitChanges("/repo/wt");
      await sim.pushBranch("/repo", "branch");
      await sim.removeWorktree("/repo", "/repo/wt");

      const calls = sim.calls();
      expect(calls.map((c) => c.operation)).toEqual([
        "createWorktree",
        "hasChanges",
        "commitChanges",
        "pushBranch",
        "removeWorktree",
      ]);
    });

    it("reset clears call history", async () => {
      const sim = createWorktreeSimulator();
      await sim.createWorktree("/repo", "task");
      expect(sim.calls()).toHaveLength(1);

      sim.reset();
      expect(sim.calls()).toHaveLength(0);
    });
  });

  describe("worktreeInfo", () => {
    it("returns consistent info matching createWorktree result", async () => {
      const sim = createWorktreeSimulator({ branchName: "agent/my-task" });
      const created = await sim.createWorktree("/repo", "task");
      const info = sim.worktreeInfo();
      expect(created.path).toBe(info.path);
      expect(created.branchName).toBe(info.branchName);
    });
  });
});

describe("assertOperationCalled", () => {
  it("does not throw when operation was called", async () => {
    const sim = createWorktreeSimulator();
    await sim.createWorktree("/repo", "task");
    expect(() => assertOperationCalled(sim, "createWorktree")).not.toThrow();
  });

  it("throws when operation was not called", () => {
    const sim = createWorktreeSimulator();
    expect(() => assertOperationCalled(sim, "pushBranch")).toThrow(
      'Expected worktree operation "pushBranch" to have been called'
    );
  });
});

describe("assertOperationNotCalled", () => {
  it("does not throw when operation was not called", () => {
    const sim = createWorktreeSimulator();
    expect(() => assertOperationNotCalled(sim, "removeWorktree")).not.toThrow();
  });

  it("throws when operation was called", async () => {
    const sim = createWorktreeSimulator();
    await sim.removeWorktree("/repo", "/repo/wt");
    expect(() => assertOperationNotCalled(sim, "removeWorktree")).toThrow(
      'Expected worktree operation "removeWorktree" NOT to have been called'
    );
  });
});
