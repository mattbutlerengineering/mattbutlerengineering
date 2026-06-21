import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cost logging integration seam for `mbe agent run`.
 *
 * Isolated in its own file so vi.mock("node:fs") does not bleed into the
 * main agent.test.ts suite (ESM module mocks are file-scoped in Vitest).
 *
 * Verifies that the claude-adapter completion path appends one well-formed
 * spend record to .claude/agent-spend.jsonl with cost+tokens+turns+model.
 */

// ── Captured fs writes ────────────────────────────────────────────────────

const appendCalls = vi.hoisted(() => ({ data: [] as Array<[string, string]> }));

// Mock node:fs so no real files are touched.
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
  runSession: vi.fn(),
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
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

// Mock node:child_process (needed by fetchIssueForRouting inside agent.ts).
vi.mock("node:child_process", () => {
  const PROMISIFY_CUSTOM = Symbol.for("nodejs.util.promisify.custom");
  const execFile = Object.assign(vi.fn(), {
    [PROMISIFY_CUSTOM]: () => Promise.resolve({ stdout: "{}", stderr: "" }),
  });
  return { execFile };
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("agent run – cost logging seam", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    appendCalls.data = [];
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
  });

  it("appends a well-formed record (cost+tokens+turns+model) after a successful run", async () => {
    const { runSession } = await import("@mbe/agent-core");
    vi.mocked(runSession).mockResolvedValue({
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
    await agentCommand.commands[0].parseAsync(
      ["Fix the logging bug", "--model", "claude-sonnet-4-6"],
      { from: "user" }
    );

    expect(exitSpy).toHaveBeenCalledWith(0);

    const spendCalls = appendCalls.data.filter(([p]) => String(p).endsWith("agent-spend.jsonl"));
    expect(spendCalls.length).toBe(1);

    const record = JSON.parse(String(spendCalls[0][1]).trim());
    expect(record.costUsd).toBe(0.0456);
    expect(record.inputTokens).toBe(1234);
    expect(record.outputTokens).toBe(567);
    expect(record.numTurns).toBe(7);
    expect(record.model).toBe("claude-sonnet-4-6");
    expect(typeof record.date).toBe("string");
    expect(typeof record.timestamp).toBe("string");
  });

  it("still appends a record when the session fails", async () => {
    const { runSession } = await import("@mbe/agent-core");
    vi.mocked(runSession).mockResolvedValue({
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
    await agentCommand.commands[0].parseAsync(["Bad task"], { from: "user" });

    expect(exitSpy).toHaveBeenCalledWith(1);

    const spendCalls = appendCalls.data.filter(([p]) => String(p).endsWith("agent-spend.jsonl"));
    expect(spendCalls.length).toBe(1);
    const record = JSON.parse(String(spendCalls[0][1]).trim());
    expect(record.costUsd).toBe(0.012);
    expect(record.numTurns).toBe(2);
  });
});
