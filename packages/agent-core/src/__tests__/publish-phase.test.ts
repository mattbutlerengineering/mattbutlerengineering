import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent, SessionResultSummary } from "../types.js";
import type { PhaseDeps, PublishPhaseInput } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// Only retry (skip delays) is module-mocked; pr-creator / dep-bump-merger
// collaborators are injected via `PhaseDeps`.

vi.mock("../retry.js", async () => {
  const actual = (await vi.importActual("../retry.js")) as Record<string, unknown>;
  return {
    ...actual,
    withRetry: vi.fn().mockImplementation(async (fn: () => Promise<unknown>) => {
      const value = await fn();
      return { value, attempts: 1 };
    }),
  };
});

// ── Imports (after mocks) ───────────────────────────────────────────

import { PublishPhase } from "../phases/publish-phase.js";

// ── Helpers ─────────────────────────────────────────────────────────

const BASE_CONFIG: SessionConfig = {
  taskDescription: "Fix the login bug",
  repoPath: "/repo",
  baseBranch: "main",
  model: "claude-sonnet-4-6",
  maxTurns: 50,
  maxBudgetUsd: 1.0,
  allowedTools: ["Read", "Write", "Edit", "Bash"],
  createPr: true,
};

function createMockResultMessage(): SessionResultSummary {
  return {
    success: true,
    sessionId: "session-123",
    costUsd: 0.25,
    numTurns: 5,
    subtype: "success",
    errors: [],
  };
}

function makeInput(overrides?: Partial<PublishPhaseInput>): PublishPhaseInput {
  return {
    config: BASE_CONFIG,
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    resultMessage: createMockResultMessage(),
    hasChanges: true,
    errors: [],
    gatewayVerdict: {
      outcome: "create-pr",
      passed: true,
      gateFailures: [],
      errors: [],
    },
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("PublishPhase", () => {
  const phase = new PublishPhase();
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.prCreator.buildPrTitle).mockReturnValue("feat: Fix the login bug");
    vi.mocked(deps.prCreator.buildPrBody).mockReturnValue("PR body");
    vi.mocked(deps.prCreator.createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
  });

  it("has name 'publish'", () => {
    expect(phase.name).toBe("publish");
  });

  it("creates PR when gates pass", async () => {
    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
    expect(output?.prNumber).toBe(1);
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false })
    );
  });

  it("skips when createPr is false", async () => {
    const { result, output } = await phase.run(
      makeInput({ config: { ...BASE_CONFIG, createPr: false } }),
      deps
    );

    expect(result.status).toBe("skipped");
    expect(output).toBeNull();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
  });

  it("skips when no changes", async () => {
    const { result } = await phase.run(makeInput({ hasChanges: false }), deps);

    expect(result.status).toBe("skipped");
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
  });

  it("creates draft PR when gates fail", async () => {
    const { result, output } = await phase.run(
      makeInput({
        gatewayVerdict: {
          outcome: "create-draft-pr",
          passed: false,
          gateFailures: ["verification"],
          errors: ["typecheck failed"],
        },
      }),
      deps
    );

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
  });

  it("direct-merges trivial dep bumps", async () => {
    vi.mocked(deps.prCreator.mergeDirectly).mockResolvedValue("https://github.com/repo/pull/2");

    const { result, output } = await phase.run(
      makeInput({
        gatewayVerdict: {
          outcome: "merge-direct",
          passed: true,
          gateFailures: [],
          errors: [],
        },
      }),
      deps
    );

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/2");
    expect(deps.prCreator.mergeDirectly).toHaveBeenCalled();
    expect(deps.prCreator.createPullRequest).not.toHaveBeenCalled();
  });

  it("emits session:result events", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeInput({ onEvent }), deps);

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("PR created");
  });

  it("creates PR without gateway verdict when the session succeeded", async () => {
    const { result, output } = await phase.run(makeInput({ gatewayVerdict: undefined }), deps);

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: false })
    );
  });

  it("names the max-turns reason in the failure PR body args (session failed, not stuck)", async () => {
    const { result, output } = await phase.run(
      makeInput({
        gatewayVerdict: undefined,
        resultMessage: {
          ...createMockResultMessage(),
          success: false,
          subtype: "error_max_turns",
          errors: [],
        },
      }),
      deps
    );

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true, title: expect.stringContaining("wip:") })
    );
    // The body must NAME the reason — a plain failed session must not render
    // a diagnostically empty "## Failure Details" section (#3272).
    expect(deps.prCreator.buildFailurePrBody).toHaveBeenCalledWith(
      BASE_CONFIG.taskDescription,
      expect.arrayContaining([expect.stringContaining("error_max_turns")]),
      undefined
    );
    expect(deps.prCreator.buildPrBody).not.toHaveBeenCalled();
  });

  it("forwards SDK-reported errors into the failure PR body args", async () => {
    await phase.run(
      makeInput({
        gatewayVerdict: undefined,
        errors: [],
        resultMessage: {
          ...createMockResultMessage(),
          success: false,
          subtype: "error_during_execution",
          errors: ["boom: tool crashed"],
        },
      }),
      deps
    );

    expect(deps.prCreator.buildFailurePrBody).toHaveBeenCalledWith(
      BASE_CONFIG.taskDescription,
      expect.arrayContaining(["boom: tool crashed"]),
      undefined
    );
  });

  it("passes the stuck pattern as the failure PR body's stuck-pattern arg (no regression)", async () => {
    const { result, output } = await phase.run(
      makeInput({
        gatewayVerdict: undefined,
        stuckReason: {
          type: "repeated_action_observation",
          count: 4,
          threshold: 4,
          description: "Repeated the same action 4 times",
          severity: "error",
        },
      }),
      deps
    );

    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
    expect(deps.prCreator.buildFailurePrBody).toHaveBeenCalledWith(
      BASE_CONFIG.taskDescription,
      expect.any(Array),
      "repeated_action_observation"
    );
  });

  it("does NOT direct-merge when the gateway says merge-direct but the session failed", async () => {
    vi.mocked(deps.prCreator.mergeDirectly).mockResolvedValue(
      "https://github.com/repo/pull/merged"
    );

    const { result, output } = await phase.run(
      makeInput({
        resultMessage: {
          ...createMockResultMessage(),
          success: false,
          subtype: "error_max_turns",
        },
        gatewayVerdict: {
          outcome: "merge-direct",
          passed: true,
          gateFailures: [],
          errors: [],
        },
      }),
      deps
    );

    expect(deps.prCreator.mergeDirectly).not.toHaveBeenCalled();
    expect(deps.prCreator.createPullRequest).toHaveBeenCalledWith(
      expect.objectContaining({ draft: true })
    );
    expect(result.status).toBe("success");
    expect(output?.prUrl).toBe("https://github.com/repo/pull/1");
  });
});
