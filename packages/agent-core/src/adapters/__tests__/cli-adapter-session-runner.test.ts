import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentAdapter, AdapterConfig, AdapterResult } from "../../cli-adapter.js";
import type { SessionConfig } from "../../types.js";
import type { PhaseDeps } from "../../phases/index.js";
import { makeFakePhaseDeps } from "../../__tests__/fake-phase-deps.js";
import { recordSpend } from "../../spend-recorder.js";
import { runCliAdapterSession } from "../cli-adapter-session-runner.js";
import { getGitDiff } from "../../success-evaluator.js";
import { runPostCommitGateway } from "../../post-commit-gateway.js";

vi.mock("../../spend-recorder.js", () => ({
  recordSpend: vi.fn(),
}));

vi.mock("../../success-evaluator.js", async () => {
  const actual = (await vi.importActual("../../success-evaluator.js")) as Record<string, unknown>;
  return { ...actual, getGitDiff: vi.fn() };
});

vi.mock("../../post-commit-gateway.js", async () => {
  const actual = (await vi.importActual("../../post-commit-gateway.js")) as Record<string, unknown>;
  return { ...actual, runPostCommitGateway: vi.fn() };
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeSessionConfig(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    taskDescription: "Fix the login bug",
    repoPath: "/repo",
    baseBranch: "main",
    model: "gemini-2.5-pro",
    maxTurns: 50,
    maxBudgetUsd: 1.0,
    allowedTools: ["Read", "Write", "Edit", "Bash"],
    createPr: true,
    ...overrides,
  };
}

function makeCliAdapter(
  name: string,
  result: Partial<AdapterResult> = {}
): AgentAdapter & { run: ReturnType<typeof vi.fn> } {
  const run = vi.fn<(config: AdapterConfig) => Promise<AdapterResult>>().mockResolvedValue({
    success: true,
    hasChanges: true,
    rateLimited: false,
    durationMs: 4000,
    ...result,
  });
  return {
    name,
    isAvailable: vi.fn().mockResolvedValue(true),
    run,
  };
}

describe("runCliAdapterSession", () => {
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.mocked(recordSpend).mockClear();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    vi.mocked(getGitDiff).mockReset().mockResolvedValue("diff --git a/file.ts\n+change");
    vi.mocked(runPostCommitGateway).mockReset().mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
  });

  it("creates a worktree and dispatches the CLI subprocess run inside it", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: false });
    const config = makeSessionConfig();

    await runCliAdapterSession(adapter, config, undefined, deps);

    expect(deps.worktreeManager.createWorktree).toHaveBeenCalledWith(
      config.repoPath,
      config.baseBranch,
      config.taskDescription
    );
    expect(adapter.run).toHaveBeenCalledWith(
      expect.objectContaining({
        taskDescription: config.taskDescription,
        worktreePath: "/repo/.agent-worktrees/agent-fix-bug-abc123",
        repoPath: config.repoPath,
        baseBranch: config.baseBranch,
      })
    );
  });

  it("skips gates and PR creation when the adapter made no changes", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: false, success: true });
    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(runPostCommitGateway).not.toHaveBeenCalled();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBeNull();
    expect(result.branchName).toBe("agent/fix-bug-abc123");
  });

  it("runs the full GateRunner suite and creates a non-draft PR when the adapter succeeds and gates pass", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: true, success: true });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(deps.worktreeManager.pushBranch).toHaveBeenCalledOnce();
    expect(runPostCommitGateway).toHaveBeenCalledOnce();
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false })
    );
    expect(result.status).toBe("succeeded");
    expect(result.prUrl).toBe("https://github.com/repo/pull/1");
  });

  it("passes the adapter's real costUsd (not a literal 0) to buildPrBody when gates pass", async () => {
    const adapter = makeCliAdapter("opencode", {
      hasChanges: true,
      success: true,
      costUsd: 0.0234,
      tokenUsage: { inputTokens: 900, outputTokens: 210 },
    });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });

    await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(deps.prCreator.buildPrBody).toHaveBeenCalledWith(
      expect.any(String),
      "opencode",
      0.0234,
      0
    );
  });

  it("passes undefined costUsd to buildPrBody when the adapter reports no usage data", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: true, success: true });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });

    await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(deps.prCreator.buildPrBody).toHaveBeenCalledWith(
      expect.any(String),
      "gemini",
      undefined,
      0
    );
  });

  it("reflects the adapter's real cost/tokenUsage in the returned SessionResult", async () => {
    const adapter = makeCliAdapter("opencode", {
      hasChanges: true,
      success: true,
      costUsd: 0.0234,
      tokenUsage: { inputTokens: 900, outputTokens: 210 },
    });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(result.costUsd).toBe(0.0234);
    expect(result.tokenUsage).toEqual({ inputTokens: 900, outputTokens: 210 });
  });

  it("defaults SessionResult cost/tokenUsage to 0 when the adapter reports no usage data", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: false, success: true });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(result.costUsd).toBe(0);
    expect(result.tokenUsage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it("still creates a draft PR when a gate fails, matching the claude path's draft-PR outcome", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: true, success: true });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "create-draft-pr",
      passed: false,
      gateFailures: ["verification"],
      errors: ["Verification failed: typecheck errors"],
    });
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/2",
      number: 2,
    });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
    expect(result.prUrl).toBe("https://github.com/repo/pull/2");
    expect(result.errors).toContain("Verification failed: typecheck errors");
  });

  it("merges directly (no PR) when the gateway verdict is a trivial dep bump", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: true, success: true });
    vi.mocked(runPostCommitGateway).mockResolvedValue({
      outcome: "merge-direct",
      passed: true,
      gateFailures: [],
      errors: [],
    });
    vi.mocked(deps.prCreator.mergeDirectly).mockResolvedValue(
      "https://github.com/repo/pull/merged"
    );

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(deps.prCreator.mergeDirectly).toHaveBeenCalledOnce();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
    expect(result.prUrl).toBe("https://github.com/repo/pull/merged");
  });

  it("skips gates and opens a draft failure PR when the CLI adapter itself fails", async () => {
    const adapter = makeCliAdapter("gemini", {
      hasChanges: true,
      success: false,
      error: "gemini CLI exited with non-zero status",
    });
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/3",
      number: 3,
    });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(runPostCommitGateway).not.toHaveBeenCalled();
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
    expect(result.status).toBe("failed");
    expect(result.errors).toContain("gemini CLI exited with non-zero status");
  });

  it("sets failureCategory to rate_limited when the adapter reports rate limiting", async () => {
    const adapter = makeCliAdapter("gemini", {
      hasChanges: false,
      success: false,
      rateLimited: true,
      error: "429 Too Many Requests",
    });

    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(result.failureCategory).toBe("rate_limited");
  });

  it("does not create a PR when createPr is false, even though the branch is pushed", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: true, success: true });

    const result = await runCliAdapterSession(
      adapter,
      makeSessionConfig({ createPr: false }),
      undefined,
      deps
    );

    expect(deps.worktreeManager.pushBranch).toHaveBeenCalledOnce();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
    expect(result.prUrl).toBeNull();
  });

  it("removes the worktree when createPr is true but preserves it when false", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: false, success: true });

    await runCliAdapterSession(adapter, makeSessionConfig({ createPr: true }), undefined, deps);
    expect(deps.worktreeManager.removeWorktree).toHaveBeenCalledOnce();

    vi.mocked(deps.worktreeManager.removeWorktree).mockClear();

    await runCliAdapterSession(adapter, makeSessionConfig({ createPr: false }), undefined, deps);
    expect(deps.worktreeManager.removeWorktree).not.toHaveBeenCalled();
  });

  it("reports durationMs from the adapter's own reported duration", async () => {
    const adapter = makeCliAdapter("gemini", { hasChanges: false, durationMs: 12_345 });
    const result = await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);
    expect(result.durationMs).toBe(12_345);
  });

  it("records exactly one spend entry through the single seam, attributed to the adapter", async () => {
    const adapter = makeCliAdapter("gemini", {
      hasChanges: false,
      success: true,
      costUsd: 0.0234,
      tokenUsage: { inputTokens: 900, outputTokens: 210 },
    });

    await runCliAdapterSession(adapter, makeSessionConfig(), undefined, deps);

    expect(recordSpend).toHaveBeenCalledTimes(1);
    expect(recordSpend).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({
        costUsd: 0.0234,
        adapter: "gemini",
        model: "gemini-2.5-pro",
        status: "succeeded",
        inputTokens: 900,
        outputTokens: 210,
      })
    );
  });

  it("records a visible spend entry even for a cost-less adapter run", async () => {
    const adapter = makeCliAdapter("opencode", { hasChanges: false, success: true });

    await runCliAdapterSession(
      adapter,
      makeSessionConfig({ model: "opencode-model" }),
      undefined,
      deps
    );

    expect(recordSpend).toHaveBeenCalledTimes(1);
    expect(recordSpend).toHaveBeenCalledWith(
      "/repo",
      expect.objectContaining({ costUsd: 0, adapter: "opencode", status: "succeeded" })
    );
  });
});
