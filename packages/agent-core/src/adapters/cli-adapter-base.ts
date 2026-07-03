/**
 * CliAdapterBase — shared lifecycle and utility methods for CLI-based agent adapters.
 *
 * Concrete subclasses must provide:
 *   - `name`        — unique adapter identifier
 *   - `cliBinary`   — the CLI binary name used with `which` and `execFile`
 *   - `buildArgs`   — construct the CLI argument list for a given config
 *
 * The base class owns: isAvailable, run (full lifecycle), truncateTask,
 * detectRateLimiting, buildCommitMessage, checkForChanges, commitChanges, spawnCli.
 */

import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "../cli-adapter.js";
import { scanForRateLimitPatterns } from "../rate-limit-detector.js";
import { createDefaultPhaseDeps } from "../phases/default-deps.js";
import type { PhaseDeps } from "../phases/index.js";
import type { SessionConfig, SessionEventCallback, SessionResult } from "../types.js";
import { runCliAdapterSession } from "./cli-adapter-session-runner.js";
import type { CliUsage } from "./cli-usage-parser.js";

const execFileAsync = promisify(execFileCb);

/** Default subprocess timeout: 10 minutes */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Bound every `git` subprocess call so a hang fails fast. */
const GIT_TIMEOUT_MS = 60_000;

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
   * Parse cost/token usage from the CLI's stdout, when the CLI backend
   * exposes machine-readable usage data. Base implementation reports none;
   * concrete adapters override this once they know their CLI's usage format
   * (see cli-usage-parser.ts).
   */
  protected parseUsage(_stdout: string): CliUsage {
    return {};
  }

  /**
   * Recover a human-readable error message from the CLI's stdout when the
   * run failed, for backends that emit structured JSON there instead of (or
   * in addition to) stderr. Base implementation reports none — `run()`
   * falls through to the raw stderr text (see ADR-017 failure-PR-body
   * contract, #3019).
   */
  protected parseErrorFromStdout(_stdout: string): string | undefined {
    return undefined;
  }

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
    const usage = this.parseUsage(stdout);

    return {
      success: exitedSuccessfully,
      hasChanges,
      durationMs,
      rateLimited,
      ...usage,
      ...(exitedSuccessfully
        ? {}
        : {
            error:
              this.parseErrorFromStdout(stdout) ??
              (stderr || `${this.displayName} CLI exited with non-zero status`),
          }),
    };
  }

  /**
   * Run a full agent session (worktree → CLI dispatch → gates → publish)
   * through the shared `runCliAdapterSession()` pipeline — the seam
   * `runAgentSession()` calls for the "gemini"/"opencode" backends,
   * mirroring `ClaudeAdapter.runSession()` (#2973).
   */
  async runSession(
    config: SessionConfig,
    onEvent?: SessionEventCallback,
    deps: PhaseDeps = createDefaultPhaseDeps(),
    signal?: AbortSignal
  ): Promise<SessionResult> {
    return runCliAdapterSession(this, config, onEvent, deps, signal);
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
      const execError = err as { stdout?: string; stderr?: string };
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
      const { stdout } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"], {
        timeout: GIT_TIMEOUT_MS,
      });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Stage all changes and commit with a descriptive message.
   */
  private async commitChanges(worktreePath: string, task: string): Promise<void> {
    const gitOpts = { cwd: worktreePath, timeout: GIT_TIMEOUT_MS };
    await execFileAsync("git", ["-C", worktreePath, "add", "-A"], gitOpts);
    await execFileAsync(
      "git",
      ["-C", worktreePath, "commit", "-m", this.buildCommitMessage(task)],
      gitOpts
    );
  }
}
