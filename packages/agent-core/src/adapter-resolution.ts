/**
 * adapter-resolution — maps a CLI `--adapter` flag value to a concrete
 * `AgentSessionAdapter`. Centralizes the failover cascade order (ADR-017:
 * claude → gemini → opencode) in agent-core so the CLI no longer constructs
 * adapters, the `RateLimitDetector`, or the failover cascade itself (#2973).
 */

import { ClaudeAdapter } from "./adapters/claude-adapter.js";
import { ClaudeCliAdapter } from "./adapters/claude-cli-adapter.js";
import { GeminiCliAdapter } from "./adapters/gemini-adapter.js";
import { GrokCliAdapter } from "./adapters/grok-adapter.js";
import { OpenCodeAdapter } from "./adapters/opencode-adapter.js";
import { FailoverSessionAdapter } from "./adapters/failover-session-adapter.js";
import type { AgentSessionAdapter } from "./run-agent-session.js";

export type AdapterType = "auto" | "claude" | "claude-cli" | "gemini" | "opencode" | "grok";

/**
 * Resolve an `--adapter` flag value to the `AgentSessionAdapter` that
 * `runAgentSession()` should dispatch to.  `"auto"` cascades through the
 * three backends ADR-017 defines, in priority order (claude → gemini →
 * opencode), skipping any that are rate-limited or unavailable.
 *
 * `"claude-cli"` (#3585, Option A) and `"grok"` are deliberately
 * explicit-selection-only — neither is part of the `auto` cascade.
 * Inserting one would change what `auto` resolves to wherever that CLI
 * binary is on PATH, silently reordering an ADR-017-defined cascade that
 * already works. See claude-cli-adapter.ts and grok-adapter.ts.
 */
export function resolveSessionAdapter(adapterType: AdapterType): AgentSessionAdapter {
  switch (adapterType) {
    case "claude":
      return new ClaudeAdapter();
    case "claude-cli":
      return new ClaudeCliAdapter();
    case "gemini":
      return new GeminiCliAdapter();
    case "opencode":
      return new OpenCodeAdapter();
    case "grok":
      return new GrokCliAdapter();
    case "auto":
      return new FailoverSessionAdapter([
        new ClaudeAdapter(),
        new GeminiCliAdapter(),
        new OpenCodeAdapter(),
      ]);
  }
}
