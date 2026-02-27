import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { WorktreeInfo } from "./types.js";

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

async function git(
  args: readonly string[],
  cwd: string
): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], { cwd });
  return stdout.trim();
}

export async function createWorktree(
  repoPath: string,
  baseBranch: string,
  taskDescription: string
): Promise<WorktreeInfo> {
  const branchName = generateBranchName(taskDescription);
  const worktreePath = join(repoPath, WORKTREE_DIR, branchName.replace(/\//g, "-"));

  await git(["worktree", "add", "-b", branchName, worktreePath, baseBranch], repoPath);

  return { path: worktreePath, branchName };
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<void> {
  if (!existsSync(worktreePath)) {
    return;
  }
  await git(["worktree", "remove", worktreePath, "--force"], repoPath);
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
