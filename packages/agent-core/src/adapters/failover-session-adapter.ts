/**
 * FailoverSessionAdapter — priority-cascade dispatch across full-pipeline
 * `AgentSessionAdapter`s (ADR-017's `auto` mode).
 *
 * Runs the cascade directly (skip unavailable/cooling-down adapters, mark
 * rate-limited results, throw `AllAdaptersUnavailableError` when all are
 * exhausted) over the SessionConfig/SessionResult seam, so every backend —
 * including gemini and opencode — runs through the same gate/publish pipeline
 * as `claude` (#2973). The CLI resolves this adapter via `resolveSessionAdapter`
 * for `--adapter auto` instead of constructing adapters itself.
 */

import type { AgentAdapter } from "../cli-adapter.js";
import type { PhaseDeps } from "../phases/index.js";
import type { SessionConfig, SessionEventCallback, SessionResult } from "../types.js";
import type { AgentSessionAdapter } from "../run-agent-session.js";
import { RateLimitDetector } from "../rate-limit-detector.js";

// ── Error ───────────────────────────────────────────────────────────

export class AllAdaptersUnavailableError extends Error {
  /** Per-adapter cooldown timestamps (ms epoch). Only includes adapters that have an active cooldown. */
  readonly cooldowns: ReadonlyMap<string, number>;

  constructor(cooldowns: ReadonlyMap<string, number>) {
    super("All agent adapters are rate-limited or unavailable");
    this.name = "AllAdaptersUnavailableError";
    this.cooldowns = cooldowns;
  }
}

/**
 * Every concrete backend adapter (Claude/Gemini/OpenCode) implements both
 * `AgentAdapter` (name/isAvailable, for cascade bookkeeping) and
 * `AgentSessionAdapter` (runSession, the full-pipeline seam).
 */
export type FailoverCapableAdapter = AgentAdapter & AgentSessionAdapter;

export class FailoverSessionAdapter implements AgentSessionAdapter {
  private readonly adapters: readonly FailoverCapableAdapter[];
  private readonly detector: RateLimitDetector;

  constructor(adapters: readonly FailoverCapableAdapter[], detector?: RateLimitDetector) {
    if (adapters.length === 0) {
      throw new Error("FailoverSessionAdapter requires at least one adapter");
    }
    this.adapters = adapters;
    this.detector = detector ?? new RateLimitDetector(adapters.map((a) => a.name));
  }

  /**
   * Run the task on the highest-priority available adapter. Priority order
   * matches the constructor's `adapters` array. An adapter is skipped when
   * it's cooling down, its CLI/SDK isn't available, or its result reports
   * `failureCategory: "rate_limited"` — the router then marks it and tries
   * the next adapter. Any other failure is returned as-is (not cascaded).
   */
  async runSession(
    config: SessionConfig,
    onEvent?: SessionEventCallback,
    deps?: PhaseDeps,
    signal?: AbortSignal
  ): Promise<SessionResult> {
    for (const adapter of this.adapters) {
      if (!this.detector.isAvailable(adapter.name)) continue;

      const cliAvailable = await adapter.isAvailable();
      if (!cliAvailable) continue;

      const result = await adapter.runSession(config, onEvent, deps, signal);

      if (result.failureCategory === "rate_limited") {
        this.detector.markRateLimited(adapter.name);
        continue;
      }

      this.detector.markSuccess(adapter.name);
      return result;
    }

    const cooldowns = new Map<string, number>();
    for (const adapter of this.adapters) {
      const state = this.detector.getState(adapter.name);
      if (state?.cooldownUntil !== null && state?.cooldownUntil !== undefined) {
        cooldowns.set(adapter.name, state.cooldownUntil);
      }
    }
    throw new AllAdaptersUnavailableError(cooldowns);
  }
}
