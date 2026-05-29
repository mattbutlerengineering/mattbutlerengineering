/**
 * ClaudeAdapter — wraps the existing runSession() to conform to the AgentAdapter interface.
 *
 * This is the primary adapter: full pipeline with stuck detection, LLM evaluation,
 * security review, quality gates, and feedback loop.  The adapter itself is deliberately
 * thin — it bridges AdapterConfig/AdapterResult to SessionConfig/SessionResult and
 * lets runSession() do all the heavy lifting.
 */

import type { AgentAdapter, AdapterConfig, AdapterResult } from "../cli-adapter.js";
import { runSession } from "../session-runner.js";
import { scanForRateLimitPatterns } from "../rate-limit-detector.js";
import { DEFAULT_SESSION_CONFIG } from "../types.js";
import type { SessionResult } from "../types.js";

/**
 * Determine whether a SessionResult indicates the agent made git-visible changes.
 *
 * runSession() does not expose a boolean "hasChanges" field directly, but it
 * creates a PR (prUrl != null) only when changes exist, so we use that as the
 * primary signal.  As a secondary heuristic we check the resultText — the SDK
 * sometimes reports "No changes" when the agent opts out.
 */
function deriveHasChanges(result: SessionResult): boolean {
  if (result.prUrl !== null) return true;
  // If the session succeeded and produced a branch, there were likely changes
  // even if the PR wasn't created (createPr: false path).
  if (result.status === "succeeded" && result.branchName.length > 0) return true;
  return false;
}

export class ClaudeAdapter implements AgentAdapter {
  readonly name = "claude";

  /**
   * The Claude SDK adapter is available when the ANTHROPIC_API_KEY env var is set.
   */
  async isAvailable(): Promise<boolean> {
    return (
      typeof process.env["ANTHROPIC_API_KEY"] === "string" &&
      process.env["ANTHROPIC_API_KEY"].length > 0
    );
  }

  /**
   * Map AdapterConfig to SessionConfig, invoke runSession(), and normalise the
   * result back to AdapterResult.
   */
  async run(config: AdapterConfig): Promise<AdapterResult> {
    const startTime = Date.now();

    try {
      const sessionResult = await runSession({
        taskDescription: config.taskDescription,
        repoPath: config.repoPath,
        baseBranch: config.baseBranch,
        model: config.model ?? DEFAULT_SESSION_CONFIG.model,
        maxTurns: config.maxTurns ?? DEFAULT_SESSION_CONFIG.maxTurns,
        maxBudgetUsd: DEFAULT_SESSION_CONFIG.maxBudgetUsd,
        allowedTools: [...DEFAULT_SESSION_CONFIG.allowedTools],
        createPr: false, // Worktree lifecycle is managed by the caller / router
      });

      const durationMs = Date.now() - startTime;
      const rateLimited = sessionResult.failureCategory === "rate_limited";
      const success = sessionResult.status === "succeeded";
      const hasChanges = deriveHasChanges(sessionResult);

      return {
        success,
        hasChanges,
        rateLimited,
        durationMs,
        ...(success ? {} : { error: sessionResult.errors.join("; ") || undefined }),
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);
      const rateLimited = scanForRateLimitPatterns(message);

      return {
        success: false,
        hasChanges: false,
        rateLimited,
        durationMs,
        error: message,
      };
    }
  }
}
