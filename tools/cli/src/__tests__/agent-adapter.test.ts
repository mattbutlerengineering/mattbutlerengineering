import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

// ── Mocks ───────────────────────────────────────────────────────────────
//
// #2973: the CLI no longer constructs adapters, RateLimitDetector, or the
// failover cascade itself — it resolves an AgentSessionAdapter via
// resolveSessionAdapter() and hands it to runAgentSession(). The failover
// cascade and the full gate/publish pipeline now live entirely in
// agent-core, so these tests assert on that seam instead of on CLI-side
// adapter/worktree construction.

const mockRunAgentSession = vi.fn();
const mockResolveSessionAdapter = vi.fn();

vi.mock("@mbe/agent-core", () => ({
  runAgentSession: (...args: unknown[]) => mockRunAgentSession(...args),
  resolveSessionAdapter: (...args: unknown[]) => mockResolveSessionAdapter(...args),
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
  AllAdaptersUnavailableError: class extends Error {
    readonly cooldowns: ReadonlyMap<string, number>;
    constructor(cooldowns: ReadonlyMap<string, number>) {
      super("All agent adapters are rate-limited or unavailable");
      this.name = "AllAdaptersUnavailableError";
      this.cooldowns = cooldowns;
    }
  },
}));

// Prevent process.exit from actually exiting during tests
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

// Suppress console output during tests
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

function makeSessionResult(overrides: Record<string, unknown> = {}) {
  return {
    status: "succeeded",
    branchName: "agent/test-task",
    durationMs: 5000,
    costUsd: 0,
    numTurns: 0,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    prUrl: null,
    errors: [],
    resultText: null,
    ...overrides,
  };
}

describe("agent run --adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveSessionAdapter.mockReturnValue({ name: "resolved-adapter" });
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

  it.each(["claude", "gemini", "opencode", "auto"] as const)(
    "%s adapter resolves via resolveSessionAdapter and runs through runAgentSession",
    async (adapterType) => {
      mockRunAgentSession.mockResolvedValueOnce(makeSessionResult());

      const program = await buildProgram();
      await program.parseAsync([
        "node",
        "mbe",
        "agent",
        "run",
        "fix bug",
        "--adapter",
        adapterType,
      ]);

      expect(mockResolveSessionAdapter).toHaveBeenCalledWith(adapterType);
      expect(mockRunAgentSession).toHaveBeenCalledTimes(1);

      const [sessionConfig, sessionOptions] = mockRunAgentSession.mock.calls[0] as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(sessionConfig.taskDescription).toBe("fix bug");
      expect(sessionOptions.adapter).toBe(mockResolveSessionAdapter.mock.results[0]?.value);
    }
  );

  it("defaults to the claude adapter when --adapter is not specified", async () => {
    mockRunAgentSession.mockResolvedValueOnce(makeSessionResult());

    const program = await buildProgram();
    await program.parseAsync(["node", "mbe", "agent", "run", "small fix"]);

    expect(mockResolveSessionAdapter).toHaveBeenCalledWith("claude");
    expect(mockRunAgentSession).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid adapter without calling resolveSessionAdapter or runAgentSession", async () => {
    const program = await buildProgram();
    await program.parseAsync([
      "node",
      "mbe",
      "agent",
      "run",
      "fix bug",
      "--adapter",
      "not-a-real-adapter",
    ]);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockResolveSessionAdapter).not.toHaveBeenCalled();
    expect(mockRunAgentSession).not.toHaveBeenCalled();
  });

  it("prints cooldowns and exits 1 when runAgentSession throws AllAdaptersUnavailableError", async () => {
    const { AllAdaptersUnavailableError } = await import("@mbe/agent-core");
    const cooldowns = new Map([["gemini", Date.now() + 5000]]);
    mockRunAgentSession.mockRejectedValueOnce(new AllAdaptersUnavailableError(cooldowns));

    const program = await buildProgram();
    await program.parseAsync(["node", "mbe", "agent", "run", "add feature", "--adapter", "auto"]);

    expect(mockExit).toHaveBeenCalledWith(1);
  });
});
