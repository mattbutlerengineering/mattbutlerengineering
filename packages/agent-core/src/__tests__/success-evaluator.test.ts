import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFile } from "node:child_process";
import { evaluateSuccess, getGitDiff } from "../success-evaluator.js";

async function* mockQueryGenerator(messages: unknown[]) {
  for (const msg of messages) {
    yield msg;
  }
}

function createMockEvalResult(evaluation: {
  passed: boolean;
  confidence: number;
  reasoning: string;
  issues: string[];
}) {
  return {
    type: "result" as const,
    subtype: "success" as const,
    structured_output: evaluation,
    session_id: "eval-session",
    uuid: "eval-uuid",
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

describe("evaluateSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns pass when LLM evaluates diff as successful", async () => {
    const evalResult = createMockEvalResult({
      passed: true,
      confidence: 0.95,
      reasoning: "The diff adds the requested feature correctly",
      issues: [],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([evalResult]) as ReturnType<typeof query>
    );

    const result = await evaluateSuccess(
      "Add a health check endpoint",
      "diff --git a/src/routes.ts\n+app.get('/health', ...)"
    );

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0.95);
    expect(result.issues).toHaveLength(0);
  });

  it("returns fail when LLM finds issues", async () => {
    const evalResult = createMockEvalResult({
      passed: false,
      confidence: 0.8,
      reasoning: "The diff modifies unrelated files",
      issues: ["Changes are not related to the task", "Missing tests"],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([evalResult]) as ReturnType<typeof query>
    );

    const result = await evaluateSuccess(
      "Fix the login bug",
      "diff --git a/src/unrelated.ts\n+// unrelated change"
    );

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(0.8);
    expect(result.issues).toContain("Missing tests");
  });

  it("returns fail for empty diff", async () => {
    const result = await evaluateSuccess("Fix bug", "");

    expect(result.passed).toBe(false);
    expect(result.confidence).toBe(1.0);
    expect(result.issues).toContain("Empty diff");
    expect(query).not.toHaveBeenCalled();
  });

  it("returns inconclusive when SDK query fails", async () => {
    vi.mocked(query).mockImplementation(() => {
      throw new Error("SDK error");
    });

    const result = await evaluateSuccess("Fix bug", "diff --git a/file.ts");

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("unavailable");
  });

  it("returns inconclusive when result has no structured output", async () => {
    const badResult = {
      type: "result" as const,
      subtype: "success" as const,
      structured_output: undefined,
      session_id: "eval-session",
      uuid: "eval-uuid",
      duration_ms: 1000,
      duration_api_ms: 900,
      is_error: false,
      num_turns: 1,
      result: "some text",
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

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([badResult]) as ReturnType<typeof query>
    );

    const result = await evaluateSuccess("Fix bug", "diff --git a/file.ts");

    expect(result.passed).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it("clamps confidence to 0-1 range", async () => {
    const evalResult = createMockEvalResult({
      passed: true,
      confidence: 1.5,
      reasoning: "Good",
      issues: [],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([evalResult]) as ReturnType<typeof query>
    );

    const result = await evaluateSuccess("Task", "diff --git a/file.ts");

    expect(result.confidence).toBe(1.0);
  });

  it("uses haiku model by default", async () => {
    const evalResult = createMockEvalResult({
      passed: true,
      confidence: 0.9,
      reasoning: "OK",
      issues: [],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([evalResult]) as ReturnType<typeof query>
    );

    await evaluateSuccess("Task", "diff --git a/file.ts");

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: "claude-haiku-4-5-20250929",
        }),
      })
    );
  });

  it("accepts custom model override", async () => {
    const evalResult = createMockEvalResult({
      passed: true,
      confidence: 0.9,
      reasoning: "OK",
      issues: [],
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([evalResult]) as ReturnType<typeof query>
    );

    await evaluateSuccess("Task", "diff --git a/file.ts", {
      model: "claude-sonnet-4-6",
    });

    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          model: "claude-sonnet-4-6",
        }),
      })
    );
  });
});

describe("getGitDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns git diff output", async () => {
    vi.mocked(execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>)
      .mockResolvedValue({ stdout: "diff --git a/file.ts\n+new line" });

    const diff = await getGitDiff("/repo");

    expect(diff).toContain("diff --git");
  });

  it("returns empty string on git error", async () => {
    vi.mocked(execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>)
      .mockRejectedValue(new Error("not a git repo"));

    const diff = await getGitDiff("/not-a-repo");

    expect(diff).toBe("");
  });
});
