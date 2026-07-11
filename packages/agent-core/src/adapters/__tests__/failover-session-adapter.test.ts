import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentAdapter } from "../../cli-adapter.js";
import type { AgentSessionAdapter } from "../../run-agent-session.js";
import type { SessionConfig, SessionResult } from "../../types.js";
import { RateLimitDetector } from "../../rate-limit-detector.js";
import { AllAdaptersUnavailableError, FailoverSessionAdapter } from "../failover-session-adapter.js";

// ── Helpers ─────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    taskDescription: "Fix the login bug",
    repoPath: "/repo",
    baseBranch: "main",
    model: "claude-sonnet-4-6",
    maxTurns: 50,
    maxBudgetUsd: 1.0,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
    createPr: true,
    ...overrides,
  };
}

function makeResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: "",
    status: "succeeded",
    branchName: "agent/fix",
    prUrl: null,
    costUsd: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 100,
    numTurns: 0,
    resultText: "",
    errors: [],
    ...overrides,
  };
}

function makeMockAdapter(
  name: string,
  options: { available?: boolean; result?: Partial<SessionResult> } = {}
): AgentAdapter & AgentSessionAdapter {
  const { available = true, result = {} } = options;
  return {
    name,
    isAvailable: vi.fn<() => Promise<boolean>>().mockResolvedValue(available),
    run: vi.fn(),
    runSession: vi.fn().mockResolvedValue(makeResult(result)),
  };
}

describe("FailoverSessionAdapter", () => {
  let claude: ReturnType<typeof makeMockAdapter>;
  let gemini: ReturnType<typeof makeMockAdapter>;
  let opencode: ReturnType<typeof makeMockAdapter>;
  let config: SessionConfig;

  beforeEach(() => {
    claude = makeMockAdapter("claude");
    gemini = makeMockAdapter("gemini");
    opencode = makeMockAdapter("opencode");
    config = makeConfig();
  });

  it("throws if constructed with zero adapters", () => {
    expect(() => new FailoverSessionAdapter([])).toThrow("at least one adapter");
  });

  it("routes to the first available adapter on success", async () => {
    const router = new FailoverSessionAdapter([claude, gemini]);
    const result = await router.runSession(config);

    expect(result.status).toBe("succeeded");
    expect(claude.runSession).toHaveBeenCalledWith(config, undefined, undefined, undefined);
    expect(gemini.runSession).not.toHaveBeenCalled();
  });

  it("forwards onEvent, deps, and signal to the resolved adapter", async () => {
    const onEvent = vi.fn();
    const controller = new AbortController();
    const router = new FailoverSessionAdapter([claude]);

    await router.runSession(config, onEvent, undefined, controller.signal);

    expect(claude.runSession).toHaveBeenCalledWith(config, onEvent, undefined, controller.signal);
  });

  it("skips a rate-limited adapter and cascades to the next", async () => {
    const detector = new RateLimitDetector(["claude", "gemini"]);
    detector.markRateLimited("claude");

    const router = new FailoverSessionAdapter([claude, gemini], detector);
    const result = await router.runSession(config);

    expect(claude.runSession).not.toHaveBeenCalled();
    expect(gemini.runSession).toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
  });

  it("skips an adapter whose CLI is not installed", async () => {
    const unavailableGemini = makeMockAdapter("gemini", { available: false });
    const router = new FailoverSessionAdapter([unavailableGemini, opencode]);
    const result = await router.runSession(config);

    expect(unavailableGemini.runSession).not.toHaveBeenCalled();
    expect(opencode.runSession).toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
  });

  it("marks an adapter rate-limited when its result reports failureCategory 'rate_limited', then cascades", async () => {
    const rateLimitedClaude = makeMockAdapter("claude", {
      result: { status: "failed", failureCategory: "rate_limited" },
    });
    const detector = new RateLimitDetector(["claude", "gemini"]);

    const router = new FailoverSessionAdapter([rateLimitedClaude, gemini], detector);
    const result = await router.runSession(config);

    expect(rateLimitedClaude.runSession).toHaveBeenCalled();
    expect(detector.isAvailable("claude")).toBe(false);
    expect(gemini.runSession).toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
  });

  it("does not cascade a non-rate-limited failure — returns the failed result as-is", async () => {
    const failedClaude = makeMockAdapter("claude", {
      result: { status: "failed", errors: ["Tool execution failed"] },
    });
    const router = new FailoverSessionAdapter([failedClaude, gemini]);
    const result = await router.runSession(config);

    expect(result.status).toBe("failed");
    expect(gemini.runSession).not.toHaveBeenCalled();
  });

  it("throws AllAdaptersUnavailableError when every adapter is rate-limited", async () => {
    const detector = new RateLimitDetector(["claude", "gemini", "opencode"]);
    detector.markRateLimited("claude");
    detector.markRateLimited("gemini");
    detector.markRateLimited("opencode");

    const router = new FailoverSessionAdapter([claude, gemini, opencode], detector);

    await expect(router.runSession(config)).rejects.toThrow(AllAdaptersUnavailableError);
  });

  it("calls markSuccess on the detector after a successful run", async () => {
    const detector = new RateLimitDetector(["claude", "gemini"]);
    const markSuccessSpy = vi.spyOn(detector, "markSuccess");

    const router = new FailoverSessionAdapter([claude, gemini], detector);
    await router.runSession(config);

    expect(markSuccessSpy).toHaveBeenCalledWith("claude");
  });
});
