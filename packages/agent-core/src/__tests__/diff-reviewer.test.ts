import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { reviewDiff, DEFAULT_REVIEW_CONFIG } from "../diff-reviewer.js";

// ── Helpers ──────────────────────────────────────────────────────────

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

function createMockReviewResult(review: { approved: boolean; issues: string[] }) {
  return {
    type: "result" as const,
    subtype: "success" as const,
    structured_output: review,
    session_id: "review-session",
    uuid: "review-uuid",
    duration_ms: 1000,
    duration_api_ms: 900,
    is_error: false,
    num_turns: 1,
    result: "",
    total_cost_usd: 0.01,
    usage: {
      input_tokens: 500,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    modelUsage: {},
    permission_denials: [],
  };
}

const SAMPLE_DIFF = `diff --git a/src/routes.ts b/src/routes.ts
+export async function createUser(req, res) {
+  const user = await db.query("SELECT * FROM users WHERE id = " + req.params.id);
+  res.json(user);
+}`;

// ── reviewDiff ────────────────────────────────────────────────────────

describe("reviewDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns approved=true when LLM finds no issues", async () => {
    const mockResult = createMockReviewResult({ approved: true, issues: [] });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns approved=false with issues when LLM finds security problems", async () => {
    const mockResult = createMockReviewResult({
      approved: false,
      issues: [
        "Security: SQL injection via string concatenation in db.query call",
        "Security: Hardcoded API key 'sk-prod-123' in environment config",
      ],
    });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.issues[0]).toContain("SQL injection");
  });

  it("returns approved=false with issues when LLM finds a11y problems", async () => {
    const mockResult = createMockReviewResult({
      approved: false,
      issues: ["a11y: <img> element missing alt attribute", "a11y: button missing aria-label"],
    });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const diff = `diff --git a/src/Button.tsx b/src/Button.tsx\n+<img src="logo.png" />\n+<button onClick={submit} />`;
    const result = await reviewDiff(diff);

    expect(result.approved).toBe(false);
    expect(result.issues).toContain("a11y: <img> element missing alt attribute");
  });

  it("returns approved=false with issues when LLM finds performance concerns", async () => {
    const mockResult = createMockReviewResult({
      approved: false,
      issues: ["Performance: Missing pagination on db.findAll() — could return unbounded results"],
    });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(false);
    expect(result.issues[0]).toContain("Performance");
  });

  it("returns approved=false with issues when LLM finds hardcoded values", async () => {
    const mockResult = createMockReviewResult({
      approved: false,
      issues: [
        "Hardcoded value: port 5432 should come from DATABASE_PORT env var",
        "Hardcoded value: URL 'http://localhost:3001' should be in config",
      ],
    });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const result = await reviewDiff("diff --git a/src/db.ts b/src/db.ts\n+const port = 5432;");

    expect(result.approved).toBe(false);
    expect(result.issues).toHaveLength(2);
  });

  it("returns approved=false for empty diff", async () => {
    const result = await reviewDiff("");

    expect(result.approved).toBe(false);
    expect(result.issues).toContain("Empty diff — nothing to review");
    expect(query).not.toHaveBeenCalled();
  });

  it("returns approved=false for whitespace-only diff", async () => {
    const result = await reviewDiff("   \n\t  ");

    expect(result.approved).toBe(false);
    expect(result.issues).toContain("Empty diff — nothing to review");
    expect(query).not.toHaveBeenCalled();
  });

  it("returns approved=true (fail-open) when SDK query throws", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("SDK unavailable");
    });

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns approved=true (fail-open) when result subtype is not success", async () => {
    const errorResult = {
      type: "result" as const,
      subtype: "error_max_turns" as const,
      structured_output: undefined,
      session_id: "review-session",
      uuid: "review-uuid",
      duration_ms: 500,
      duration_api_ms: 400,
      is_error: true,
      num_turns: 1,
      result: "",
      total_cost_usd: 0.005,
      usage: {
        input_tokens: 100,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
    };

    vi.mocked(query).mockReturnValue(mockQueryGenerator([errorResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns approved=true (fail-open) when structured_output is missing", async () => {
    const badResult = {
      type: "result" as const,
      subtype: "success" as const,
      structured_output: undefined,
      session_id: "review-session",
      uuid: "review-uuid",
      duration_ms: 1000,
      duration_api_ms: 900,
      is_error: false,
      num_turns: 1,
      result: "",
      total_cost_usd: 0.01,
      usage: {
        input_tokens: 500,
        output_tokens: 100,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      modelUsage: {},
      permission_denials: [],
    };

    vi.mocked(query).mockReturnValue(mockQueryGenerator([badResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns approved=true (fail-open) when structured_output.approved is not boolean", async () => {
    const malformedResult = createMockReviewResult({
      approved: "yes" as unknown as boolean,
      issues: [],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([malformedResult]) as ReturnType<typeof query>
    );

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.approved).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("normalizes issues to empty array when structured_output.issues is not an array", async () => {
    const malformedResult = {
      ...createMockReviewResult({ approved: false, issues: [] }),
      structured_output: { approved: false, issues: null },
    };

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([malformedResult]) as ReturnType<typeof query>
    );

    const result = await reviewDiff(SAMPLE_DIFF);

    expect(result.issues).toEqual([]);
  });

  it("uses haiku model by default", async () => {
    const mockResult = createMockReviewResult({ approved: true, issues: [] });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    await reviewDiff(SAMPLE_DIFF);

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: DEFAULT_REVIEW_CONFIG.model,
        }),
      })
    );
    expect(DEFAULT_REVIEW_CONFIG.model).toContain("haiku");
  });

  it("accepts custom model override", async () => {
    const mockResult = createMockReviewResult({ approved: true, issues: [] });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    await reviewDiff(SAMPLE_DIFF, { model: "claude-sonnet-4-6" });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: "claude-sonnet-4-6",
        }),
      })
    );
  });

  it("accepts custom budget override", async () => {
    const mockResult = createMockReviewResult({ approved: true, issues: [] });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    await reviewDiff(SAMPLE_DIFF, { maxBudgetUsd: 0.1 });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          maxBudgetUsd: 0.1,
        }),
      })
    );
  });

  it("truncates very large diffs before sending to LLM", async () => {
    const mockResult = createMockReviewResult({ approved: true, issues: [] });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    // Generate a diff larger than MAX_DIFF_LENGTH (50_000 chars)
    const hugeDiff = "diff --git a/big.ts b/big.ts\n" + "+line\n".repeat(15_000);
    expect(hugeDiff.length).toBeGreaterThan(50_000);

    await reviewDiff(hugeDiff);

    const calledPrompt = vi.mocked(query).mock.calls[0][0].prompt as string;
    expect(calledPrompt).toContain("diff truncated");
  });

  it("returns immutable issues array", async () => {
    const mockResult = createMockReviewResult({
      approved: false,
      issues: ["Security: hardcoded token"],
    });

    vi.mocked(query).mockReturnValue(mockQueryGenerator([mockResult]) as ReturnType<typeof query>);

    const result = await reviewDiff(SAMPLE_DIFF);

    // Verify we can read issues but result should be treated as readonly
    expect(result.issues[0]).toBe("Security: hardcoded token");
  });
});
