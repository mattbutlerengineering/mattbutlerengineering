/**
 * In-process worktree reaper.
 *
 * Session cleanup removes the agent worktree in the `runSession` `finally`
 * block. When that removal fails (git lock contention, transient disk error),
 * the error is recorded in the session result but the worktree would otherwise
 * persist until a human notices. This reaper schedules a bounded retry of the
 * removal so the same isolation target (ADR-005) is reclaimed without a new
 * isolation model — it is hygiene only.
 *
 * We use a lightweight in-process retry rather than the reservations-domain
 * `@mbe/jobs` scheduler: cleanup runs inside a single long-lived `runSession`
 * process, the operation is a fire-and-forget filesystem retry, and agent-core
 * already owns the `withRetry` backoff helper. Pulling in a Prisma-backed,
 * off-domain job queue would be disproportionate.
 */

import { withRetry } from "./retry.js";
import { removeWorktree as defaultRemoveWorktree } from "./worktree-manager.js";
import type { WorktreeMode } from "./types.js";

/** Minimal error-level logger seam (console.error by default). */
export interface ReaperLogger {
  readonly error: (message: string) => void;
}

export interface ScheduleWorktreeReapOptions {
  readonly repoPath: string;
  readonly worktreePath: string;
  /** Worktree isolation mode — passed through to removal. Defaults to 'full'. */
  readonly mode?: WorktreeMode;
  /** Max retry attempts after the initial failure. Default: 3. */
  readonly maxRetries?: number;
  /** Base backoff delay in ms. Default: 1000. */
  readonly baseDelayMs?: number;
  /** Removal function (injectable for testing). Defaults to worktree-manager.removeWorktree. */
  readonly removeFn?: (
    repoPath: string,
    worktreePath: string,
    mode?: WorktreeMode
  ) => Promise<void>;
  /** Error-level logger (injectable for testing). Defaults to console.error. */
  readonly logger?: ReaperLogger;
}

export interface ReapOutcome {
  readonly succeeded: boolean;
  /** Total removal attempts made (initial + retries). */
  readonly attempts: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1_000;

/**
 * Retry a failed worktree removal with exponential backoff.
 *
 * Resolves once removal succeeds. If all retries are exhausted, logs at error
 * level with the worktree path (never silent) and resolves with
 * `succeeded: false` — the caller has already recorded the original error and
 * must not treat reap exhaustion as a session failure.
 */
export async function scheduleWorktreeReap(
  options: ScheduleWorktreeReapOptions
): Promise<ReapOutcome> {
  const {
    repoPath,
    worktreePath,
    mode = "full",
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    removeFn = defaultRemoveWorktree,
    logger = { error: (message: string) => console.error(message) },
  } = options;

  try {
    const { attempts } = await withRetry(() => removeFn(repoPath, worktreePath, mode), {
      maxRetries,
      baseDelayMs,
      // Cleanup failures (lock contention, disk) are all worth retrying — the
      // operation is idempotent and the worktree must be reclaimed regardless
      // of the specific error class.
      isRetryable: () => true,
    });
    return { succeeded: true, attempts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(
      `Worktree reap exhausted after ${maxRetries} retries; worktree not removed: ${worktreePath} (${message})`
    );
    return { succeeded: false, attempts: maxRetries + 1 };
  }
}
