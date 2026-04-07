import { Command } from "commander";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createWorktree, removeWorktree } from "@mbe/agent-core";
import { execSync } from "node:child_process";

// ── Helpers ───────────────────────────────────────────────────────────────

function findMonorepoRoot(startDir: string): string {
  let dir = startDir;
  const maxDepth = 10;
  for (let i = 0; i < maxDepth; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return startDir;
}

interface WaveResult {
    task: string;
    branchName: string;
    worktreePath: string;
    success: boolean;
    error?: string;
}

// ── Command ───────────────────────────────────────────────────────────────

export const waveCommand = new Command("wave")
  .description("Execute multiple tasks in parallel using git worktrees")
  .argument("<tasks...>", "List of tasks to execute")
  .option("--max-parallel <number>", "Maximum parallel sub-agents", parseInt, 3)
  .option("--base-branch <branch>", "Base branch to branch from", "main")
  .action(async (tasks: string[], options) => {
    const root = findMonorepoRoot(process.cwd());
    console.log(`🚀 Starting Wave with ${tasks.length} tasks (max parallel: ${options.maxParallel})...`);

    const results: WaveResult[] = [];
    const queue = [...tasks];
    const active = new Set<Promise<void>>();

    const runTask = async (task: string) => {
        let worktree;
        try {
            console.log(`\n🌊 Spawning worktree for task: "${task}"`);
            worktree = await createWorktree(root, options.baseBranch, task);
            
            console.log(`   Branch: ${worktree.branchName}`);
            console.log(`   Path:   ${worktree.path}`);

            // Run agent in the worktree
            const agentProcess = spawn("mbe", ["agent", "run", task, "--no-pr"], {
                cwd: worktree.path,
                stdio: "inherit",
            });

            const success = await new Promise<boolean>((resolve) => {
                agentProcess.on("close", (code) => resolve(code === 0));
            });

            results.push({
                task,
                branchName: worktree.branchName,
                worktreePath: worktree.path,
                success,
            });

            if (success) {
                console.log(`✅ Task succeeded: "${task}"`);
            } else {
                console.log(`❌ Task failed:    "${task}"`);
            }

        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error(`💥 Error running task "${task}":`, msg);
            results.push({
                task,
                branchName: worktree?.branchName || "unknown",
                worktreePath: worktree?.path || "unknown",
                success: false,
                error: msg,
            });
        }
    };

    while (queue.length > 0 || active.size > 0) {
        while (queue.length > 0 && active.size < options.maxParallel) {
            const task = queue.shift()!;
            const promise = runTask(task).then(() => {
                active.delete(promise);
            });
            active.add(promise);
        }
        if (active.size > 0) {
            await Promise.race(active);
        }
    }

    console.log("\n🏁 Wave execution complete. Processing results...");

    // Final sequential merge
    const successful = results.filter(r => r.success);
    if (successful.length > 0) {
        console.log(`\nMerging ${successful.length} successful branches into current branch...`);
        for (const res of successful) {
            try {
                console.log(`   Merging ${res.branchName}...`);
                execSync(`git merge ${res.branchName}`, { cwd: root, stdio: "inherit" });
            } catch {
                console.error(`   ❌ Failed to merge ${res.branchName}. There might be conflicts.`);
            }
        }
    }

    // Cleanup worktrees
    console.log("\n🧹 Cleaning up worktrees...");
    for (const res of results) {
        if (res.worktreePath !== "unknown") {
            await removeWorktree(root, res.worktreePath).catch(() => {});
        }
    }

    console.log("\n✨ Done.");
    
    const failed = results.filter(r => !r.success);
    if (failed.length > 0) {
        console.log(`\n⚠️  ${failed.length} tasks failed:`);
        failed.forEach(f => console.log(`   - "${f.task}" (${f.error || "Agent failed"})`));
        process.exit(1);
    }
  });
