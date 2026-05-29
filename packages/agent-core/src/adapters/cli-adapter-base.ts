/**
 * CliAdapterBase — shared lifecycle and utility methods for CLI-based agent adapters.
 *
 * Concrete subclasses must provide:
 *   - `name`        — unique adapter identifier
 *   - `cliBinary`   — the CLI binary name used with `which` and `execFile`
 *   - `buildArgs`   — construct the CLI argument list for a given config
 *   - `parseOutput` — extract hasChanges / summary from stdout+stderr
 *
 * The base class owns: isAvailable, run (full lifecycle), truncateTask,
 * detectRateLimiting, buildCommitMessage, checkForChanges, commitChanges, spawnCli.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "../cli-adapter.js";
import { scanForRateLimitPatterns } from "../rate-limit-detector.js";

const execFileAsync = promisify(execFileCb);

/** Default subprocess timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Maximum task description length passed to CLI (prevent arg overflow) */
const MAX_TASK_LENGTH = 8_000;

export abstract class CliAdapterBase implements AgentAdapter {
  /** Unique adapter name matching AgentAdapter.name. */
  abstract readonly name: string;

  /** CLI binary to invoke and to check availability with `which`. */
  abstract readonly cliBinary: string;

  /**
   * Human-readable display name used in error messages (e.g. "Gemini", "OpenCode").
   * Defaults to `name` — override in subclasses if display casing differs.
   */
  protected get displayName(): string {
    return this.name;
  }

  /**
   * Build the argument list for the CLI subprocess.
   * The task description passed here is already truncated.
   */
  protected abstract buildArgs(config: AdapterConfig): string[];

  /**
   * Extract structured information from CLI stdout/stderr.
   * Used to determine `hasChanges` when the CLI itself reports changes
   * (subclasses may override; default implementation always returns false
   * and defers to the git-status check in `run`).
   */
  protected abstract parseOutput(
    stdout: string,
    stderr: string
  ): { hasChanges: boolean; summary?: string };

  // ── Public AgentAdapter implementation ──────────────────────────

  /**
   * Check whether the CLI binary is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("which", [this.cliBinary]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Execute the shared CLI adapter lifecycle:
   *   1. Truncate task description
   *   2. Spawn the CLI subprocess via buildArgs
   *   3. Detect rate limiting in combined output
   *   4. Check for git changes; commit if present
   *   5. Return normalized AdapterResult
   */
  async run(config: AdapterConfig): Promise<AdapterResult> {
    const startTime = Date.now();
    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const truncatedConfig = {
      ...config,
      taskDescription: this.truncateTask(config.taskDescription),
    };
    const args = this.buildArgs(truncatedConfig);

    const { stdout, stderr, exitedSuccessfully } = await this.spawnCli(
      args,
      config.worktreePath,
      timeout
    );

    const combinedOutput = `${stdout}\n${stderr}`;
    const rateLimited = this.detectRateLimiting(combinedOutput);

    const hasChanges = await this.checkForChanges(config.worktreePath);

    if (hasChanges) {
      await this.commitChanges(config.worktreePath, config.taskDescription);
    }

    const durationMs = Date.now() - startTime;

    return {
      success: exitedSuccessfully,
      hasChanges,
      durationMs,
      rateLimited,
      ...(exitedSuccessfully
        ? {}
        : { error: stderr || `${this.displayName} CLI exited with non-zero status` }),
    };
  }

  // ── Protected shared utilities ───────────────────────────────────

  /**
   * Truncate a task description to a safe length for CLI arguments.
   */
  protected truncateTask(task: string, maxLength: number = MAX_TASK_LENGTH): string {
    if (task.length <= maxLength) return task;
    return task.slice(0, maxLength - 3) + "...";
  }

  /**
   * Scan combined CLI output for rate-limit indicators.
   * Delegates to the shared scanForRateLimitPatterns utility in rate-limit-detector.ts.
   */
  protected detectRateLimiting(output: string): boolean {
    return scanForRateLimitPatterns(output);
  }

  /**
   * Build a short conventional commit message from the task description.
   */
  protected buildCommitMessage(task: string): string {
    const maxSubject = 72;
    const prefix = "feat: ";
    const available = maxSubject - prefix.length;
    const subject = task.length > available ? task.slice(0, available - 3) + "..." : task;
    return `${prefix}${subject}`;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Spawn the CLI binary and capture stdout/stderr.
   * Returns a structured result regardless of exit code.
   */
  private async spawnCli(
    args: readonly string[],
    cwd: string,
    timeout: number
  ): Promise<{ stdout: string; stderr: string; exitedSuccessfully: boolean }> {
    try {
      const result = await execFileAsync(this.cliBinary, [...args], {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10 MB
      });
      return { stdout: result.stdout, stderr: result.stderr, exitedSuccessfully: true };
    } catch (err: unknown) {
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
      ["-C", worktreePath, "commit", "-m", this.buildCommitMessage(task)],
      gitOpts
    );
  }
}
