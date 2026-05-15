import { describe, it, expect, vi, beforeEach } from "vitest";

// Expose mock functions so we can reference them without importing @mbe/agent-core
const mockRunSession = vi.fn();
const mockResolveBudget = vi.fn().mockReturnValue({ budgetUsd: 1.0 });
const mockResolveModel = vi.fn().mockReturnValue("claude-sonnet-4-6");

vi.mock("@mbe/agent-core", () => ({
  runSession: mockRunSession,
  DEFAULT_SESSION_CONFIG: {
    taskDescription: "",
    repoPath: ".",
    model: "claude-sonnet-4-6",
    maxBudgetUsd: 1.0,
    maxTurns: 50,
  },
  resolveBudget: mockResolveBudget,
  resolveModel: mockResolveModel,
}));

describe("loop command", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    // Restore default implementations after resetAllMocks
    mockResolveBudget.mockReturnValue({ budgetUsd: 1.0 });
    mockResolveModel.mockReturnValue("claude-sonnet-4-6");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);
    vi.spyOn(process, "cwd").mockReturnValue("/repo");
  });

  async function runLoop(args: string[]): Promise<void> {
    const { loopCommand } = await import("../commands/loop.js");
    await loopCommand.parseAsync(args, { from: "user" });
  }

  it("runs one iteration and reports completion when agent returns COMPLETE", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 2.0 });
    mockRunSession.mockResolvedValue({
      status: "succeeded",
      costUsd: 0.1,
      resultText: "<promise>COMPLETE</promise>",
    });

    await runLoop(["Fix the bug", "--max-loops", "3"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Successfully completed task");
    expect(output).toContain("1 iterations");
  });

  it("continues looping when no COMPLETE token is found", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 2.0 });
    mockRunSession.mockResolvedValue({
      status: "succeeded",
      costUsd: 0.1,
      resultText: "Some output without completion token",
    });

    await runLoop(["Fix the bug", "--max-loops", "2"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Reached maximum iterations (2)");
    expect(mockRunSession).toHaveBeenCalledTimes(2);
  });

  it("stops when budget is exhausted", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 0.05 });
    mockRunSession.mockResolvedValue({
      status: "succeeded",
      costUsd: 0.1, // More than budget
      resultText: "No completion",
    });

    await runLoop(["Fix the bug", "--max-loops", "5", "--max-budget", "0.05"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Budget limit reached");
    expect(mockRunSession).toHaveBeenCalledTimes(1);
  });

  it("logs error and continues when iteration fails", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 5.0 });
    mockRunSession.mockRejectedValueOnce(new Error("iteration error")).mockResolvedValueOnce({
      status: "succeeded",
      costUsd: 0.1,
      resultText: "<promise>COMPLETE</promise>",
    });

    await runLoop(["Fix the bug", "--max-loops", "3"]);

    const errOutput = errorSpy.mock.calls.flat().join("\n");
    expect(errOutput).toContain("iteration error");

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Successfully completed task");
  });

  it("reports failed status without stopping", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 5.0 });
    mockRunSession.mockResolvedValue({
      status: "failed",
      costUsd: 0.1,
      resultText: "",
    });

    await runLoop(["Fix the bug", "--max-loops", "2"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Iteration failed with status");
    expect(mockRunSession).toHaveBeenCalledTimes(2);
  });

  it("shows verbose events when --verbose flag is set", async () => {
    mockResolveBudget.mockReturnValue({ budgetUsd: 2.0 });

    // Simulate the callback being called with events
    mockRunSession.mockImplementation(
      async (_config: unknown, callback: (event: unknown) => void) => {
        if (callback) {
          callback({
            type: "session:start",
            timestamp: Date.now(),
            data: { message: "Starting session" },
          });
          callback({
            type: "session:result",
            timestamp: Date.now(),
            data: { message: "Session complete" },
          });
        }
        return {
          status: "succeeded",
          costUsd: 0.1,
          resultText: "<promise>COMPLETE</promise>",
        };
      }
    );

    await runLoop(["Fix the bug", "--max-loops", "1", "--verbose"]);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Starting session");
    expect(output).toContain("Session complete");
  });
});
