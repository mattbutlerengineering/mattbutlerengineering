import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @mbe/agent-core at the top level (hoisted by vitest).
// The package's dist/ is not compiled in this worktree, so a static import
// would fail.  vi.mock intercepts the require before the module is resolved.
vi.mock("@mbe/agent-core", () => ({
  runSession: vi.fn(),
  DEFAULT_SESSION_CONFIG: {
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 1.0,
    maxTurns: 50,
    baseBranch: "main",
    allowedTools: [],
  },
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  resolveBudget: vi.fn(() => ({ budgetUsd: 1.0, maxTurns: 50 })),
  resolveModel: vi.fn(() => "claude-sonnet-4-6"),
  routeModelWithReason: vi.fn(() => ({
    tier: "standard",
    modelId: "claude-sonnet-4-6",
    reason: "Default model selection",
  })),
}));

describe("agent command", () => {
  const originalFetch = globalThis.fetch;

  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  // References to the mock fns — populated in beforeEach via vi.importMock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let core: Record<string, any>;

  beforeEach(async () => {
    vi.resetModules();
    vi.resetAllMocks();

    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    // After resetModules the mock factory will re-run on next import, so
    // grabbing the module here gives fresh vi.fn() instances for each test.
    core = (await import("@mbe/agent-core")) as Record<string, unknown>;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── Helper: check-model subcommand ──────────────────────────────────────

  describe("check-model subcommand", () => {
    it("prints model routing information for a directive", async () => {
      // Override the default mock return value
      vi.mocked(core.routeModelWithReason as ReturnType<typeof vi.fn>).mockReturnValue({
        tier: "premium",
        modelId: "claude-opus-4",
        reason: "Complex task detected",
      });

      const { checkModelCommand } = await import("../commands/agent.js");
      await checkModelCommand.parseAsync(["Fix the auth bug"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Model Selection Dry-Run");
      expect(allOutput).toContain("PREMIUM");
      expect(allOutput).toContain("claude-opus-4");
      expect(allOutput).toContain("Complex task detected");
    });
  });

  // ── agent run (local mode) ───────────────────────────────────────────────

  describe("agent run subcommand", () => {
    it("runs a successful session and exits 0", async () => {
      vi.mocked(core.runSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "succeeded",
        branchName: "fix/agent-a1b2c3",
        durationMs: 5000,
        costUsd: 0.0123,
        numTurns: 8,
        tokenUsage: { inputTokens: 1000, outputTokens: 500 },
        prUrl: "https://github.com/org/repo/pull/42",
        errors: [],
        resultText: null,
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["run", "Fix the login bug"], { from: "user" });

      expect(core.runSession).toHaveBeenCalledOnce();
      const callConfig = (core.runSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(callConfig.taskDescription).toBe("Fix the login bug");

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("succeeded");
      expect(allOutput).toContain("fix/agent-a1b2c3");
      expect(allOutput).toContain("PR:");
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it("exits 1 when the session fails", async () => {
      vi.mocked(core.runSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "failed",
        branchName: "fix/agent-dead",
        durationMs: 1000,
        costUsd: 0.002,
        numTurns: 2,
        tokenUsage: { inputTokens: 100, outputTokens: 50 },
        prUrl: null,
        errors: ["Tool execution failed"],
        resultText: null,
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["run", "Bad task"], { from: "user" });

      expect(exitSpy).toHaveBeenCalledWith(1);
      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("failed");
      expect(allOutput).toContain("Tool execution failed");
    });

    it("calls process.exit(1) on unexpected thrown error", async () => {
      vi.mocked(core.runSession as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Unexpected crash")
      );

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["run", "Crash task"], { from: "user" });

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("Unexpected crash");
    });

    it("uses smart defaults from resolveBudget / resolveModel", async () => {
      vi.mocked(core.runSession as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "succeeded",
        branchName: "branch",
        durationMs: 1000,
        costUsd: 0.001,
        numTurns: 1,
        tokenUsage: { inputTokens: 10, outputTokens: 5 },
        prUrl: null,
        errors: [],
        resultText: null,
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["run", "Simple fix"], { from: "user" });

      expect(core.runSession).toHaveBeenCalledOnce();
      const config = (core.runSession as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(config.maxBudgetUsd).toBe(1.0);
      expect(config.maxTurns).toBe(50);
    });

    it("prints verbose agent events when --verbose flag is set", async () => {
      vi.mocked(core.runSession as ReturnType<typeof vi.fn>).mockImplementation(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (_config: unknown, onEvent: (e: any) => void) => {
          onEvent({
            type: "session:start",
            timestamp: new Date().toISOString(),
            data: { message: "Session started" },
          });
          onEvent({
            type: "session:result",
            timestamp: new Date().toISOString(),
            data: { message: "Done" },
          });
          return {
            status: "succeeded",
            branchName: "b",
            durationMs: 100,
            costUsd: 0,
            numTurns: 1,
            tokenUsage: { inputTokens: 1, outputTokens: 1 },
            prUrl: null,
            errors: [],
            resultText: "All done!",
          };
        }
      );

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["run", "Verbose task", "--verbose"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Session started");
      expect(allOutput).toContain("All done!");
    });
  });

  // ── agent start (API mode) ───────────────────────────────────────────────

  describe("agent start subcommand", () => {
    const mockSession = {
      id: "sess-123",
      status: "pending",
      taskDescription: "Fix bug",
      model: "claude-sonnet-4-6",
      maxBudgetUsd: 1.0,
      maxTurns: 50,
      branchName: null,
      prUrl: null,
      costUsd: null,
      numTurns: null,
      durationMs: null,
      inputTokens: null,
      outputTokens: null,
      errors: [],
      resultText: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };

    it("creates a session and prints details", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockSession }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["start", "Fix bug"], { from: "user" });

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("sess-123");
      expect(allOutput).toContain("pending");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("calls process.exit(1) when API request fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({ message: "Service unavailable" }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["start", "Fix bug"], { from: "user" });

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("Service unavailable");
    });
  });

  // ── agent list ────────────────────────────────────────────────────────────

  describe("agent list subcommand", () => {
    it("displays sessions in a table", async () => {
      const sessions = [
        {
          id: "sess-abc-00000000001",
          status: "succeeded",
          taskDescription: "Fix login",
          costUsd: 0.05,
          numTurns: 10,
          createdAt: new Date().toISOString(),
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: sessions,
            pagination: { page: 1, totalPages: 1, total: 1 },
          }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["list"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Fix login");
      expect(allOutput).toContain("succeeded");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("prints 'No sessions found' when list is empty", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [],
            pagination: { page: 1, totalPages: 0, total: 0 },
          }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["list"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("No sessions found");
    });
  });

  // ── agent status ──────────────────────────────────────────────────────────

  describe("agent status subcommand", () => {
    it("prints session details", async () => {
      const session = {
        id: "sess-xyz",
        status: "running",
        taskDescription: "Update dependencies",
        model: "claude-sonnet-4-6",
        maxBudgetUsd: 2.0,
        maxTurns: 50,
        branchName: "fix/deps-xyz",
        prUrl: null,
        costUsd: 0.12,
        numTurns: 5,
        durationMs: 30000,
        inputTokens: 5000,
        outputTokens: 2000,
        errors: [],
        resultText: null,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: null,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: session }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["status", "sess-xyz"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("sess-xyz");
      expect(allOutput).toContain("Update dependencies");
      expect(allOutput).toContain("fix/deps-xyz");
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── agent cancel ──────────────────────────────────────────────────────────

  describe("agent cancel subcommand", () => {
    it("cancels a session and prints the result", async () => {
      const cancelledSession = {
        id: "sess-cancel",
        status: "cancelled",
        taskDescription: "Long running task",
        model: "claude-sonnet-4-6",
        maxBudgetUsd: 1.0,
        maxTurns: 50,
        branchName: null,
        prUrl: null,
        costUsd: 0.02,
        numTurns: 3,
        durationMs: 10000,
        inputTokens: 1000,
        outputTokens: 300,
        errors: [],
        resultText: null,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: cancelledSession }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["cancel", "sess-cancel"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("cancelled");
      expect(exitSpy).not.toHaveBeenCalled();
    });
  });

  // ── agent delete ──────────────────────────────────────────────────────────

  describe("agent delete subcommand", () => {
    it("deletes a session and prints confirmation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        json: () => Promise.reject(new Error("no body")),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["delete", "sess-dead"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("sess-dead");
      expect(allOutput).toContain("deleted");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("exits with error when delete fails", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ message: "Session not found" }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["delete", "sess-missing"], { from: "user" });

      expect(exitSpy).toHaveBeenCalledWith(1);
      const errOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errOutput).toContain("Session not found");
    });
  });

  // ── agent cost ────────────────────────────────────────────────────────────

  describe("agent cost subcommand", () => {
    it("shows cost summary when no id is provided", async () => {
      const sessions = [
        {
          id: "sess-001",
          status: "succeeded",
          taskDescription: "Task 1",
          costUsd: 0.1,
          numTurns: 5,
          createdAt: new Date().toISOString(),
        },
        {
          id: "sess-002",
          status: "failed",
          taskDescription: "Task 2",
          costUsd: 0.05,
          numTurns: 2,
          createdAt: new Date().toISOString(),
        },
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: sessions,
            pagination: { page: 1, totalPages: 1, total: 2 },
          }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["cost"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Cost Summary");
      expect(allOutput).toContain("2 total");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("shows per-session breakdown when id is provided", async () => {
      const session = {
        id: "sess-detail",
        status: "succeeded",
        taskDescription: "Refactor auth",
        model: "claude-sonnet-4-6",
        maxBudgetUsd: 1.0,
        maxTurns: 50,
        branchName: "fix/auth",
        prUrl: null,
        costUsd: 0.42,
        numTurns: 12,
        durationMs: 60000,
        inputTokens: 20000,
        outputTokens: 8000,
        errors: [],
        resultText: null,
        createdAt: new Date().toISOString(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        turnMetrics: [
          {
            turnIndex: 1,
            startedAt: new Date().toISOString(),
            inputTokens: 10000,
            outputTokens: 4000,
            thinkingTokens: 0,
            costUsd: 0.21,
            modelId: "claude-sonnet-4-6",
          },
        ],
        toolCallMetrics: [
          { toolName: "Bash", toolUseId: "tu-1", latencyMs: 250, isError: false },
          { toolName: "Bash", toolUseId: "tu-2", latencyMs: 150, isError: false },
          { toolName: "Read", toolUseId: "tu-3", latencyMs: 50, isError: false },
        ],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: session }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["cost", "sess-detail"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("Cost Breakdown");
      expect(allOutput).toContain("Per-Turn");
      expect(allOutput).toContain("Tool Call Latency");
      expect(allOutput).toContain("Bash");
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it("shows 'No sessions found' when summary is empty", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            data: [],
            pagination: { page: 1, totalPages: 0, total: 0 },
          }),
      });

      const { agentCommand } = await import("../commands/agent.js");
      await agentCommand.parseAsync(["cost"], { from: "user" });

      const allOutput = logSpy.mock.calls.flat().join("\n");
      expect(allOutput).toContain("No sessions found");
    });
  });
});
