import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PhaseDeps, FeedbackPhaseInput } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// model-router resolves the feedback model; the feedback loop itself is
// injected via `PhaseDeps`.

vi.mock("../model-router.js", () => ({
  getFeedbackLoopModel: vi.fn().mockReturnValue("claude-haiku-4-5"),
  resolveModelId: vi.fn().mockReturnValue("claude-sonnet-4-6"),
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { FeedbackPhase } from "../phases/feedback-phase.js";

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
  feedbackLoop: {
    enabled: true,
    maxRetries: 2,
    pollIntervalMs: 30_000,
    pollTimeoutMs: 300_000,
  },
};

function createMockResultMessage() {
  return {
    type: "result" as const,
    subtype: "success" as const,
    uuid: "test-uuid",
    session_id: "session-123",
    duration_ms: 5000,
    duration_api_ms: 4000,
    is_error: false,
    num_turns: 5,
    result: "Task completed",
    stop_reason: "end_turn",
    total_cost_usd: 0.25,
    usage: {
      input_tokens: 10000,
      output_tokens: 2000,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
  };
}

function makeInput(overrides?: Partial<FeedbackPhaseInput>): FeedbackPhaseInput {
  return {
    config: BASE_CONFIG,
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    resultMessage: createMockResultMessage() as FeedbackPhaseInput["resultMessage"],
    prUrl: "https://github.com/repo/pull/1",
    prNumber: 1,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("FeedbackPhase", () => {
  const phase = new FeedbackPhase();
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.feedbackLoop.runFeedbackLoop).mockResolvedValue({
      resolved: true,
      retriesUsed: 1,
      lastFingerprint: null,
    });
  });

  it("has name 'feedback'", () => {
    expect(phase.name).toBe("feedback");
  });

  it("runs feedback loop when enabled and PR exists", async () => {
    const { result } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(deps.feedbackLoop.runFeedbackLoop).toHaveBeenCalled();
  });

  it("skips when feedbackLoop is not enabled", async () => {
    const { result } = await phase.run(
      makeInput({ config: { ...BASE_CONFIG, feedbackLoop: undefined } }),
      deps
    );

    expect(result.status).toBe("skipped");
    expect(deps.feedbackLoop.runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("skips when feedbackLoop.enabled is false", async () => {
    const { result } = await phase.run(
      makeInput({
        config: {
          ...BASE_CONFIG,
          feedbackLoop: {
            enabled: false,
            maxRetries: 2,
            pollIntervalMs: 30_000,
            pollTimeoutMs: 300_000,
          },
        },
      }),
      deps
    );

    expect(result.status).toBe("skipped");
    expect(deps.feedbackLoop.runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("skips when no PR was created", async () => {
    const { result } = await phase.run(makeInput({ prUrl: null, prNumber: undefined }), deps);

    expect(result.status).toBe("skipped");
    expect(deps.feedbackLoop.runFeedbackLoop).not.toHaveBeenCalled();
  });

  it("uses remaining budget (total - session cost)", async () => {
    await phase.run(makeInput(), deps);

    const fbCall = vi.mocked(deps.feedbackLoop.runFeedbackLoop).mock.calls[0][0];
    // maxBudgetUsd = 1.0, resultMessage.total_cost_usd = 0.25 → remaining = 0.75
    expect(fbCall.maxBudgetUsd).toBeCloseTo(0.75);
  });

  it("emits session:result event with feedback outcome", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeInput({ onEvent }), deps);

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("Feedback loop");
  });
});
