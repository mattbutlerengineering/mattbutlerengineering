import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
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

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

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
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

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
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("flag");
    expect(outcome.verdict.issues).toHaveLength(1);
  });

  it("records cost from the SDK result", async () => {
    const raw = makeVerdict();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.costUsd).toBe(0.02);
  });

  it("records positive durationMs", async () => {
    const raw = makeVerdict();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("passes retryCount into the outcome", async () => {
    const raw = makeVerdict();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    const outcome = await runReviewer(makeReviewInput(), { retryCount: 2 });
    expect(outcome.retryCount).toBe(2);
  });

  it("fails-open (pass) when the LLM returns a non-success subtype", async () => {
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(null, "error_max_turns")]) as ReturnType<typeof query>
    );

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
  });

  it("fails-open (pass) on LLM call error", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("Network error");
    });

    const outcome = await runReviewer(makeReviewInput());
    expect(outcome.verdict.verdict).toBe("pass");
    expect(outcome.costUsd).toBe(0);
  });

  it("fails-open (pass) on timeout", async () => {
    vi.useFakeTimers();

    // Simulate a hanging query by returning a promise that never resolves.
    // Cast through unknown to satisfy the async-iterable return type.
    vi.mocked(query).mockReturnValue(
      new Promise<never>(() => {}) as unknown as ReturnType<typeof query>
    );

    const outcomePromise = runReviewer(makeReviewInput(), {
      config: { ...DEFAULT_REVIEWER_CONFIG, timeoutMs: 100 },
    });

    vi.advanceTimersByTime(200);
    const outcome = await outcomePromise;
    expect(outcome.verdict.verdict).toBe("pass");

    vi.useRealTimers();
  });

  it("uses the haiku model by default", async () => {
    const raw = makeVerdict();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    await runReviewer(makeReviewInput());

    const callArgs = vi.mocked(query).mock.calls[0];
    expect(callArgs[0].options?.model).toMatch(/haiku/i);
  });

  it("honours model override in config", async () => {
    const raw = makeVerdict();
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([makeSdkResult(raw)]) as ReturnType<typeof query>
    );

    const config: Partial<ReviewerConfig> = {
      ...DEFAULT_REVIEWER_CONFIG,
      model: "claude-sonnet-4-6",
    };

    await runReviewer(makeReviewInput(), { config });

    const callArgs = vi.mocked(query).mock.calls[0];
    expect(callArgs[0].options?.model).toBe("claude-sonnet-4-6");
  });
});
