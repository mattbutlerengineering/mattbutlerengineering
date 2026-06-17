/**
 * SpawnAndCommitBase — shared base class for CLI-backed agent adapters.
 *
 * Owns the spawn lifecycle (execFile + maxBuffer + timeout), git change
 * detection (status --porcelain), auto-commit (add -A + commit), commit-
 * message building, and task truncation. Subclasses declare the binary name,
 * default error string, and how to format arguments for that binary.
 *
 * Security: uses execFile (not exec) — the task description is passed as a
 * separate argument, never interpolated into a shell string.
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

/** Maximum subject line length for git commit messages */
const MAX_COMMIT_SUBJECT = 72;

// ── Shared utilities ─────────────────────────────────────────────────

function truncateTask(task: string): string {
  if (task.length <= MAX_TASK_LENGTH) return task;
  return task.slice(0, MAX_TASK_LENGTH - 3) + "...";
}

function buildCommitMessage(task: string): string {
  const prefix = "feat: ";
  const available = MAX_COMMIT_SUBJECT - prefix.length;
  const subject = task.length > available ? task.slice(0, available - 3) + "..." : task;
  return `${prefix}${subject}`;
}

// ── Spawn result ─────────────────────────────────────────────────────

interface SpawnResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitedSuccessfully: boolean;
}

// ── Base class ───────────────────────────────────────────────────────

export abstract class SpawnAndCommitBase implements AgentAdapter {
  abstract readonly name: string;

  /** CLI binary to invoke (e.g. "gemini", "opencode"). */
  protected abstract readonly binary: string;

  /** Error message when the CLI exits non-zero with no stderr output. */
  protected abstract readonly defaultError: string;

  /**
   * Build CLI arguments from the (already-truncated) task description.
   * Subclasses return the argument list specific to their binary's CLI.
   */
  protected abstract buildArgs(task: string): string[];

  /**
   * Check whether the CLI binary is available on PATH.
   */
  async isAvailable(): Promise<boolean> {
    try {
      await execFileAsync("which", [this.binary]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Spawn the CLI binary in the worktree directory, then detect and commit
   * any changes the agent made.
   */
  async run(config: AdapterConfig): Promise<AdapterResult> {
    const startTime = Date.now();
    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const task = truncateTask(config.taskDescription);
    const args = this.buildArgs(task);

    const { stdout, stderr, exitedSuccessfully } = await this.spawn(
      args,
      config.worktreePath,
      timeout
    );

    const combinedOutput = `${stdout}\n${stderr}`;
    const rateLimited = scanForRateLimitPatterns(combinedOutput);

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
      ...(exitedSuccessfully ? {} : { error: stderr || this.defaultError }),
    };
  }

  /** Spawn the binary and capture output. Returns a result regardless of exit code. */
  private async spawn(args: readonly string[], cwd: string, timeout: number): Promise<SpawnResult> {
    try {
      const result = await execFileAsync(this.binary, [...args], {
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

  /** Check if the worktree has uncommitted changes via `git status --porcelain`. */
  private async checkForChanges(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync("git", ["-C", worktreePath, "status", "--porcelain"]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /** Stage all changes and commit with a descriptive message. */
  private async commitChanges(worktreePath: string, task: string): Promise<void> {
    await execFileAsync("git", ["-C", worktreePath, "add", "-A"]);
    await execFileAsync("git", ["-C", worktreePath, "commit", "-m", buildCommitMessage(task)]);
  }
}
