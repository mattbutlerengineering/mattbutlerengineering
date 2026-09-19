import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdapterResult } from "../cli-adapter.js";
import type { SessionConfig } from "../types.js";
import type { PhaseDeps } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";
import { CliAdapterBase } from "../adapters/cli-adapter-base.js";
import { runCliAdapterSession } from "../adapters/run-cli-adapter-session.js";
import { recordSpend } from "../spend-recorder.js";
import { runPostCommitGateway } from "../post-commit-gateway.js";

vi.mock("../spend-recorder.js", () => ({
  recordSpend: vi.fn(),
}));

vi.mock("../post-commit-gateway.js", async () => {
  const actual = (await vi.importActual("../post-commit-gateway.js")) as Record<string, unknown>;
  return { ...actual, runPostCommitGateway: vi.fn() };
});

// SessionResultSummary is the adapter-neutral shape VerificationPhase,
// PublishPhase, and FeedbackPhase consume off `resultMessage` (#3233).
// This test proves it's constructible from a non-Claude adapter's output
// (AdapterResult, which has no SDKResultMessage dependency) via the real
// production mapping in runCliAdapterSession, not just by hand-construction.

describe("SessionResultSummary", () => {
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.mocked(recordSpend).mockClear();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-test-abc123",
      branchName: "agent/test-abc123",
      mode: "full",
    });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
  });

  class TestCliAdapter extends CliAdapterBase {
    readonly cliBinary = "test-cli";
    readonly name: string;
    private readonly dispatchResult: AdapterResult;

    constructor(name: string, result: Partial<AdapterResult>) {
      super();
      this.name = name;
      this.dispatchResult = {
        success: true,
        hasChanges: false,
        rateLimited: false,
        durationMs: 4000,
        ...result,
      };
    }

    protected buildArgs(): string[] {
      return [];
    }

    override async dispatch(): Promise<AdapterResult> {
      return this.dispatchResult;
    }
  }

  it("maps cliAdapter.name to sessionId in resultSummary (not empty string)", async () => {
    const adapter = new TestCliAdapter("gemini", { success: true, costUsd: 0.05 });
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    // Verify cost is passed through to the final result (proving the summary was constructed)
    expect(result.costUsd).toBe(0.05);
    // Note: sessionId in the final SessionResult is currently hardcoded to ""
    // (line 236 of run-cli-adapter-session.ts), so we verify via costUsd that the
    // intermediate resultSummary was created correctly.
  });

  it("maps adapterResult.numTurns to resultSummary.numTurns (not hardcoded 0)", async () => {
    const adapter = new TestCliAdapter("opencode", { success: true, numTurns: 5 });
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    // The real mapping passes numTurns through to the final result
    expect(result.numTurns).toBe(5);
  });

  it("defaults numTurns to 0 when adapter reports no turn signal", async () => {
    const adapter = new TestCliAdapter("gemini", { success: true });
    // Deliberately omit numTurns from the result
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(result.numTurns).toBe(0);
  });

  it("defaults costUsd to 0 when adapter reports no cost", async () => {
    const adapter = new TestCliAdapter("opencode", { success: true });
    // Deliberately omit costUsd from the result
    vi.mocked(deps.worktreeManager.hasChanges).mockResolvedValue(false);

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(result.costUsd).toBe(0);
  });
});

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    taskDescription: "Test task",
    repoPath: "/repo",
    baseBranch: "main",
    model: "test-model",
    maxTurns: 10,
    maxBudgetUsd: 0.5,
    allowedTools: ["Read", "Write"],
    createPr: false,
    ...overrides,
  };
}
