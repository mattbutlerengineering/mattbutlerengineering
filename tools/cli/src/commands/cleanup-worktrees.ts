import { Command } from "commander";
import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";
import { runGit } from "@mbe/agent-core";

async function getGitRoot(): Promise<string> {
  try {
    return await runGit(["rev-parse", "--show-toplevel"]);
  } catch {
    return process.cwd();
  }
}

function getWorktreeDirs(gitRoot: string): string[] {
  const worktreesDir = join(gitRoot, ".claude/worktrees");
  try {
    return readdirSync(worktreesDir);
  } catch {
    return [];
  }
}

async function getRemoteBranches(gitRoot: string): Promise<string[]> {
  try {
    const output = await runGit(["branch", "-r"], { cwd: gitRoot });
    return output
      .split("\n")
      .map((b) => b.replace(/^[* ] /, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export const cleanupWorktreesCommand = new Command("cleanup-worktrees")
  .description("Clean up orphaned git worktrees from .claude/worktrees/")
  .option("-d, --days <days>", "Remove worktrees older than N days", "1")
  .option("-n, --dry-run", "Show what would be removed without removing", false)
  .option("--force", "Force removal without confirmation", false)
  .action(async (options) => {
    const gitRoot = await getGitRoot();
    const worktreesDir = join(gitRoot, ".claude/worktrees");
    const daysOld = parseInt(options.days, 10);
    const now = Date.now();
    const cutoffMs = daysOld * 24 * 60 * 60 * 1000;

    const worktrees = getWorktreeDirs(gitRoot);
    const remoteBranches = await getRemoteBranches(gitRoot);

    const toRemove: string[] = [];

    for (const wt of worktrees) {
      const wtPath = join(worktreesDir, wt);
      const branchName = `worktree-${wt}`;

      try {
        const stats = statSync(wtPath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > cutoffMs) {
          const hasRemote = remoteBranches.some(
            (rb) => rb === `origin/${branchName}` || rb.endsWith(`/${branchName}`)
          );

          if (!hasRemote) {
            toRemove.push(wt);
          }
        }
      } catch {
        toRemove.push(wt);
      }
    }

    if (toRemove.length === 0) {
      console.log("No orphaned worktrees to clean up.");
      return;
    }

    console.log(`Found ${toRemove.length} orphaned worktrees to remove:`);
    toRemove.forEach((wt) => console.log(`  - ${wt}`));

    if (options.dryRun) {
      console.log("\nDry run - nothing removed.");
      return;
    }

    if (!options.force) {
      console.log("\nUse --force to remove these worktrees.");
      return;
    }

    for (const wt of toRemove) {
      const wtPath = join(worktreesDir, wt);
      const branchName = `worktree-${wt}`;

      try {
        await runGit(["worktree", "remove", "--force", "--", wtPath], { cwd: gitRoot });
        console.log(`Removed worktree: ${wt}`);
      } catch (err) {
        console.warn(`git worktree remove failed for ${wt}: ${(err as Error).message}`);
        try {
          rmSync(wtPath, { recursive: true, force: true });
          console.log(`Removed directory: ${wt}`);
        } catch (e) {
          console.error(`Failed to remove ${wt}:`, e);
        }
      }

      try {
        await runGit(["branch", "-D", "--", branchName], { cwd: gitRoot });
        console.log(`Deleted branch: ${branchName}`);
      } catch (err) {
        console.warn(`Could not delete branch ${branchName}: ${(err as Error).message}`);
      }
    }

    console.log(`\nCleaned up ${toRemove.length} worktrees.`);
  });
