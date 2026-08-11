import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Spend-recording seam for `mbe agent run` (#2974).
 *
 * Spend is now recorded by the single `recordSpend` seam inside @mbe/agent-core
 * (session-runner for the claude path, cli-adapter-session-runner for the
 * gemini/opencode path). The CLI must NOT write its own spend log — the legacy
 * `.claude/agent-spend.jsonl` sibling write double-counted claude runs and is
 * deleted. This suite verifies the CLI run command performs no spend write of
 * its own.
 */

// ── Captured fs writes ────────────────────────────────────────────────────

const appendCalls = vi.hoisted(() => ({ data: [] as Array<[string, string]> }));

// Mock node:fs so no real files are touched and any append is observable.
vi.mock("node:fs", async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  type NodeFs = typeof import("node:fs");
  const actual = await importOriginal<NodeFs>();
  return {
    ...actual,
    appendFileSync: vi.fn((path: string, data: string) => {
      appendCalls.data.push([path, data]);
    }),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    readFileSync: actual.readFileSync,
  };
});

// ── @mbe/agent-core mock ──────────────────────────────────────────────────

vi.mock("@mbe/agent-core", () => ({
  runAgentSession: vi.fn(),
  resolveSessionAdapter: vi.fn(() => ({ name: "claude" })),
  DEFAULT_SESSION_CONFIG: {
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 1.0,
    maxTurns: 50,
    baseBranch: "main",
    allowedTools: [],
  },
  DEFAULT_FEEDBACK_LOOP_CONFIG: {},
  loadSuite: vi.fn(),
  runEvalSuite: vi.fn(),
  resolveBudget: vi.fn(() => ({ budgetUsd: 1.0, maxTurns: 50 })),
  resolveModel: vi.fn(() => "claude-sonnet-4-6"),
  resolveModelId: vi.fn((tier: string) => tier),
  routeModelWithReason: vi.fn(() => ({
    tier: "standard",
    modelId: "claude-sonnet-4-6",
    reason: "default",
  })),
  AllAdaptersUnavailableError: class AllAdaptersUnavailableError extends Error {
    cooldowns = new Map();
    constructor(msg?: string) {
      super(msg ?? "All adapters unavailable");
      this.name = "AllAdaptersUnavailableError";
    }
  },
}));

// Mock @mbe/gh-client (needed by fetchIssueForRouting inside check-model.ts).
vi.mock("@mbe/gh-client", () => ({
  createGhClient: vi.fn(() => ({
    issue: { view: () => ({}) },
  })),
}));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("agent run – spend-recording seam", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    appendCalls.data = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  it("does not write its own spend log after a successful run (agent-core owns recording)", async () => {
    const { runAgentSession } = await import("@mbe/agent-core");
    vi.mocked(runAgentSession).mockResolvedValue({
      sessionId: "log-test",
      status: "succeeded",
      branchName: "fix/log-test",
      prUrl: null,
      costUsd: 0.0456,
      tokenUsage: { inputTokens: 1234, outputTokens: 567 },
      durationMs: 3000,
      numTurns: 7,
      resultText: "",
      errors: [],
    });

    const { agentCommand } = await import("../commands/agent.js");
    const [runSubcommand] = agentCommand.commands;
    if (!runSubcommand) throw new Error("expected agent run subcommand");
    await runSubcommand.parseAsync(["Fix the logging bug", "--model", "claude-sonnet-4-6"], {
      from: "user",
    });

    expect(exitSpy).toHaveBeenCalledWith(0);

    // No sibling spend file, no directory spend file — the CLI delegates all
    // spend recording to agent-core's single seam.
    const spendCalls = appendCalls.data.filter(([p]) => String(p).includes("agent-spend"));
    expect(spendCalls.length).toBe(0);
  });

  it("does not write its own spend log when the session fails", async () => {
    const { runAgentSession } = await import("@mbe/agent-core");
    vi.mocked(runAgentSession).mockResolvedValue({
      sessionId: "log-fail",
      status: "failed",
      branchName: "fix/log-fail",
      prUrl: null,
      costUsd: 0.012,
      tokenUsage: { inputTokens: 100, outputTokens: 20 },
      durationMs: 500,
      numTurns: 2,
      resultText: "",
      errors: ["boom"],
    });

    const { agentCommand } = await import("../commands/agent.js");
    const [runSubcommand] = agentCommand.commands;
    if (!runSubcommand) throw new Error("expected agent run subcommand");
    await runSubcommand.parseAsync(["Bad task"], { from: "user" });

    expect(exitSpy).toHaveBeenCalledWith(1);

    const spendCalls = appendCalls.data.filter(([p]) => String(p).includes("agent-spend"));
    expect(spendCalls.length).toBe(0);
  });
});
