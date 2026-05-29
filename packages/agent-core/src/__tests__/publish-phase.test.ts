import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PipelineContext } from "../phases/pipeline-types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("../pr-creator.js", () => ({
  createPullRequest: vi.fn(),
  buildPrTitle: vi.fn(),
  buildPrBody: vi.fn(),
  buildFailurePrBody: vi.fn(),
}));

vi.mock("../dep-bump-merger.js", () => ({
  mergeDirectly: vi.fn(),
}));

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

vi.mock("@opentelemetry/api", () => ({
  trace: {
    getTracer: () => ({
      startSpan: () => ({
        setAttribute: vi.fn(),
        end: vi.fn(),
        recordException: vi.fn(),
        setStatus: vi.fn(),
      }),
    }),
  },
  SpanStatusCode: { ERROR: 2 },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { createPullRequest, buildPrTitle, buildPrBody, buildFailurePrBody } from "../pr-creator.js";
import { mergeDirectly } from "../dep-bump-merger.js";
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

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    config: BASE_CONFIG,
    errors: [],
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    systemPrompt: "system prompt",
    resultMessage: createMockResultMessage() as PipelineContext["resultMessage"],
    hasChanges: true,
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildPrTitle).mockReturnValue("feat: Fix the login bug");
    vi.mocked(buildPrBody).mockReturnValue("PR body");
    vi.mocked(buildFailurePrBody).mockReturnValue("Failure body");
    vi.mocked(createPullRequest).mockResolvedValue({
      url: "https://github.com/repo/pull/1",
      number: 1,
    });
  });

  it("has name 'publish'", () => {
    expect(phase.name).toBe("publish");
  });

  it("creates PR when gates pass", async () => {
    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(ctx.prUrl).toBe("https://github.com/repo/pull/1");
    expect(ctx.prNumber).toBe(1);
    expect(createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: false }));
  });

  it("skips when createPr is false", async () => {
    const { result, ctx } = await phase.run(
      makeCtx({ config: { ...BASE_CONFIG, createPr: false } })
    );

    expect(result.status).toBe("skipped");
    expect(ctx.prUrl).toBeUndefined();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("skips when no changes", async () => {
    const { result } = await phase.run(makeCtx({ hasChanges: false }));

    expect(result.status).toBe("skipped");
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("creates draft PR when gates fail", async () => {
    const { result, ctx } = await phase.run(
      makeCtx({
        gatewayVerdict: {
          outcome: "create-draft-pr",
          passed: false,
          gateFailures: ["verification"],
          errors: ["typecheck failed"],
        },
      })
    );

    expect(result.status).toBe("success");
    expect(ctx.prUrl).toBe("https://github.com/repo/pull/1");
    expect(createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: true }));
  });

  it("direct-merges trivial dep bumps", async () => {
    vi.mocked(mergeDirectly).mockResolvedValue("https://github.com/repo/pull/2");

    const { result, ctx } = await phase.run(
      makeCtx({
        gatewayVerdict: {
          outcome: "merge-direct",
          passed: true,
          gateFailures: [],
          errors: [],
        },
      })
    );

    expect(result.status).toBe("success");
    expect(ctx.prUrl).toBe("https://github.com/repo/pull/2");
    expect(mergeDirectly).toHaveBeenCalled();
    expect(createPullRequest).not.toHaveBeenCalled();
  });

  it("emits session:result events", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeCtx({ onEvent }));

    const resultEvents = events.filter((e) => e.type === "session:result");
    expect(resultEvents.length).toBeGreaterThan(0);
    expect((resultEvents[0].data as { message: string }).message).toContain("PR created");
  });

  it("creates PR without gateway verdict (failed session with changes)", async () => {
    const { result, ctx } = await phase.run(makeCtx({ gatewayVerdict: undefined }));

    expect(result.status).toBe("success");
    expect(ctx.prUrl).toBe("https://github.com/repo/pull/1");
    expect(createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ draft: false }));
  });
});
