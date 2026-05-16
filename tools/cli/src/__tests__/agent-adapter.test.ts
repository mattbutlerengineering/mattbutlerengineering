import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// ── Mocks ───────────────────────────────────────────────────────────────

const mockRunSession = vi.fn();
const mockCreateWorktree = vi.fn();
const mockRemoveWorktree = vi.fn();
const mockRunVerification = vi.fn();
const mockPushBranch = vi.fn();
const mockCreatePullRequest = vi.fn();

const mockClaudeRun = vi.fn();
const mockGeminiRun = vi.fn();
const mockOpenCodeRun = vi.fn();
const mockClaudeIsAvailable = vi.fn();
const mockGeminiIsAvailable = vi.fn();
const mockOpenCodeIsAvailable = vi.fn();
const mockRouterRoute = vi.fn();

vi.mock("@mbe/agent-core", () => ({
  runSession: (...args: unknown[]) => mockRunSession(...args),
  DEFAULT_SESSION_CONFIG: {
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 1.0,
    maxTurns: 50,
    baseBranch: "main",
    allowedTools: ["Read", "Write", "Edit", "Bash"],
  },
  DEFAULT_FEEDBACK_LOOP_CONFIG: { enabled: false },
  resolveBudget: () => ({ budgetUsd: 1.0, maxTurns: 50 }),
  resolveModel: () => "claude-sonnet-4-6",
  routeModelWithReason: vi.fn(() => ({
    tier: "sonnet",
    modelId: "claude-sonnet-4-6",
    reason: "default",
  })),
  FailoverRouter: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.route = mockRouterRoute;
    this.getAvailableAdapters = () => ["claude", "gemini", "opencode"];
  }),
  AllAdaptersUnavailableError: class extends Error {
    readonly cooldowns: ReadonlyMap<string, number>;
    constructor(cooldowns: ReadonlyMap<string, number>) {
      super("All agent adapters are rate-limited or unavailable");
      this.name = "AllAdaptersUnavailableError";
      this.cooldowns = cooldowns;
    }
  },
  ClaudeAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.name = "claude";
    this.isAvailable = mockClaudeIsAvailable;
    this.run = mockClaudeRun;
  }),
  GeminiCliAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.name = "gemini";
    this.isAvailable = mockGeminiIsAvailable;
    this.run = mockGeminiRun;
  }),
  OpenCodeAdapter: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.name = "opencode";
    this.isAvailable = mockOpenCodeIsAvailable;
    this.run = mockOpenCodeRun;
  }),
  RateLimitDetector: vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.isAvailable = () => true;
    this.markRateLimited = vi.fn();
    this.markSuccess = vi.fn();
    this.getAvailableAdapters = () => ["claude", "gemini", "opencode"];
    this.getState = () => null;
  }),
  createWorktree: (...args: unknown[]) => mockCreateWorktree(...args),
  removeWorktree: (...args: unknown[]) => mockRemoveWorktree(...args),
  runVerification: (...args: unknown[]) => mockRunVerification(...args),
  pushBranch: (...args: unknown[]) => mockPushBranch(...args),
  createPullRequest: (...args: unknown[]) => mockCreatePullRequest(...args),
  buildPrTitle: (task: string) => `agent: ${task}`,
  buildPrBody: () => "PR body",
}));

