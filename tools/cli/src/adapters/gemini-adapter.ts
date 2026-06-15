/**
 * GeminiCliAdapter — spawns the Gemini CLI as a subprocess in an isolated worktree.
 *
 * Used as a failover adapter when Claude is rate-limited.
 * The adapter does NOT create worktrees — the router/caller handles that.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "./cli-adapter.js";
import { scanForRateLimitPatterns } from "./rate-limit-detector.js";

const execFileAsync = promisify(execFileCb);

/** Default subprocess timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Maximum task description length passed to CLI (prevent arg overflow) */
const MAX_TASK_LENGTH = 8_000;

/**
 * Truncate a task description to a safe length for CLI arguments.
 */
function truncateTask(task: string, maxLength: number = MAX_TASK_LENGTH): string {
  if (task.length <= maxLength) return task;
  return task.slice(0, maxLength - 3) + "...";
}

/**
 * Build a short commit message from the task description.
 */
function buildCommitMessage(task: string): string {
  const maxSubject = 72;
  const prefix = "feat: ";
  const available = maxSubject - prefix.length;
  const subject = task.length > available ? task.slice(0, available - 3) + "..." : task;
  return `${prefix}${subject}`;
}

export class GeminiCliAdapter implements AgentAdapter {
  readonly name = "gemini";

  /**
   * Check whether the `gemini` CLI binary is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("which", ["gemini"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn Gemini CLI as a child process in the worktree directory.
   *
   * Uses `execFile` (not `exec`) to avoid shell injection — the task
   * description is passed as a separate argument, never interpolated
   * into a shell string.
   */
  async run(config: AdapterConfig): Promise<AdapterResult> {
    const startTime = Date.now();
    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const task = truncateTask(config.taskDescription);

    const args = ["-p", task, "--yolo"];

    const { stdout, stderr, exitedSuccessfully } = await this.spawnGemini(
      args,
      config.worktreePath,
      timeout
    );

    const combinedOutput = `${stdout}\n${stderr}`;
    const rateLimited = scanForRateLimitPatterns(combinedOutput);

    // Check for changes in the worktree
    const hasChanges = await this.checkForChanges(config.worktreePath);

    // If changes exist, stage and commit them
    if (hasChanges) {
      await this.commitChanges(config.worktreePath, config.taskDescription);
    }

    const durationMs = Date.now() - startTime;

    return {
      success: exitedSuccessfully,
      hasChanges,
      durationMs,
      rateLimited,
      ...(exitedSuccessfully ? {} : { error: stderr || "Gemini CLI exited with non-zero status" }),
    };
  }

  /**
   * Spawn the gemini binary and capture output.
   * Returns a structured result regardless of exit code.
   */
  private async spawnGemini(
    args: readonly string[],
    cwd: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitedSuccessfully: boolean }> {
    try {
      const result = await execFileAsync("gemini", [...args], {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      return { stdout: result.stdout, stderr: result.stderr, exitedSuccessfully: true };
    } catch (err: unknown) {
      // execFile rejects on non-zero exit or timeout
      const execError = err as {
        stdout?: string;
        stderr?: string;
        code?: string | number;
        killed?: boolean;
      };
      return {
        stdout: execError.stdout ?? "",
        stderr: execError.stderr ?? "",
        exitedSuccessfully: false,
      };
    }
  }

  /**
   * Check if the worktree has uncommitted changes via `git status --porcelain`.
   */
  private async checkForChanges(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Stage all changes and commit with a descriptive message.
   */
  private async commitChanges(worktreePath: string, task: string): Promise<void> {
    const gitOpts = { cwd: worktreePath };
    await execFileAsync("git", ["-C", worktreePath, "add", "-A"], gitOpts);
    await execFileAsync(
      "git",
      ["-C", worktreePath, "commit", "-m", buildCommitMessage(task)],
      gitOpts
    );
  }
}
