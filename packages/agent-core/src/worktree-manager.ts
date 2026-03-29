import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { WorktreeInfo, WorktreeMode } from "./types.js";

const execFileAsync = promisify(execFile);

const WORKTREE_DIR = ".agent-worktrees";

function generateBranchName(taskDescription: string): string {
  const slug = taskDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  return `agent/${slug}-${suffix}`;
}

async function git(args: readonly string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd });
  return stdout.trim();
}

/**
 * Create a full git worktree for the given task. This is the default mode and
 * suits tasks that touch many files. The worktree is placed under
 * `.agent-worktrees/` inside the repo.
 */
async function createFullWorktree(
  repoPath: string,
  baseBranch: string,
  branchName: string
): Promise<string> {
  const worktreePath = join(repoPath, WORKTREE_DIR, branchName.replace(/\//g, "-"));
  await git(["worktree", "add", "-b", branchName, worktreePath, baseBranch], repoPath);
  return worktreePath;
}

/**
 * Create a lightweight clone for the given task. A shallow clone is faster for
 * small, isolated changes (1-2 files). The clone is placed under
 * `.agent-worktrees/` inside the repo and a fresh branch is checked out.
 */
async function createLightweightWorktree(
  repoPath: string,
  baseBranch: string,
  branchName: string
): Promise<string> {
  const clonePath = join(repoPath, WORKTREE_DIR, branchName.replace(/\//g, "-"));
  // Shallow clone from the local repo; --depth 1 keeps it fast and minimal.
  await execFileAsync("git", ["clone", "--depth", "1", "--branch", baseBranch, repoPath, clonePath]);
  // Create and switch to the task branch inside the clone.
  await git(["checkout", "-b", branchName], clonePath);
  return clonePath;
}

export interface CreateWorktreeOptions {
  /**
   * 'full'        – git worktree add (default; suited for multi-file changes)
   * 'lightweight' – shallow clone (faster; suited for 1-2 file changes)
   */
  readonly mode?: WorktreeMode;
}

export async function createWorktree(
  repoPath: string,
  baseBranch: string,
  taskDescription: string,
  options: CreateWorktreeOptions = {}
): Promise<WorktreeInfo> {
  const mode = options.mode ?? "full";
  const branchName = generateBranchName(taskDescription);

  const worktreePath =
    mode === "lightweight"
      ? await createLightweightWorktree(repoPath, baseBranch, branchName)
      : await createFullWorktree(repoPath, baseBranch, branchName);

  return { path: worktreePath, branchName, mode };
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string,
  mode: WorktreeMode = "full"
): Promise<void> {
  if (!existsSync(worktreePath)) {
    return;
  }

  if (mode === "lightweight") {
    // Lightweight clones are standalone directories — just remove them.
    await rm(worktreePath, { recursive: true, force: true });
  } else {
    await git(["worktree", "remove", worktreePath, "--force"], repoPath);
  }
}

export async function cleanupWorktrees(repoPath: string): Promise<void> {
  const worktreesDir = join(repoPath, WORKTREE_DIR);
  if (!existsSync(worktreesDir)) {
    return;
  }
  await git(["worktree", "prune"], repoPath);
  await rm(worktreesDir, { recursive: true, force: true });
}

export async function commitChanges(
  worktreePath: string,
  message: string
): Promise<string> {
  await git(["add", "-A"], worktreePath);

  const status = await git(["status", "--porcelain"], worktreePath);
  if (!status) {
    return "";
  }

  await git(["commit", "-m", message], worktreePath);
  const sha = await git(["rev-parse", "HEAD"], worktreePath);
  return sha;
}

export async function pushBranch(
  worktreePath: string,
  branchName: string
): Promise<void> {
  await git(["push", "-u", "origin", branchName], worktreePath);
}

export async function hasChanges(worktreePath: string): Promise<boolean> {
  const status = await git(["status", "--porcelain"], worktreePath);
  return status.length > 0;
}
