import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionConfig } from "../types.js";
import type { PhaseDeps, QueryPhaseInput } from "../phases/index.js";
import type { HardenedQueryResult } from "../run-hardened-query.js";
import { makeFakePhaseDeps } from "./fake-phase-deps.js";

// ── Mocks ───────────────────────────────────────────────────────────
//
// The circuit-breaker gate is read directly from `run-hardened-query`; the
// query loop itself is injected via `deps.queryRunner`.

vi.mock("../circuit-breaker.js", () => ({
  CircuitState: { Open: "OPEN", Closed: "CLOSED", HalfOpen: "HALF_OPEN" },
}));

vi.mock("../run-hardened-query.js", () => ({
  apiCircuitBreaker: { getState: vi.fn().mockReturnValue("CLOSED") },
}));

// ── Imports (after mocks) ───────────────────────────────────────────

import { apiCircuitBreaker } from "../run-hardened-query.js";
import { QueryPhase } from "../phases/query-phase.js";

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

function makeInput(overrides?: Partial<QueryPhaseInput>): QueryPhaseInput {
  return {
    config: BASE_CONFIG,
    worktree: {
      path: "/repo/.agent-worktrees/agent-fix-bug-abc123",
      branchName: "agent/fix-bug-abc123",
      mode: "full",
    },
    systemPrompt: "system prompt",
    ...overrides,
  };
}

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

function hardenedResult(overrides?: Partial<HardenedQueryResult>): HardenedQueryResult {
  return {
    resultMessage: null,
    stuckReason: null,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage: null,
    contextMetrics: null,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────

describe("QueryPhase", () => {
  const phase = new QueryPhase();
  let deps: PhaseDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = makeFakePhaseDeps();
    vi.mocked(apiCircuitBreaker.getState).mockReturnValue("CLOSED" as never);
  });

  it("has name 'query'", () => {
    expect(phase.name).toBe("query");
  });

  it("returns resultMessage on successful query", async () => {
    const mockResult = createMockResultMessage();
    vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(
      hardenedResult({ resultMessage: mockResult as never })
    );

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(result.phase).toBe("query");
    expect(output?.resultMessage).toBeDefined();
    expect(output?.resultMessage?.session_id).toBe("session-123");
    expect(output?.stuckReason).toBeUndefined();
  });

  it("forwards the system prompt and config to the query runner", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(hardenedResult());

    await phase.run(makeInput(), deps);

    expect(deps.queryRunner.runHardenedQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Fix the login bug",
        cwd: "/repo/.agent-worktrees/agent-fix-bug-abc123",
        systemPromptAppend: "system prompt",
        model: "claude-sonnet-4-6",
      }),
      undefined
    );
  });

  it("fails fast when the circuit breaker is OPEN", async () => {
    vi.mocked(apiCircuitBreaker.getState).mockReturnValue("OPEN" as never);

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("failed");
    expect(result.errors[0]).toContain("Circuit breaker is OPEN");
    expect(output).toBeNull();
    expect(deps.queryRunner.runHardenedQuery).not.toHaveBeenCalled();
  });

  it("surfaces stuck reason as output metadata while the phase succeeds", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(
      hardenedResult({
        resultMessage: createMockResultMessage() as never,
        stuckReason: {
          type: "context_window_loop",
          description: "context window exhausted",
          severity: "error",
        } as never,
      })
    );

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("success");
    expect(output?.stuckReason?.type).toBe("context_window_loop");
  });

  it("returns failed with null output when the query runner reports an error", async () => {
    vi.mocked(deps.queryRunner.runHardenedQuery).mockResolvedValue(
      hardenedResult({ errorMessage: "SDK connection failed" })
    );

    const { result, output } = await phase.run(makeInput(), deps);

    expect(result.status).toBe("failed");
    expect(result.errors).toContain("SDK connection failed");
    expect(output).toBeNull();
  });
});
