import { describe, it, expect, vi, beforeEach } from "vitest";
import type * as AgentCore from "@mbe/agent-core";

const mockLoadSuite = vi.fn();
const mockRunSession = vi.fn();

// Keep the real harness/scorer/types; stub only the suite loader + agent run.
vi.mock("@mbe/agent-core", async (orig) => {
  const actual = await orig<typeof AgentCore>();
  return {
    ...actual,
    loadSuite: (...a: unknown[]) => mockLoadSuite(...a),
    runSession: (...a: unknown[]) => mockRunSession(...a),
  };
});

// verify() shells out via promisify(execFile); make it resolve (checks pass).
vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    _args: string[],
    optsOrCb: unknown,
    cb?: (err: unknown, res: { stdout: string; stderr: string }) => void,
  ) => {
    const callback = typeof optsOrCb === "function" ? optsOrCb : cb;
    (callback as (e: unknown, r: { stdout: string; stderr: string }) => void)(null, {
      stdout: "",
      stderr: "",
    });
  },
}));

function fakeSession(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "s1",
    status: "completed",
    branchName: "agent/t1",
    prUrl: null,
    costUsd: 0.2,
    tokenUsage: { inputTokens: 0, outputTokens: 0 },
    durationMs: 1,
    numTurns: 5,
    resultText: "",
    errors: [],
    evaluation: { passed: true, confidence: 0.9, reasoning: "ok" },
    ...overrides,
  };
}

const task = {
  id: "t1",
  category: "bugfix",
  prompt: "fix it",
  fixtureRef: "services/reservations",
  rubric: { testsMustPass: true, typecheckMustPass: true, lintMustPass: false, judgeCriteria: [] },
  budget: { maxTurns: 50, maxCostUsd: 1 },
};

describe("agent eval command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = 0;
  });

  it("runs the suite and prints a report", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunSession.mockResolvedValue(fakeSession());
    const { agentEvalCommand } = await import("./agent-eval.js");

    await agentEvalCommand.parseAsync(["--task", "t1"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    expect(out).toContain("Eval Report");
    expect(out).toContain("t1");
    expect(out).toContain("Pass rate");
    expect(process.exitCode).toBe(0);
  });

  it("emits JSON with --json", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    mockRunSession.mockResolvedValue(fakeSession());
    const { agentEvalCommand } = await import("./agent-eval.js");

    await agentEvalCommand.parseAsync(["--json"], { from: "user" });

    const out = logSpy.mock.calls.flat().join("\n");
    const parsed = JSON.parse(out);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.aggregate.total).toBe(1);
  });

  it("exits 1 when the suite directory cannot be loaded", async () => {
    mockLoadSuite.mockRejectedValue(new Error("no suite dir"));
    const { agentEvalCommand } = await import("./agent-eval.js");

    await agentEvalCommand.parseAsync([], { from: "user" });

    expect(process.exitCode).toBe(1);
    expect(errSpy.mock.calls.flat().join("\n")).toContain("no suite dir");
  });

  it("exits 1 when pass rate is below --threshold", async () => {
    mockLoadSuite.mockResolvedValue([task]);
    // Over budget → withinBudget false → task fails → pass rate 0
    mockRunSession.mockResolvedValue(fakeSession({ costUsd: 99 }));
    const { agentEvalCommand } = await import("./agent-eval.js");

    await agentEvalCommand.parseAsync(["--threshold", "50"], { from: "user" });

    expect(process.exitCode).toBe(1);
  });
});
