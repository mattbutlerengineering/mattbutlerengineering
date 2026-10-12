import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SessionConfig, SessionResult } from "../../types.js";
import type { runSession } from "../../session-runner.js";

// ── Mock runSession before importing the adapter ──────────────────────
const mockRunSession = vi.fn<typeof runSession>();

vi.mock("../../session-runner.js", () => ({
  runSession: (...args: Parameters<typeof runSession>) => mockRunSession(...args),
}));

import { ClaudeAdapter } from "../claude-adapter.js";

// ── Helpers ───────────────────────────────────────────────────────────

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    taskDescription: "Fix the login bug in auth.ts",
    repoPath: "/tmp/repo",
    baseBranch: "main",
    model: "claude-sonnet-4-6",
    maxTurns: 50,
    maxBudgetUsd: 1.0,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
    createPr: true,
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

  // ── runSession — full-pipeline passthrough seam (#2964) ─────────────

  describe("runSession — full-pipeline passthrough", () => {
    it("forwards the SessionConfig unchanged to the underlying runSession() pipeline", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      const config = {
        taskDescription: "Add rate limiting to API",
        repoPath: "/home/user/project",
        baseBranch: "develop",
        model: "claude-opus-4-6",
        maxTurns: 25,
        maxBudgetUsd: 2.5,
        allowedTools: ["Read", "Write"],
        createPr: true,
      };

      await adapter.runSession(config);

      expect(mockRunSession).toHaveBeenCalledWith(config, undefined, undefined, undefined);
    });

    it("forwards onEvent, deps, and signal through unchanged", async () => {
      mockRunSession.mockResolvedValueOnce(makeSessionResult());

      const config = {
        taskDescription: "Fix bug",
        repoPath: "/repo",
        baseBranch: "main",
        model: "claude-sonnet-4-6",
        maxTurns: 50,
        maxBudgetUsd: 1.0,
        allowedTools: ["Read"],
        createPr: false,
      };
      const onEvent = vi.fn();
      const deps = {} as never;
      const controller = new AbortController();

      await adapter.runSession(config, onEvent, deps, controller.signal);

      expect(mockRunSession).toHaveBeenCalledWith(config, onEvent, deps, controller.signal);
    });

    it("returns the full SessionResult unchanged (not the lossy AdapterResult mapping)", async () => {
      const sessionResult = makeSessionResult({ status: "failed", errors: ["boom"] });
      mockRunSession.mockResolvedValueOnce(sessionResult);

      const result = await adapter.runSession(makeSessionConfig());

      expect(result).toBe(sessionResult);
    });
  });
});
