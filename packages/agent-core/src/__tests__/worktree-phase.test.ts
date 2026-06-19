import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig, SessionEvent } from "../types.js";
import type { PhaseDeps, WorktreePhaseInput } from "../phases/index.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// WorktreePhase reaches into a couple of small auxiliary modules via
// dynamic import (source resolution, PR-example fetching, retry, tracing).
// Everything else is injected through `PhaseDeps`.

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
  // Provide sourceFiles so the phase skips the source-resolver dynamic import.
  sourceFiles: [],
};

function makeInput(overrides?: Partial<WorktreePhaseInput>): WorktreePhaseInput {
  return { config: BASE_CONFIG, ...overrides };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("WorktreePhase", () => {
  const phase = new WorktreePhase();
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(deps.worktreeManager.createWorktree).mockResolvedValue({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    vi.mocked(deps.promptBuilder.buildSystemPrompt).mockResolvedValue("system prompt");
  });

  it("has name 'worktree'", () => {
    expect(phase.name).toBe("worktree");
  });

  it("creates worktree and builds system prompt", async () => {
    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(result.phase).toBe("worktree");
    expect(output?.worktree).toEqual({
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    });
    expect(output?.systemPrompt).toBe("system prompt");
    expect(deps.worktreeManager.createWorktree).toHaveBeenCalledWith(
      "/repo",
      "main",
      "Fix the login bug"
    );
  });

  it("returns failed result with null output when createWorktree throws", async () => {
    vi.mocked(deps.worktreeManager.createWorktree).mockRejectedValue(
      new Error("git worktree add failed")
    );

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("git worktree add failed");
    expect(output).toBeNull();
  });

  it("loads failure memory for context", async () => {
    await phase.run(makeInput(), deps);

    expect(deps.failureMemory.loadMemory).toHaveBeenCalledWith("/repo");
    expect(deps.failureMemory.queryPastFailures).toHaveBeenCalled();
    expect(deps.failureMemory.buildFailureContext).toHaveBeenCalled();
  });

  it("emits session:start events", async () => {
    const events: SessionEvent[] = [];
    const onEvent = (event: SessionEvent) => events.push(event);

    await phase.run(makeInput({ onEvent }), deps);

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe("session:start");
  });

  it("appends project context to system prompt when available", async () => {
    vi.mocked(deps.promptBuilder.loadProjectContext).mockResolvedValue("## Conventions\nUse TDD");
    vi.mocked(deps.promptBuilder.buildSystemPrompt).mockResolvedValue("base prompt");

    const { output } = await phase.run(makeInput(), deps);

    expect(output?.systemPrompt).toContain("base prompt");
    expect(output?.systemPrompt).toContain("## Conventions\nUse TDD");
  });
});
