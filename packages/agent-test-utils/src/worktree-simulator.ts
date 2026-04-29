/**
 * Worktree simulation helpers for cost-free agent testing.
 *
 * Provides in-memory git operation mocks with predictable return values.
 * Three pre-built repo states: clean, dirty (uncommitted changes), conflicted.
 */

import type { WorktreeInfo } from "@mbe/agent-core";

// ── Repo state types ──────────────────────────────────────────────────

export type RepoState = "clean" | "dirty" | "conflicted";

export interface SimulatedFile {
  readonly path: string;
  readonly content: string;
  readonly status?: "modified" | "added" | "deleted" | "conflicted";
}

export interface WorktreeSimulatorOptions {
  readonly repoPath?: string;
  readonly baseBranch?: string;
  readonly branchName?: string;
  readonly state?: RepoState;
  readonly files?: readonly SimulatedFile[];
  /** Simulate a failure on createWorktree. */
  readonly failOnCreate?: boolean;
  /** Simulate a failure on pushBranch. */
  readonly failOnPush?: boolean;
  /** Number of times push should fail before succeeding (for retry testing). */
  readonly pushFailCount?: number;
}

export interface VerificationResult {
  readonly passed: boolean;
  readonly lintOk: boolean;
  readonly typecheckOk: boolean;
  readonly testsOk: boolean;
}

// ── Default repo fixtures ─────────────────────────────────────────────

export const CLEAN_REPO_FILES: readonly SimulatedFile[] = [
  { path: "src/index.ts", content: 'export const version = "1.0.0";', status: "modified" },
  { path: "src/utils.ts", content: "export function identity<T>(x: T): T { return x; }" },
  { path: "package.json", content: '{"name": "test-repo", "version": "1.0.0"}' },
];

export const DIRTY_REPO_FILES: readonly SimulatedFile[] = [
  ...CLEAN_REPO_FILES,
  { path: "src/new-feature.ts", content: "export function newFeature() {}", status: "added" },
  { path: "src/old-code.ts", content: "", status: "deleted" },
];

export const CONFLICTED_REPO_FILES: readonly SimulatedFile[] = [
  {
    path: "src/index.ts",
    content: [
      "<<<<<<< HEAD",
      'export const version = "2.0.0";',
      "=======",
      'export const version = "1.5.0";',
      ">>>>>>> feature-branch",
    ].join("\n"),
    status: "conflicted",
  },
  { path: "src/utils.ts", content: "export function identity<T>(x: T): T { return x; }" },
];

function getDefaultFiles(state: RepoState): readonly SimulatedFile[] {
  if (state === "dirty") return DIRTY_REPO_FILES;
  if (state === "conflicted") return CONFLICTED_REPO_FILES;
  return CLEAN_REPO_FILES;
}

// ── Simulator interface ───────────────────────────────────────────────

export interface WorktreeCallRecord {
  readonly operation: string;
  readonly args: readonly unknown[];
  readonly timestamp: string;
}

export interface WorktreeSimulator {
  /** Simulates `createWorktree`. Returns a WorktreeInfo or throws if failOnCreate. */
  readonly createWorktree: (repoPath: string, taskDescription: string) => Promise<WorktreeInfo>;
  /** Simulates `removeWorktree`. */
  readonly removeWorktree: (repoPath: string, worktreePath: string) => Promise<void>;
  /** Simulates `hasChanges`. Returns true for dirty/conflicted repos. */
  readonly hasChanges: (worktreePath: string) => Promise<boolean>;
  /** Simulates `commitChanges`. Returns a deterministic commit sha. */
  readonly commitChanges: (worktreePath: string, message?: string) => Promise<string>;
  /** Simulates `pushBranch`. May fail based on failOnPush / pushFailCount. */
  readonly pushBranch: (repoPath: string, branchName: string) => Promise<void>;
  /** Simulates `runVerification`. Returns passed:true for clean/dirty repos. */
  readonly runVerification: (worktreePath: string) => Promise<VerificationResult>;
  /** Returns all recorded operation calls. */
  readonly calls: () => readonly WorktreeCallRecord[];
  /** Resets call history and push failure counter. */
  readonly reset: () => void;
  /** Returns the current state of simulated files. */
  readonly files: () => readonly SimulatedFile[];
  /** Returns the WorktreeInfo for the simulated worktree. */
  readonly worktreeInfo: () => WorktreeInfo;
}

// ── Factory ───────────────────────────────────────────────────────────

