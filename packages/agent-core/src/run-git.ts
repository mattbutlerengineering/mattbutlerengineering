import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Bound every `git` subprocess call so a hang (stuck lock, network stall on
 * clone/push) fails fast instead of blocking the caller indefinitely.
 */
export const DEFAULT_GIT_TIMEOUT_MS = 60_000;

export interface RunGitOptions {
  /** Working directory for the git invocation. */
  readonly cwd?: string;
  /** Timeout in milliseconds. Defaults to `DEFAULT_GIT_TIMEOUT_MS`. */
  readonly timeoutMs?: number;
}

interface ExecFileFailure {
  readonly message?: string;
  readonly code?: number;
  readonly stderr?: string;
  readonly killed?: boolean;
}

/** Thrown when a `git` subprocess exits non-zero, times out, or fails to spawn. */
export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode?: number;
  readonly stderr?: string;

  constructor(args: readonly string[], cause: unknown) {
    const failure = cause as ExecFileFailure;
    const reason = failure?.killed ? "timed out" : (failure?.message ?? String(cause));
    super(`git ${args.join(" ")} failed: ${reason}`);
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = typeof failure?.code === "number" ? failure.code : undefined;
    this.stderr = failure?.stderr;
  }
}

/**
 * Run `git` with an arg array (never a shell-interpolated string), a bounded
 * timeout, and a typed error on failure. Returns trimmed stdout on success.
 *
 * This is the single shared entry point for shelling out to git — callers
 * must never build a `git ...` shell string themselves (argument/branch
 * names can contain shell metacharacters, which is an injection risk).
 */
export async function runGit(
  args: readonly string[],
  options: RunGitOptions = {}
): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [...args], {
      cwd: options.cwd,
      timeout: options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS,
    });
    return stdout.trim();
  } catch (cause) {
    throw new GitCommandError(args, cause);
  }
}