// Prevent process.exit from actually exiting during tests
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("agent run --adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockExit.mockClear();
  });

  async function buildProgram(): Promise<Command> {
    const mod = await import("../commands/agent.js");
    const program = new Command("mbe");
    program.exitOverride(); // Throw instead of calling process.exit for parse errors
    program.addCommand(mod.agentCommand);
    return program;
  }

  it("registers --adapter option on the run subcommand", async () => {
    const mod = await import("../commands/agent.js");
    const runCmd = mod.agentCommand.commands.find((c: Command) => c.name() === "run");

    expect(runCmd).toBeDefined();

    const adapterOpt = runCmd!.options.find((opt) => opt.long === "--adapter");
    expect(adapterOpt).toBeDefined();
    expect(adapterOpt!.defaultValue).toBe("claude");
    expect(adapterOpt!.description).toContain("auto");
    expect(adapterOpt!.description).toContain("claude");
    expect(adapterOpt!.description).toContain("gemini");
    expect(adapterOpt!.description).toContain("opencode");
  });

  it("claude adapter calls runSession directly (existing behavior)", async () => {
    mockRunSession.mockResolvedValueOnce({
      status: "succeeded",
      branchName: "agent/test-task",
      durationMs: 5000,
      costUsd: 0.05,
      numTurns: 3,
      tokenUsage: { inputTokens: 1000, outputTokens: 500 },
      prUrl: null,
      errors: [],
      resultText: null,
      inputTokens: 1000,
      outputTokens: 500,
    });

    const program = await buildProgram();
    await program.parseAsync(["node", "mbe", "agent", "run", "fix bug", "--adapter", "claude"]);

    expect(mockRunSession).toHaveBeenCalledTimes(1);
    const sessionConfig = mockRunSession.mock.calls[0][0];
    expect(sessionConfig.taskDescription).toBe("fix bug");

    // Verify adapter constructors were NOT invoked
    const { ClaudeAdapter, GeminiCliAdapter, OpenCodeAdapter } = await import("@mbe/agent-core");
    expect(ClaudeAdapter).not.toHaveBeenCalled();
    expect(GeminiCliAdapter).not.toHaveBeenCalled();
    expect(OpenCodeAdapter).not.toHaveBeenCalled();
  });

  it("auto adapter creates all 3 adapters and uses FailoverRouter", async () => {
    mockCreateWorktree.mockResolvedValueOnce({
      path: "/tmp/worktree-test",
      branchName: "agent/test-task",
      mode: "full",
    });
    mockRouterRoute.mockResolvedValueOnce({
      success: true,
      hasChanges: false,
      rateLimited: false,
      durationMs: 3000,
      adapter: "claude",
    });
    mockRemoveWorktree.mockResolvedValueOnce(undefined);

    const program = await buildProgram();
    await program.parseAsync([
      "node",
      "mbe",
      "agent",
      "run",
      "add feature",
      "--adapter",
      "auto",
      "--no-pr",
    ]);

    const { FailoverRouter, ClaudeAdapter, GeminiCliAdapter, OpenCodeAdapter } =
      await import("@mbe/agent-core");

    expect(FailoverRouter).toHaveBeenCalledTimes(1);
    expect(ClaudeAdapter).toHaveBeenCalledTimes(1);
    expect(GeminiCliAdapter).toHaveBeenCalledTimes(1);
    expect(OpenCodeAdapter).toHaveBeenCalledTimes(1);

    expect(mockRouterRoute).toHaveBeenCalledTimes(1);
    const routeConfig = mockRouterRoute.mock.calls[0][0];
    expect(routeConfig.taskDescription).toBe("add feature");
    expect(routeConfig.worktreePath).toBe("/tmp/worktree-test");
  });

  it("gemini adapter creates GeminiCliAdapter and manages worktree", async () => {
    mockCreateWorktree.mockResolvedValueOnce({
      path: "/tmp/worktree-gemini",
      branchName: "agent/gemini-task",
      mode: "full",
    });
    mockGeminiRun.mockResolvedValueOnce({
      success: true,
      hasChanges: false,
      rateLimited: false,
      durationMs: 2000,
    });
    mockRemoveWorktree.mockResolvedValueOnce(undefined);

    const program = await buildProgram();
    await program.parseAsync([
      "node",
      "mbe",
      "agent",
      "run",
      "refactor code",
      "--adapter",
      "gemini",
      "--no-pr",
    ]);

    expect(mockCreateWorktree).toHaveBeenCalledTimes(1);
    expect(mockGeminiRun).toHaveBeenCalledTimes(1);

    const runConfig = mockGeminiRun.mock.calls[0][0];
    expect(runConfig.worktreePath).toBe("/tmp/worktree-gemini");
    expect(runConfig.taskDescription).toBe("refactor code");
  });

  it("opencode adapter creates OpenCodeAdapter and manages worktree", async () => {
    mockCreateWorktree.mockResolvedValueOnce({
      path: "/tmp/worktree-opencode",
      branchName: "agent/opencode-task",
      mode: "full",
    });
    mockOpenCodeRun.mockResolvedValueOnce({
      success: true,
      hasChanges: false,
      rateLimited: false,
      durationMs: 1500,
    });
    mockRemoveWorktree.mockResolvedValueOnce(undefined);

    const program = await buildProgram();
    await program.parseAsync([
      "node",
      "mbe",
      "agent",
      "run",
      "update docs",
      "--adapter",
      "opencode",
      "--no-pr",
    ]);

    expect(mockCreateWorktree).toHaveBeenCalledTimes(1);
    expect(mockOpenCodeRun).toHaveBeenCalledTimes(1);

    const runConfig = mockOpenCodeRun.mock.calls[0][0];
    expect(runConfig.worktreePath).toBe("/tmp/worktree-opencode");
    expect(runConfig.taskDescription).toBe("update docs");
  });

  it("defaults to claude adapter when --adapter is not specified", async () => {
    mockRunSession.mockResolvedValueOnce({
      status: "succeeded",
      branchName: "agent/default-test",
      durationMs: 2000,
      costUsd: 0.02,
      numTurns: 2,
      tokenUsage: { inputTokens: 500, outputTokens: 200 },
      prUrl: null,
      errors: [],
      resultText: null,
      inputTokens: 500,
      outputTokens: 200,
    });

    const program = await buildProgram();
    await program.parseAsync(["node", "mbe", "agent", "run", "small fix"]);

    // Should use runSession (claude path), not create worktrees
    expect(mockRunSession).toHaveBeenCalledTimes(1);
    expect(mockCreateWorktree).not.toHaveBeenCalled();
  });
});