export function createWorktreeSimulator(options: WorktreeSimulatorOptions = {}): WorktreeSimulator {
  const {
    repoPath = "/mock-repo",
    branchName = "agent/mock-task-abc123",
    state = "clean",
    files = getDefaultFiles(state),
    failOnCreate = false,
    failOnPush = false,
    pushFailCount = 0,
  } = options;

  const worktreePath = `${repoPath}/.agent-worktrees/${branchName.replace(/\//g, "-")}`;
  const callLog: WorktreeCallRecord[] = [];
  let pushAttempts = 0;

  function record(operation: string, ...args: unknown[]): void {
    callLog.push({
      operation,
      args: args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))),
      timestamp: new Date().toISOString(),
    });
  }

  const info: WorktreeInfo = {
    path: worktreePath,
    branchName,
    mode: "full",
  };

  return {
    async createWorktree(rp: string, taskDesc: string): Promise<WorktreeInfo> {
      record("createWorktree", rp, taskDesc);
      if (failOnCreate) {
        throw new Error("git worktree add failed: no space left on device");
      }
      return info;
    },

    async removeWorktree(rp: string, wp: string): Promise<void> {
      record("removeWorktree", rp, wp);
    },

    async hasChanges(wp: string): Promise<boolean> {
      record("hasChanges", wp);
      return state !== "clean";
    },

    async commitChanges(wp: string, message?: string): Promise<string> {
      record("commitChanges", wp, message ?? "chore: agent changes");
      return "abc1234def5678";
    },

    async pushBranch(rp: string, bn: string): Promise<void> {
      record("pushBranch", rp, bn);
      pushAttempts += 1;

      if (failOnPush && pushAttempts <= pushFailCount) {
        throw new Error(`push failed (attempt ${pushAttempts}/${pushFailCount}): connection reset`);
      }
    },

    async runVerification(wp: string): Promise<VerificationResult> {
      record("runVerification", wp);
      const hasConflicts = state === "conflicted";
      return {
        passed: !hasConflicts,
        lintOk: !hasConflicts,
        typecheckOk: !hasConflicts,
        testsOk: !hasConflicts,
      };
    },

    calls(): readonly WorktreeCallRecord[] {
      return [...callLog];
    },

    reset(): void {
      callLog.length = 0;
      pushAttempts = 0;
    },

    files(): readonly SimulatedFile[] {
      return files;
    },

    worktreeInfo(): WorktreeInfo {
      return info;
    },
  };
}

// ── Vitest-compatible mock factory ───────────────────────────────────

/**
 * Returns a plain object of vi.fn() mocks shaped like the worktree-manager module.
 * Use this when you want to `vi.mock("../worktree-manager.js", () => createWorktreeMocks())`.
 */
export function createWorktreeMocks(
  simulator: WorktreeSimulator = createWorktreeSimulator()
): Record<string, (...args: unknown[]) => unknown> {
  return {
    createWorktree: (...args: unknown[]) =>
      simulator.createWorktree(args[0] as string, args[1] as string),
    removeWorktree: (...args: unknown[]) =>
      simulator.removeWorktree(args[0] as string, args[1] as string),
    hasChanges: (...args: unknown[]) => simulator.hasChanges(args[0] as string),
    commitChanges: (...args: unknown[]) =>
      simulator.commitChanges(args[0] as string, args[1] as string | undefined),
    pushBranch: (...args: unknown[]) =>
      simulator.pushBranch(args[0] as string, args[1] as string),
    runVerification: (...args: unknown[]) => simulator.runVerification(args[0] as string),
  };
}

// ── Test assertion helpers ────────────────────────────────────────────

/**
 * Asserts that a specific worktree operation was called at least once.
 */
export function assertOperationCalled(
  simulator: WorktreeSimulator,
  operation: string
): void {
  const found = simulator.calls().some((c) => c.operation === operation);
  if (!found) {
    throw new Error(
      `Expected worktree operation "${operation}" to have been called, but it was not.\n` +
      `Actual calls: ${simulator.calls().map((c) => c.operation).join(", ") || "(none)"}`
    );
  }
}

/**
 * Asserts that a specific worktree operation was NOT called.
 */
export function assertOperationNotCalled(
  simulator: WorktreeSimulator,
  operation: string
): void {
  const found = simulator.calls().some((c) => c.operation === operation);
  if (found) {
    throw new Error(
      `Expected worktree operation "${operation}" NOT to have been called, but it was.`
    );
  }
}
