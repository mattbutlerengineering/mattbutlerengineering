import type { AdapterState } from "./cli-adapter.js";

const RATE_LIMIT_PATTERNS = [
  /rate.?limit/i,
  /quota.?exceeded/i,
  /usage.?limit/i,
  /try.?again.?later/i,
  /\b429\b/,
  /throttled/i,
  /too.?many.?requests/i,
];

const DEFAULT_COOLDOWN_MS = 300_000; // 5 minutes

export function scanForRateLimitPatterns(output: string): boolean {
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(output));
}

export class RateLimitDetector {
  private readonly states: Map<string, AdapterState> = new Map();
  private readonly cooldownMs: number;

  constructor(adapterNames: readonly string[], cooldownMs = DEFAULT_COOLDOWN_MS) {
    this.cooldownMs = cooldownMs;
    for (const name of adapterNames) {
      this.states.set(name, {
        name,
        available: true,
        cooldownUntil: null,
        consecutiveFailures: 0,
      });
    }
  }

  markRateLimited(adapterName: string): void {
    const state = this.states.get(adapterName);
    if (!state) return;
    // Create new state object (immutability pattern)
    this.states.set(adapterName, {
      ...state,
      available: false,
      cooldownUntil: Date.now() + this.cooldownMs,
      consecutiveFailures: state.consecutiveFailures + 1,
    });
  }

  markSuccess(adapterName: string): void {
    const state = this.states.get(adapterName);
    if (!state) return;
    this.states.set(adapterName, {
      ...state,
      available: true,
      cooldownUntil: null,
      consecutiveFailures: 0,
    });
  }

  isAvailable(adapterName: string): boolean {
    const state = this.states.get(adapterName);
    if (!state) return false;
    if (state.available) return true;
    // Check if cooldown has expired
    if (state.cooldownUntil !== null && Date.now() >= state.cooldownUntil) {
      this.states.set(adapterName, {
        ...state,
        available: true,
        cooldownUntil: null,
      });
      return true;
    }
    return false;
  }

  getAvailableAdapters(): readonly string[] {
    return [...this.states.keys()].filter((name) => this.isAvailable(name));
  }

  getState(adapterName: string): AdapterState | undefined {
    return this.states.get(adapterName);
  }
}
