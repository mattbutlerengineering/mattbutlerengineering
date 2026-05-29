import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PipelineContext } from "../phases/pipeline-types.js";

// ── Mocks ───────────────────────────────────────────────────────────

vi.mock("../worktree-manager.js", () => ({
  createWorktree: vi.fn(),
  commitChanges: vi.fn(),
  pushBranch: vi.fn(),
  hasChanges: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../prompt-builder.js", () => ({
  buildSystemPrompt: vi.fn(),
  loadSourceFiles: vi.fn().mockResolvedValue([]),
  loadProjectContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("../failure-memory.js", () => ({
  loadMemory: vi.fn(),
  queryPastFailures: vi.fn(),
  buildFailureContext: vi.fn(),
  recordFailure: vi.fn(),
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

import { createWorktree } from "../worktree-manager.js";
import { buildSystemPrompt, loadProjectContext } from "../prompt-builder.js";
import { loadMemory, queryPastFailures, buildFailureContext } from "../failure-memory.js";
import { WorktreePhase } from "../phases/worktree-phase.js";

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

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    config: BASE_CONFIG,
    errors: [],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("WorktreePhase", () => {
  const phase = new WorktreePhase();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    vi.mocked(buildSystemPrompt).mockReturnValue("system prompt");
    vi.mocked(loadProjectContext).mockResolvedValue(null);
    vi.mocked(loadMemory).mockResolvedValue({ records: [] });
    vi.mocked(queryPastFailures).mockReturnValue([]);
    vi.mocked(buildFailureContext).mockReturnValue("");
  });

  it("has name 'worktree'", () => {
    expect(phase.name).toBe("worktree");
  });

  it("creates worktree and builds system prompt", async () => {
    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("success");
    expect(result.phase).toBe("worktree");
    expect(ctx.worktree).toEqual({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    expect(ctx.systemPrompt).toBe("system prompt");
    expect(createWorktree).toHaveBeenCalledWith("/repo", "main", "Fix the login bug");
  });

  it("returns failed result when createWorktree throws", async () => {
    vi.mocked(createWorktree).mockRejectedValue(new Error("git worktree add failed"));

    const { result, ctx } = await phase.run(makeCtx());

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("git worktree add failed");
    expect(ctx.worktree).toBeUndefined();
  });

  it("loads failure memory for context", async () => {
    await phase.run(makeCtx());

    expect(loadMemory).toHaveBeenCalledWith("/repo");
    expect(queryPastFailures).toHaveBeenCalled();
    expect(buildFailureContext).toHaveBeenCalled();
  });

  it("emits session:start events", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeCtx({ onEvent }));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("session:start");
  });

  it("appends project context to system prompt when available", async () => {
    vi.mocked(loadProjectContext).mockResolvedValue("## Conventions\nUse TDD");
    vi.mocked(buildSystemPrompt).mockReturnValue("base prompt");

    const { ctx } = await phase.run(makeCtx());

    expect(ctx.systemPrompt).toContain("base prompt");
    expect(ctx.systemPrompt).toContain("## Conventions\nUse TDD");
  });
});
