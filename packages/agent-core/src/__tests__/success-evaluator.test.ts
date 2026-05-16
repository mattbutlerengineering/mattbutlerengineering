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
import {
  evaluateSuccess,
  getGitDiff,
  shouldEvaluate,
  extractAcceptanceCriteria,
  extractExpectedFiles,
} from "../success-evaluator.js";

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([evalResult]) as ReturnType<typeof query>);

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([evalResult]) as ReturnType<typeof query>);

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([badResult]) as ReturnType<typeof query>);

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([evalResult]) as ReturnType<typeof query>);

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([evalResult]) as ReturnType<typeof query>);

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

    vi.mocked(query).mockReturnValue(mockQueryGenerator([evalResult]) as ReturnType<typeof query>);

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
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout: "diff --git a/file.ts\n+new line" });

    const diff = await getGitDiff("/repo");

    expect(diff).toContain("diff --git");
  });

  it("returns empty string on git error", async () => {
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockRejectedValue(new Error("not a git repo"));

    const diff = await getGitDiff("/not-a-repo");

    expect(diff).toBe("");
  });
});

// ── shouldEvaluate ────────────────────────────────────────────────────

function buildDiff(files: string[], linesPerFile = 5): string {
  return files
    .map((f) => {
      const lines = Array.from({ length: linesPerFile }, (_, i) => `+line ${i + 1}`).join("\n");
      return `diff --git a/${f} b/${f}\n${lines}`;
    })
    .join("\n");
}

describe("shouldEvaluate", () => {
  it("returns true for a normal non-trivial diff", () => {
    const diff = buildDiff(["src/routes.ts"], 60);
    expect(shouldEvaluate(diff, {})).toBe(true);
  });

  it("returns true for an empty diff (let evaluateSuccess handle it)", () => {
    expect(shouldEvaluate("", {})).toBe(true);
  });

  // ── Condition 1: small diff + tests passed ────────────────────────

  it("returns false when diff < 50 lines and tests passed", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(shouldEvaluate(diff, { testsPassed: true })).toBe(false);
  });

  it("returns true when diff < 50 lines but tests did NOT pass", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(shouldEvaluate(diff, { testsPassed: false })).toBe(true);
  });

  it("returns true when diff < 50 lines and testsPassed is undefined", () => {
    const diff = buildDiff(["src/routes.ts"], 20);
    expect(shouldEvaluate(diff, {})).toBe(true);
  });

  it("returns true when diff >= 50 lines even if tests passed", () => {
    const diff = buildDiff(["src/routes.ts"], 55);
    expect(shouldEvaluate(diff, { testsPassed: true })).toBe(true);
  });

  // ── Condition 2: dependency bump commit title ─────────────────────

  it("returns false for chore(deps): commit title", () => {
    const diff = buildDiff(["package.json"], 100);
    expect(shouldEvaluate(diff, { commitTitle: "chore(deps): bump lodash to 4.18" })).toBe(false);
  });

  it("returns false for fix(security): commit title", () => {
    const diff = buildDiff(["package-lock.json"], 200);
    expect(shouldEvaluate(diff, { commitTitle: "fix(security): patch CVE-2025-1234" })).toBe(false);
  });

  it("is case-insensitive for dependency bump titles", () => {
    const diff = buildDiff(["package.json"], 100);
    expect(shouldEvaluate(diff, { commitTitle: "CHORE(DEPS): upgrade all" })).toBe(false);
  });

  it("returns true for a regular feat: commit title", () => {
    const diff = buildDiff(["src/feature.ts"], 100);
    expect(shouldEvaluate(diff, { commitTitle: "feat: add new endpoint" })).toBe(true);
  });

  // ── Condition 3: only test files changed ─────────────────────────

  it("returns false when only .test.ts files changed", () => {
    const diff = buildDiff(["src/routes.test.ts", "src/utils.test.ts"], 60);
    expect(shouldEvaluate(diff, {})).toBe(false);
  });

  it("returns false when only .spec.ts files changed", () => {
    const diff = buildDiff(["src/auth.spec.ts"], 60);
    expect(shouldEvaluate(diff, {})).toBe(false);
  });

  it("returns false when only .test.js files changed", () => {
    const diff = buildDiff(["src/helpers.test.js"], 60);
    expect(shouldEvaluate(diff, {})).toBe(false);
  });

  it("returns false when only .spec.jsx files changed", () => {
    const diff = buildDiff(["src/Button.spec.jsx"], 60);
    expect(shouldEvaluate(diff, {})).toBe(false);
  });

  it("returns true when mix of test and non-test files changed", () => {
    const diff = buildDiff(["src/routes.ts", "src/routes.test.ts"], 60);
    expect(shouldEvaluate(diff, {})).toBe(true);
  });

  it("returns true when no file headers are present in diff", () => {
    // A diff with changes but no 'diff --git' header — can't classify as test-only
    const diff = "+some change\n-old line";
    expect(shouldEvaluate(diff, {})).toBe(true);
  });
});

// ── extractAcceptanceCriteria ──────────────────────────────────────

describe("extractAcceptanceCriteria", () => {
  it("extracts checkbox items from acceptance criteria section", () => {
    const body = `## Task\n\nDo something\n\n## Acceptance Criteria\n\n- [ ] Tests pass\n- [ ] Lint clean\n- [x] Already done\n\n## Dependencies`;
    const criteria = extractAcceptanceCriteria(body);
    expect(criteria).toEqual(["Tests pass", "Lint clean", "Already done"]);
  });

  it("returns empty array when no acceptance criteria section", () => {
    const body = "## Task\n\nJust do the thing\n\n## Notes\n\nSome notes";
    expect(extractAcceptanceCriteria(body)).toEqual([]);
  });

  it("handles criteria at end of body (no following section)", () => {
    const body = "## Acceptance Criteria\n\n- [ ] Single criterion";
    const criteria = extractAcceptanceCriteria(body);
    expect(criteria).toEqual(["Single criterion"]);
  });
});

// ── extractExpectedFiles ──────────────────────────────────────────

describe("extractExpectedFiles", () => {
  it("extracts backtick-wrapped file paths from files section", () => {
    const body =
      "## Files to Modify\n\n- `src/routes/users.ts` — add endpoint\n- `src/routes/users.test.ts` — add test";
    const files = extractExpectedFiles(body);
    expect(files).toEqual(["src/routes/users.ts", "src/routes/users.test.ts"]);
  });

  it("returns empty array when no files section", () => {
    const body = "## Task\n\nDo something";
    expect(extractExpectedFiles(body)).toEqual([]);
  });

  it("handles Files to Create variant", () => {
    const body = "## Files to Create\n\n- `src/new-file.ts` — new module";
    const files = extractExpectedFiles(body);
    expect(files).toEqual(["src/new-file.ts"]);
  });
});
