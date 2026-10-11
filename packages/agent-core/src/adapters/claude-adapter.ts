/**
 * ClaudeAdapter — wraps the existing runSession() to conform to the AgentAdapter interface.
 *
 * This is the primary adapter: full pipeline with stuck detection, LLM evaluation,
 * security review, quality gates, and feedback loop.  The adapter itself is deliberately
 * thin — `runSession()` forwards to the shared session pipeline and does all the heavy lifting.
 */

import type { AgentAdapter } from "../cli-adapter.js";
import { runSession as runSessionPipeline } from "../session-runner.js";
import type { SessionConfig, SessionEventCallback, SessionResult } from "../types.js";
import type { PhaseDeps } from "../phases/index.js";

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
   * Runs a full agent session (worktree → gates → publish → spend) via the
   * existing runSession() pipeline, forwarding the SessionConfig unchanged.
   * This is the seam `runAgentSession()` calls for the "claude" backend (#2964).
   */
  async runSession(
    config: SessionConfig,
    onEvent?: SessionEventCallback,
    deps?: PhaseDeps,
    signal?: AbortSignal
  ): Promise<SessionResult> {
    return runSessionPipeline(config, onEvent, deps, signal);
  }
}
