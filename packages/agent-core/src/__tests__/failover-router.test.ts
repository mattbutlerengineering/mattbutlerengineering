import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "../cli-adapter.js";
import { RateLimitDetector } from "../rate-limit-detector.js";
import { FailoverRouter, AllAdaptersUnavailableError } from "../failover-router.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    taskDescription: "Fix the login bug",
    worktreePath: "/tmp/wt-test",
    repoPath: "/tmp/repo",
    baseBranch: "main",
    ...overrides,
  };
}

function makeResult(overrides: Partial<AdapterResult> = {}): AdapterResult {
  return {
    success: true,
    hasChanges: true,
    rateLimited: false,
    durationMs: 100,
    ...overrides,
  };
}

function makeMockAdapter(
  name: string,
  options: { available?: boolean; result?: Partial<AdapterResult> } = {},
): AgentAdapter {
  const { available = true, result = {} } = options;
  return {
    name,
    isAvailable: vi.fn<() => Promise<boolean>>().mockResolvedValue(available),
    run: vi.fn<(config: AdapterConfig) => Promise<AdapterResult>>().mockResolvedValue(makeResult(result)),
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("FailoverRouter", () => {
  let primaryAdapter: AgentAdapter;
  let secondaryAdapter: AgentAdapter;
  let tertiaryAdapter: AgentAdapter;
  let config: AdapterConfig;

  beforeEach(() => {
    primaryAdapter = makeMockAdapter("claude");
    secondaryAdapter = makeMockAdapter("gemini");
    tertiaryAdapter = makeMockAdapter("opencode");
    config = makeConfig();
  });

  it("throws if constructed with zero adapters", () => {
    expect(() => new FailoverRouter([])).toThrow("at least one adapter");
  });

  // ── 1. Primary success path ─────────────────────────────────────

  it("routes to the first available adapter on success", async () => {
    const router = new FailoverRouter([primaryAdapter, secondaryAdapter]);
    const result = await router.route(config);

    expect(result.adapter).toBe("claude");
    expect(result.success).toBe(true);
    expect(primaryAdapter.run).toHaveBeenCalledWith(config);
    expect(secondaryAdapter.run).not.toHaveBeenCalled();
  });

  // ── 2. Skip rate-limited adapter → route to second ──────────────

  it("skips rate-limited adapter and routes to the next", async () => {
    const detector = new RateLimitDetector(["claude", "gemini"]);
    detector.markRateLimited("claude");

    const router = new FailoverRouter([primaryAdapter, secondaryAdapter], detector);
    const result = await router.route(config);

    expect(result.adapter).toBe("gemini");
    expect(primaryAdapter.isAvailable).not.toHaveBeenCalled();
    expect(primaryAdapter.run).not.toHaveBeenCalled();
    expect(secondaryAdapter.run).toHaveBeenCalledWith(config);
  });

  // ── 3. Skip adapter where isAvailable() returns false ───────────

  it("skips adapter whose CLI is not installed", async () => {
    const unavailablePrimary = makeMockAdapter("claude", { available: false });
    const router = new FailoverRouter([unavailablePrimary, secondaryAdapter]);
    const result = await router.route(config);

    expect(result.adapter).toBe("gemini");
    expect(unavailablePrimary.isAvailable).toHaveBeenCalled();
    expect(unavailablePrimary.run).not.toHaveBeenCalled();
    expect(secondaryAdapter.run).toHaveBeenCalledWith(config);
  });

  // ── 4. First adapter returns rateLimited → marks and tries next ─

  it("marks adapter rate-limited when run() returns rateLimited and tries next", async () => {
    const rateLimitedPrimary = makeMockAdapter("claude", {
      result: { rateLimited: true, success: false },
    });
    const detector = new RateLimitDetector(["claude", "gemini"]);

    const router = new FailoverRouter([rateLimitedPrimary, secondaryAdapter], detector);
    const result = await router.route(config);

    expect(result.adapter).toBe("gemini");
    expect(rateLimitedPrimary.run).toHaveBeenCalledWith(config);
    // The detector should now show claude as unavailable
    expect(detector.isAvailable("claude")).toBe(false);
    expect(secondaryAdapter.run).toHaveBeenCalledWith(config);
  });

  // ── 5. All adapters rate-limited → throws AllAdaptersUnavailableError ─

  it("throws AllAdaptersUnavailableError when all adapters are rate-limited", async () => {
    const detector = new RateLimitDetector(["claude", "gemini", "opencode"]);
    detector.markRateLimited("claude");
    detector.markRateLimited("gemini");
    detector.markRateLimited("opencode");

    const router = new FailoverRouter(
      [primaryAdapter, secondaryAdapter, tertiaryAdapter],
      detector,
    );

    await expect(router.route(config)).rejects.toThrow(AllAdaptersUnavailableError);

    try {
      await router.route(config);
    } catch (err) {
      const error = err as AllAdaptersUnavailableError;
      expect(error.name).toBe("AllAdaptersUnavailableError");
      expect(error.cooldowns.size).toBe(3);
      expect(error.cooldowns.has("claude")).toBe(true);
      expect(error.cooldowns.has("gemini")).toBe(true);
      expect(error.cooldowns.has("opencode")).toBe(true);
    }
  });

  // ── 6. markSuccess is called on the detector after success ──────

  it("calls markSuccess on the detector after a successful run", async () => {
    const detector = new RateLimitDetector(["claude", "gemini"]);
    const markSuccessSpy = vi.spyOn(detector, "markSuccess");

    const router = new FailoverRouter([primaryAdapter, secondaryAdapter], detector);
    await router.route(config);

    expect(markSuccessSpy).toHaveBeenCalledWith("claude");
    expect(markSuccessSpy).toHaveBeenCalledTimes(1);
  });

  // ── 7. Returns adapter name in the result ───────────────────────

  it("includes the adapter name in the routed result", async () => {
    const router = new FailoverRouter([primaryAdapter, secondaryAdapter]);
    const result = await router.route(config);

    expect(result).toHaveProperty("adapter", "claude");
    // Also verify the original result properties are preserved
    expect(result.success).toBe(true);
    expect(result.hasChanges).toBe(true);
    expect(result.rateLimited).toBe(false);
    expect(result.durationMs).toBe(100);
  });

  // ── 8. Works with a single adapter (no failover) ───────────────

  it("works with a single adapter when it succeeds", async () => {
    const router = new FailoverRouter([primaryAdapter]);
    const result = await router.route(config);

    expect(result.adapter).toBe("claude");
    expect(result.success).toBe(true);
  });

  it("throws when the single adapter is rate-limited", async () => {
    const rateLimitedAdapter = makeMockAdapter("claude", {
      result: { rateLimited: true, success: false },
    });
    const router = new FailoverRouter([rateLimitedAdapter]);

    await expect(router.route(config)).rejects.toThrow(AllAdaptersUnavailableError);
  });

  // ── Additional edge cases ───────────────────────────────────────

  it("falls through multiple unavailable adapters to a working one", async () => {
    const unavailable1 = makeMockAdapter("claude", { available: false });
    const rateLimited2 = makeMockAdapter("gemini", {
      result: { rateLimited: true, success: false },
    });

    const router = new FailoverRouter([unavailable1, rateLimited2, tertiaryAdapter]);
    const result = await router.route(config);

    expect(result.adapter).toBe("opencode");
    expect(unavailable1.run).not.toHaveBeenCalled();
    expect(rateLimited2.run).toHaveBeenCalled();
    expect(tertiaryAdapter.run).toHaveBeenCalled();
  });

  it("propagates error field from successful adapter", async () => {
    const failedAdapter = makeMockAdapter("claude", {
      result: { success: false, error: "Something went wrong" },
    });
    const router = new FailoverRouter([failedAdapter]);
    const result = await router.route(config);

    // Non-rate-limited failure is still returned (not skipped)
    expect(result.adapter).toBe("claude");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Something went wrong");
  });

  it("does not skip adapter that fails without rate limiting", async () => {
    const failedAdapter = makeMockAdapter("claude", {
      result: { success: false, rateLimited: false, error: "Internal error" },
    });
    const router = new FailoverRouter([failedAdapter, secondaryAdapter]);
    const result = await router.route(config);

    // Should return the failed result, not failover (only rate-limiting triggers failover)
    expect(result.adapter).toBe("claude");
    expect(result.success).toBe(false);
    expect(secondaryAdapter.run).not.toHaveBeenCalled();
  });

  // ── getAvailableAdapters ────────────────────────────────────────

  it("getAvailableAdapters delegates to detector", () => {
    const detector = new RateLimitDetector(["claude", "gemini", "opencode"]);
    detector.markRateLimited("gemini");

    const router = new FailoverRouter(
      [primaryAdapter, secondaryAdapter, tertiaryAdapter],
      detector,
    );

    const available = router.getAvailableAdapters();
    expect(available).toEqual(["claude", "opencode"]);
  });

  it("getAvailableAdapters returns all when none are rate-limited", () => {
    const router = new FailoverRouter([primaryAdapter, secondaryAdapter, tertiaryAdapter]);
    const available = router.getAvailableAdapters();
    expect(available).toEqual(["claude", "gemini", "opencode"]);
  });

  // ── AllAdaptersUnavailableError ─────────────────────────────────

  it("AllAdaptersUnavailableError has correct name and message", () => {
    const cooldowns = new Map([["claude", Date.now() + 60_000]]);
    const error = new AllAdaptersUnavailableError(cooldowns);

    expect(error.name).toBe("AllAdaptersUnavailableError");
    expect(error.message).toBe("All agent adapters are rate-limited or unavailable");
    expect(error.cooldowns).toBe(cooldowns);
    expect(error instanceof Error).toBe(true);
  });

  it("includes cooldowns only for adapters with active cooldown timestamps", async () => {
    // claude: rate-limited (has cooldown)
    // gemini: not installed (no cooldown)
    // opencode: rate-limited (has cooldown)
    const detector = new RateLimitDetector(["claude", "gemini", "opencode"]);
    detector.markRateLimited("claude");
    detector.markRateLimited("opencode");
    // gemini is "available" per detector but not installed
    const unavailableGemini = makeMockAdapter("gemini", { available: false });

    const router = new FailoverRouter(
      [primaryAdapter, unavailableGemini, tertiaryAdapter],
      detector,
    );

    try {
      await router.route(config);
    } catch (err) {
      const error = err as AllAdaptersUnavailableError;
      // Only claude and opencode have cooldown timestamps
      expect(error.cooldowns.size).toBe(2);
      expect(error.cooldowns.has("claude")).toBe(true);
      expect(error.cooldowns.has("opencode")).toBe(true);
      expect(error.cooldowns.has("gemini")).toBe(false);
    }
  });
});
