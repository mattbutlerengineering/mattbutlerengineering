import { Command } from "commander";
import { execSync } from "child_process";
import { readdirSync, rmSync, statSync } from "fs";
import { join } from "path";

function getGitRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  } catch {
    return process.cwd();
  }
}

function getWorktreeDirs(): string[] {
  const gitRoot = getGitRoot();
  const worktreesDir = join(gitRoot, ".claude/worktrees");
  try {
    return readdirSync(worktreesDir);
  } catch {
    return [];
  }
}

function getRemoteBranches(): string[] {
  const gitRoot = getGitRoot();
  try {
    const output = execSync("git branch -r", { encoding: "utf8", cwd: gitRoot });
    return output.split("\n").map((b) => b.replace(/^[* ] /, "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export const cleanupWorktreesCommand = new Command()
  .name("cleanup-worktrees")
  .description("Clean up orphaned git worktrees from .claude/worktrees/")
  .option("-d, --days <days>", "Remove worktrees older than N days", "1")
  .option("-n, --dry-run", "Show what would be removed without removing", false)
  .option("--force", "Force removal without confirmation", false)
  .action((options) => {
    const gitRoot = getGitRoot();
    const worktreesDir = join(gitRoot, ".claude/worktrees");
    const daysOld = parseInt(options.days, 10);
    const now = Date.now();
    const cutoffMs = daysOld * 24 * 60 * 60 * 1000;

    const worktrees = getWorktreeDirs();
    const remoteBranches = getRemoteBranches();

    const toRemove: string[] = [];

    for (const wt of worktrees) {
      const wtPath = join(worktreesDir, wt);
      const branchName = `worktree-${wt}`;

      try {
        const stats = statSync(wtPath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > cutoffMs) {
          const hasRemote = remoteBranches.some((rb) =>
            rb === `origin/${branchName}` || rb.endsWith(`/${branchName}`)
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
        execSync(`git worktree remove "${wtPath}" --force`, { stdio: "ignore", cwd: gitRoot });
        console.log(`Removed worktree: ${wt}`);
      } catch {
        try {
          rmSync(wtPath, { recursive: true, force: true });
          console.log(`Removed directory: ${wt}`);
        } catch (e) {
          console.error(`Failed to remove ${wt}:`, e);
        }
      }

      try {
        execSync(`git branch -D "${branchName}"`, { stdio: "ignore", cwd: gitRoot });
        console.log(`Deleted branch: ${branchName}`);
      } catch {
        // Branch may not exist
      }
    }

    console.log(`\nCleaned up ${toRemove.length} worktrees.`);
  });
