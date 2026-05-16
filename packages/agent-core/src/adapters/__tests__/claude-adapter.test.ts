import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionResult } from "../../types.js";
import type { AdapterConfig } from "../../cli-adapter.js";

// ── Mock runSession before importing the adapter ──────────────────────
const mockRunSession = vi.fn<[], Promise<SessionResult>>();

vi.mock("../../session-runner.js", () => ({
  runSession: (...args: unknown[]) => mockRunSession(...(args as [])),
}));

import { ClaudeAdapter } from "../claude-adapter.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AdapterConfig> = {}): AdapterConfig {
  return {
    taskDescription: "Fix the login bug in auth.ts",
    worktreePath: "/tmp/worktree-abc123",
    repoPath: "/tmp/repo",
    baseBranch: "main",
    ...overrides,
  };
}

function makeSessionResult(overrides: Partial<SessionResult> = {}): SessionResult {
  return {
    sessionId: "sess-001",
    status: "succeeded",
    branchName: "worktree-agent-abc123",
    prUrl: null,
    costUsd: 0.05,
    tokenUsage: { inputTokens: 1000, outputTokens: 500 },
    durationMs: 12000,
    numTurns: 5,
    resultText: "Fixed the bug",
    errors: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("ClaudeAdapter", () => {
  let adapter: ClaudeAdapter;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ClaudeAdapter();
    // Ensure a clean env for each test (immutable copy)
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── name ──────────────────────────────────────────────────────────

  it("has name 'claude'", () => {
    expect(adapter.name).toBe("claude");
  });

  // ── isAvailable ───────────────────────────────────────────────────

  describe("isAvailable", () => {
    it("returns true when ANTHROPIC_API_KEY is set", async () => {
      process.env["ANTHROPIC_API_KEY"] = "sk-ant-test-key";

      const result = await adapter.isAvailable();

      expect(result).toBe(true);
    });

    it("returns false when ANTHROPIC_API_KEY is unset", async () => {
      delete process.env["ANTHROPIC_API_KEY"];

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });

    it("returns false when ANTHROPIC_API_KEY is empty string", async () => {
      process.env["ANTHROPIC_API_KEY"] = "";

      const result = await adapter.isAvailable();

      expect(result).toBe(false);
    });
  });

  // ── run — config mapping ──────────────────────────────────────────

  describe("run — config mapping", () => {
    it("maps AdapterConfig to SessionConfig correctly", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      await adapter.run(makeConfig({
        taskDescription: "Add rate limiting to API",
        repoPath: "/home/user/project",
        baseBranch: "develop",
        model: "claude-opus-4-6",
        maxTurns: 25,
      }));

      expect(mockRunSession).toHaveBeenCalledOnce();
      const sessionConfig = mockRunSession.mock.calls[0][0];
      expect(sessionConfig).toMatchObject({
        taskDescription: "Add rate limiting to API",
        repoPath: "/home/user/project",
        baseBranch: "develop",
        model: "claude-opus-4-6",
        maxTurns: 25,
        createPr: false,
      });
    });

    it("uses default model when not specified in config", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      await adapter.run(makeConfig({ model: undefined }));

      const sessionConfig = mockRunSession.mock.calls[0][0];
      expect(sessionConfig.model).toBe("claude-sonnet-4-6");
    });

    it("uses default maxTurns when not specified in config", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      await adapter.run(makeConfig({ maxTurns: undefined }));

      const sessionConfig = mockRunSession.mock.calls[0][0];
      expect(sessionConfig.maxTurns).toBe(50);
    });
  });

  // ── run — success result ──────────────────────────────────────────

  describe("run — success result", () => {
    it("returns success when session succeeds", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "succeeded",
        branchName: "worktree-agent-fix",
      }));

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.rateLimited).toBe(false);
    });

    it("includes durationMs in result", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      const result = await adapter.run(makeConfig());

      expect(result.durationMs).toBeTypeOf("number");
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("detects hasChanges when session produces a branch", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "succeeded",
        branchName: "worktree-agent-fix",
        prUrl: null,
      }));

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(true);
    });

    it("detects hasChanges when session produces a PR URL", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "succeeded",
        prUrl: "https://github.com/org/repo/pull/42",
      }));

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(true);
    });

    it("reports no changes when session fails with no branch", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "failed",
        branchName: "",
        prUrl: null,
      }));

      const result = await adapter.run(makeConfig());

      expect(result.hasChanges).toBe(false);
    });
  });

  // ── run — rate-limited failure ────────────────────────────────────

  describe("run — rate-limited failure", () => {
    it("detects rate limiting from failureCategory", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "failed",
        failureCategory: "rate_limited",
        errors: ["API rate limit exceeded"],
      }));

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(true);
    });

    it("does not flag rateLimited for other failure categories", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "failed",
        failureCategory: "api_error",
        errors: ["Internal server error"],
      }));

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(false);
    });

    it("includes error message from session errors", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult({
        status: "failed",
        errors: ["Stuck: repeated action", "No result message"],
      }));

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("Stuck: repeated action; No result message");
    });
  });

  // ── run — thrown errors ───────────────────────────────────────────

  describe("run — thrown errors", () => {
    it("catches thrown errors and returns failure", async () => {
      mockRunSession.mockRejectedValueOnce(new Error("SDK connection failed"));

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.hasChanges).toBe(false);
      expect(result.error).toBe("SDK connection failed");
    });

    it("detects rate limiting from thrown error message (429)", async () => {
      mockRunSession.mockRejectedValueOnce(
        new Error("Request failed with status 429: Too Many Requests"),
      );

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(true);
    });

    it("detects rate limiting from thrown error message (rate limit)", async () => {
      mockRunSession.mockRejectedValueOnce(
        new Error("Anthropic API rate limit exceeded"),
      );

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(true);
    });

    it("detects rate limiting from thrown error message (throttled)", async () => {
      mockRunSession.mockRejectedValueOnce(
        new Error("Request was throttled by the API"),
      );

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(true);
    });

    it("does not flag rateLimited for non-rate-limit errors", async () => {
      mockRunSession.mockRejectedValueOnce(
        new Error("Network timeout connecting to API"),
      );

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.rateLimited).toBe(false);
    });

    it("handles non-Error thrown values", async () => {
      mockRunSession.mockRejectedValueOnce("unexpected string error");

      const result = await adapter.run(makeConfig());

      expect(result.success).toBe(false);
      expect(result.error).toBe("unexpected string error");
    });
  });
});
