import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../run-hardened-query.js", () => ({
  runHardenedQuery: vi.fn(),
}));

import { runHardenedQuery } from "../run-hardened-query.js";
import type { HardenedQueryResult } from "../run-hardened-query.js";
import {
  runReviewer,
  parseReviewerVerdict,
  selectRetryAction,
  DEFAULT_REVIEWER_CONFIG,
} from "../reviewer-runner.js";
import type { ReviewerConfig } from "../reviewer-runner.js";
import type { ReviewInput, ReviewVerdict } from "../reviewer-contract.js";
import { PASS_THRESHOLD } from "../reviewer-contract.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSdkResult(
  structured_output: unknown,
  subtype: "success" | "error_max_turns" = "success"
) {
  return {
    type: "result" as const,
    subtype,
    structured_output,
    session_id: "reviewer-session",
    uuid: "reviewer-uuid",
    duration_ms: 800,
    duration_api_ms: 700,
    is_error: subtype !== "success",
    num_turns: 1,
    result: "",
    total_cost_usd: 0.02,
    usage: {
      input_tokens: 1200,
      output_tokens: 200,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
  };
}

function makeHardenedResult(
  structured_output: unknown,
  subtype: "success" | "error_max_turns" = "success"
): HardenedQueryResult {
  return {
    resultMessage: makeSdkResult(structured_output, subtype),
    stuckReason: null,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage: null,
    contextMetrics: null,
  };
}

function makeFailedHardenedResult(errorMessage: string): HardenedQueryResult {
  return {
    resultMessage: null,
    stuckReason: null,
    rawTurnMetrics: [],
    rawToolCallMetrics: [],
    errorMessage,
    contextMetrics: null,
  };
}

function makeReviewInput(overrides: Partial<ReviewInput> = {}): ReviewInput {
  return {
    diff: "diff --git a/src/foo.ts b/src/foo.ts\n+const x = 1;",
    verificationOutput: "lint: passed\ntypecheck: passed\ntest: 10 passed",
    taskDescription: "Add a constant x to foo.ts",
    acceptanceCriteria: ["x is defined in foo.ts", "tests pass"],
    changedFiles: ["src/foo.ts"],
    commitMessage: "feat: add constant x",
    ...overrides,
  };
}

function makeVerdict(overrides: Partial<ReviewVerdict> = {}): ReviewVerdict {
  return {
    verdict: "pass",
    score: 8,
    issues: [],
    assessment: "Clean implementation",
    reviewedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ── parseReviewerVerdict ─────────────────────────────────────────────────────

describe("parseReviewerVerdict", () => {
  it("parses a valid pass verdict from structured output", () => {
    const raw = makeVerdict();
    const result = parseReviewerVerdict(raw);
    expect(result.verdict).toBe("pass");
    expect(result.score).toBe(8);
    expect(result.issues).toHaveLength(0);
    expect(result.assessment).toBe("Clean implementation");
  });

  it("parses a flag verdict with issues", () => {
    const raw = makeVerdict({
      verdict: "flag",
      score: 4,
      issues: [
        {
          category: "hallucination",
          description: "Added unrequested feature",
          filePath: "src/foo.ts",
        },
      ],
      assessment: "Worker hallucinated extra logic",
    });
    const result = parseReviewerVerdict(raw);
    expect(result.verdict).toBe("flag");
    expect(result.score).toBe(4);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].category).toBe("hallucination");
  });

  it("coerces verdict to flag when score is below PASS_THRESHOLD", () => {
    const raw = makeVerdict({ verdict: "pass", score: 5 });
    const result = parseReviewerVerdict(raw);
    expect(result.verdict).toBe("flag");
  });

  it("coerces verdict to pass when score is at or above PASS_THRESHOLD", () => {
    const raw = makeVerdict({ verdict: "flag", score: PASS_THRESHOLD });
    const result = parseReviewerVerdict(raw);
    expect(result.verdict).toBe("pass");
  });

  it("normalises issues to empty array when omitted", () => {
    const raw = { ...makeVerdict(), issues: undefined } as unknown as ReviewVerdict;
    const result = parseReviewerVerdict(raw);
    expect(Array.isArray(result.issues)).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("always adds reviewedAt timestamp", () => {
    const raw = { ...makeVerdict(), reviewedAt: undefined } as unknown as ReviewVerdict;
    const result = parseReviewerVerdict(raw);
    expect(typeof result.reviewedAt).toBe("string");
    expect(result.reviewedAt.length).toBeGreaterThan(0);
  });
});

// ── selectRetryAction ────────────────────────────────────────────────────────

describe("selectRetryAction", () => {
  it("returns the action at the current retryCount index", () => {
    const policy = { maxRetries: 2, actions: ["retry", "file_issue"] as const };
    expect(selectRetryAction(policy, 0)).toBe("retry");
    expect(selectRetryAction(policy, 1)).toBe("file_issue");
  });

  it("repeats the last action when retryCount exceeds actions length", () => {
    const policy = { maxRetries: 5, actions: ["retry", "file_issue"] as const };
    expect(selectRetryAction(policy, 2)).toBe("file_issue");
    expect(selectRetryAction(policy, 10)).toBe("file_issue");
  });

  it("returns skip when actions is empty", () => {
    const policy = { maxRetries: 0, actions: [] as const };
    expect(selectRetryAction(policy, 0)).toBe("skip");
  });
});

// ── runReviewer ──────────────────────────────────────────────────────────────

describe("runReviewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pass outcome when LLM returns a passing verdict", async () => {
    const raw = makeVerdict({ verdict: "pass", score: 9 });
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
    expect(outcome.verdict.score).toBe(9);
    expect(outcome.retryCount).toBe(0);
  });

  it("returns flag outcome when LLM returns a failing verdict", async () => {
    const raw = makeVerdict({
      verdict: "flag",
      score: 3,
      issues: [{ category: "regression", description: "broke existing test" }],
      assessment: "Regression found",
    });
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("flag");
    expect(outcome.verdict.issues).toHaveLength(1);
  });

  it("records cost from the SDK result", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.costUsd).toBe(0.02);
  });

  it("records positive durationMs", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes retryCount into the outcome", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const outcome = await runReviewer(makeReviewInput(), { retryCount: 2 });
    expect(outcome.retryCount).toBe(2);
  });

  it("fails-open (pass) when the LLM returns a non-success subtype", async () => {
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(null, "error_max_turns"));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
  });

  it("fails-open (pass) when runHardenedQuery throws an error", async () => {
    vi.mocked(runHardenedQuery).mockRejectedValue(new Error("Network error"));

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
    expect(outcome.costUsd).toBe(0);
  });

  it("fails-open (pass) when runHardenedQuery returns errorMessage (circuit breaker / timeout)", async () => {
    vi.mocked(runHardenedQuery).mockResolvedValue(
      makeFailedHardenedResult("Circuit breaker is OPEN")
    );

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
    expect(outcome.costUsd).toBe(0);
  });

  it("uses the haiku model by default", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    await runReviewer(makeReviewInput());

    const callArgs = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(callArgs[0].model).toMatch(/haiku/i);
  });

  it("honours model override in config", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const config: Partial<ReviewerConfig> = {
      ...DEFAULT_REVIEWER_CONFIG,
      model: "claude-sonnet-4-6",
    };

    await runReviewer(makeReviewInput(), { config });

    const callArgs = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(callArgs[0].model).toBe("claude-sonnet-4-6");
  });

  it("calls runHardenedQuery with outputFormat json_schema", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    await runReviewer(makeReviewInput());

    const callArgs = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(callArgs[0].outputFormat?.type).toBe("json_schema");
    expect(callArgs[0].outputFormat?.schema).toBeDefined();
  });

  it("calls runHardenedQuery with maxTurns: 1", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    await runReviewer(makeReviewInput());

    const callArgs = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(callArgs[0].maxTurns).toBe(1);
  });

  it("uses heartbeatConfig inactivity timeout instead of manual Promise.race", async () => {
    const raw = makeVerdict();
    vi.mocked(runHardenedQuery).mockResolvedValue(makeHardenedResult(raw));

    const config: Partial<ReviewerConfig> = {
      ...DEFAULT_REVIEWER_CONFIG,
      timeoutMs: 15_000,
    };

    await runReviewer(makeReviewInput(), { config });

    const callArgs = vi.mocked(runHardenedQuery).mock.calls[0];
    expect(callArgs[0].heartbeatConfig?.inactivityTimeoutMs).toBe(15_000);
  });
});
