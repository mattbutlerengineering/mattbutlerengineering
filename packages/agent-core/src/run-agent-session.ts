/**
 * runAgentSession — single entry point for running an agent session.
 *
 * Resolves which backend adapter executes the session and runs the full
 * pipeline (worktree → gates → publish → spend) through it. Defaults to
 * `ClaudeAdapter`, which delegates to the existing `runSession()` pipeline
 * unchanged — so this is a pure seam, not a behaviour change.
 *
 * ADR-017 states CLI and API sessions run the same runSession() code path;
 * all backends (claude → gemini → opencode, cascaded in `auto` mode) now
 * route through this entry point via the resolved AgentSessionAdapter — the
 * CLI no longer constructs adapters itself (#2973, superseding #2964).
 */

import type { PhaseDeps } from "./phases/index.js";
import type { SessionConfig, SessionEventCallback, SessionResult } from "./types.js";
import { ClaudeAdapter } from "./adapters/claude-adapter.js";

/**
 * Executes a full agent session end-to-end (worktree, query, verification,
 * gates, publish, feedback) for a given `SessionConfig`. `ClaudeAdapter`
 * implements this by delegating to the existing `runSession()` pipeline.
 */
export interface AgentSessionAdapter {
  runSession(
    config: SessionConfig,
    onEvent?: SessionEventCallback,
    deps?: PhaseDeps,
    signal?: AbortSignal
  ): Promise<SessionResult>;
}

export interface RunAgentSessionOptions {
  /** Adapter that executes the session. Defaults to a new ClaudeAdapter(). Inject a fake in tests. */
  adapter?: AgentSessionAdapter;
  onEvent?: SessionEventCallback;
  deps?: PhaseDeps;
  signal?: AbortSignal;
}

export async function runAgentSession(
  config: SessionConfig,
  options: RunAgentSessionOptions = {}
): Promise<SessionResult> {
  const adapter = options.adapter ?? new ClaudeAdapter();
  return adapter.runSession(config, options.onEvent, options.deps, options.signal);
}
