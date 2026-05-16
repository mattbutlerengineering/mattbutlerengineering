/**
 * FailoverRouter — priority-cascade dispatch across multiple AgentAdapter backends.
 *
 * Iterates through adapters in priority order (first = primary). When an adapter
 * is rate-limited (either pre-detected by the RateLimitDetector or signalled in
 * the AdapterResult), the router skips to the next adapter. Adapters whose CLI
 * binary is not installed are also skipped.
 *
 * Throws AllAdaptersUnavailableError when every adapter is exhausted.
 */

import type { AgentAdapter, AdapterConfig, AdapterResult } from "./cli-adapter.js";
import { RateLimitDetector } from "./rate-limit-detector.js";

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

// ── Result with adapter attribution ─────────────────────────────────

export type RoutedAdapterResult = AdapterResult & {
  /** Name of the adapter that produced this result. */
  readonly adapter: string;
};

// ── Router ──────────────────────────────────────────────────────────

export class FailoverRouter {
  private readonly adapters: readonly AgentAdapter[];
  private readonly detector: RateLimitDetector;

  constructor(adapters: readonly AgentAdapter[], detector?: RateLimitDetector) {
    if (adapters.length === 0) {
      throw new Error("FailoverRouter requires at least one adapter");
    }
    this.adapters = adapters;
    this.detector = detector ?? new RateLimitDetector(
      adapters.map((a) => a.name),
    );
  }

  /**
   * Route a task to the highest-priority available adapter.
   *
   * Priority order matches the constructor's `adapters` array (index 0 = primary).
   * Adapters are skipped when:
   *   1. The RateLimitDetector reports them as rate-limited / in cooldown.
   *   2. Their CLI binary is not installed (`isAvailable()` returns false).
   *   3. Their `run()` returns `rateLimited: true` — the adapter is marked
   *      rate-limited and the next adapter is tried.
   */
  async route(config: AdapterConfig): Promise<RoutedAdapterResult> {
    for (const adapter of this.adapters) {
      // Skip adapters in cooldown
      if (!this.detector.isAvailable(adapter.name)) continue;

      // Skip adapters whose CLI is not installed
      const cliAvailable = await adapter.isAvailable();
      if (!cliAvailable) continue;

      const result = await adapter.run(config);

      if (result.rateLimited) {
        this.detector.markRateLimited(adapter.name);
        continue; // Try next adapter
      }

      this.detector.markSuccess(adapter.name);
      return { ...result, adapter: adapter.name };
    }

    // All adapters exhausted — collect cooldown info for caller
    const cooldowns = new Map<string, number>();
    for (const adapter of this.adapters) {
      const state = this.detector.getState(adapter.name);
      if (state?.cooldownUntil !== null && state?.cooldownUntil !== undefined) {
        cooldowns.set(adapter.name, state.cooldownUntil);
      }
    }
    throw new AllAdaptersUnavailableError(cooldowns);
  }

  /** Returns adapter names that are not currently rate-limited. */
  getAvailableAdapters(): readonly string[] {
    return this.detector.getAvailableAdapters();
  }
}
