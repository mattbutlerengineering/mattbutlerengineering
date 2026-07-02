/**
 * adapter-resolution — maps a CLI `--adapter` flag value to a concrete
 * `AgentSessionAdapter`. Centralizes the failover cascade order (ADR-017:
 * claude → gemini → opencode) in agent-core so the CLI no longer constructs
 * adapters, `RateLimitDetector`, or `FailoverRouter` itself (#2973).
 */

import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { GeminiCliAdapter } from "./adapters/gemini-adapter.js";
import { OpenCodeAdapter } from "./adapters/opencode-adapter.js";
import { FailoverSessionAdapter } from "./adapters/failover-session-adapter.js";
import type { AgentSessionAdapter } from "./run-agent-session.js";

export type AdapterType = "auto" | "claude" | "gemini" | "opencode";

/**
 * Resolve an `--adapter` flag value to the `AgentSessionAdapter` that
 * `runAgentSession()` should dispatch to.  `"auto"` cascades through all
 * three backends in ADR-017 priority order (claude → gemini → opencode),
 * skipping any that are rate-limited or unavailable.
 */
export function resolveSessionAdapter(adapterType: AdapterType): AgentSessionAdapter {
  switch (adapterType) {
    case "claude":
      return new ClaudeAdapter();
    case "gemini":
      return new GeminiCliAdapter();
    case "opencode":
      return new OpenCodeAdapter();
    case "auto":
      return new FailoverSessionAdapter([
        new ClaudeAdapter(),
        new GeminiCliAdapter(),
        new OpenCodeAdapter(),
      ]);
  }
}
