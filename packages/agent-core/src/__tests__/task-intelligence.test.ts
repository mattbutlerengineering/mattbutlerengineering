import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:util", () => ({
  promisify: vi.fn((fn: unknown) => fn),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import {
  resolveSourceFiles,
  resolveBudget,
  resolveModel,
  fetchRecentPrExamples,
  formatPrExamples,
} from "../task-intelligence.js";

// ── resolveSourceFiles ────────────────────────────────────────────────

describe("resolveSourceFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
  });

  it("returns empty array for a task with no file paths", () => {
    const result = resolveSourceFiles("Fix the login bug");
    expect(result).toHaveLength(0);
  });

  it("extracts an explicit apps/ file path from the task", () => {
    const result = resolveSourceFiles("Fix apps/hospitality/src/routes.ts");
    expect(result).toContain("apps/hospitality/src/routes.ts");
  });

  it("extracts an explicit packages/ file path from the task", () => {
    const result = resolveSourceFiles("Update packages/agent-core/src/session-runner.ts");
    expect(result).toContain("packages/agent-core/src/session-runner.ts");
  });

  it("extracts an explicit services/ file path from the task", () => {
    const result = resolveSourceFiles("Modify services/users-api/src/index.ts");
    expect(result).toContain("services/users-api/src/index.ts");
  });

  it("extracts an explicit tools/ file path from the task", () => {
    const result = resolveSourceFiles("Fix tools/mbe/src/cli.ts");
    expect(result).toContain("tools/mbe/src/cli.ts");
  });

  it("infers a test file for each source file", () => {
    const result = resolveSourceFiles("Fix apps/hospitality/src/routes.ts");
    expect(result).toContain("apps/hospitality/src/routes.test.ts");
  });

  it("does not double-infer a test file for an already-test file", () => {
    const result = resolveSourceFiles("Fix apps/hospitality/src/routes.test.ts");
    const testFiles = result.filter((f) => f.endsWith(".test.ts"));
    expect(testFiles).toHaveLength(1);
    expect(result).toContain("apps/hospitality/src/routes.test.ts");
    expect(result).not.toContain("apps/hospitality/src/routes.test.test.ts");
  });

  it("does not infer test file for .spec. files", () => {
    const result = resolveSourceFiles("Fix apps/web/src/auth.spec.ts");
    expect(result).not.toContain("apps/web/src/auth.spec.test.ts");
  });

  it("extracts multiple file paths from one task", () => {
    const task =
      "Update packages/agent-core/src/session-runner.ts and packages/agent-core/src/utils.ts";
    const result = resolveSourceFiles(task);
    expect(result).toContain("packages/agent-core/src/session-runner.ts");
    expect(result).toContain("packages/agent-core/src/utils.ts");
  });

  it("adds CLAUDE.md for services/ directory references", () => {
    const result = resolveSourceFiles("Fix something in services/users-api/");
    expect(result).toContain("services/users-api/CLAUDE.md");
  });

  it("adds CLAUDE.md for apps/ directory references", () => {
    const result = resolveSourceFiles("Fix something in apps/hospitality/");
    expect(result).toContain("apps/hospitality/CLAUDE.md");
  });

  it("does not add CLAUDE.md for packages/ directory references", () => {
    const result = resolveSourceFiles("Fix something in packages/agent-core/");
    expect(result).not.toContain("packages/agent-core/CLAUDE.md");
  });

  it("includes context file when existsSync returns true for test keyword", () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === ".agent/contexts/testing-patterns.md"
    );
    const result = resolveSourceFiles("Add vitest tests for the new module");
    expect(result).toContain(".agent/contexts/testing-patterns.md");
  });

  it("excludes context file when existsSync returns false", () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = resolveSourceFiles("Add tests for the module");
    expect(result).not.toContain(".agent/contexts/testing-patterns.md");
  });

  it("includes security context for security keyword", () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === ".agent/contexts/security-audit.md"
    );
    const result = resolveSourceFiles("Security audit of the auth system");
    expect(result).toContain(".agent/contexts/security-audit.md");
  });

  it("includes dependency context for bump keyword", () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === ".agent/contexts/dependency-bump.md"
    );
    const result = resolveSourceFiles("Bump lodash dependency");
    expect(result).toContain(".agent/contexts/dependency-bump.md");
  });

  it("includes deploy context for deploy keyword", () => {
    vi.mocked(existsSync).mockImplementation(
      (p) => String(p) === ".agent/contexts/deploy-fixes.md"
    );
    const result = resolveSourceFiles("Fix the deploy pipeline");
    expect(result).toContain(".agent/contexts/deploy-fixes.md");
  });

  it("returns unique file paths (no duplicates)", () => {
    const task = "Fix apps/hospitality/src/routes.ts and apps/hospitality/src/routes.ts";
    const result = resolveSourceFiles(task);
    const unique = new Set(result);
    expect(unique.size).toBe(result.length);
  });

  it("extracts backtick-wrapped file paths", () => {
    const result = resolveSourceFiles("Fix `apps/hospitality/src/routes.ts` for the bug");
    expect(result).toContain("apps/hospitality/src/routes.ts");
  });
});

// ── resolveBudget ─────────────────────────────────────────────────────

describe("resolveBudget", () => {
  it("returns simple budget for lint tasks", () => {
    const result = resolveBudget("Fix lint errors in the codebase");
    expect(result.budgetUsd).toBe(0.5);
    expect(result.maxTurns).toBe(30);
    expect(result.reason).toBe("simple fix");
  });

  it("returns simple budget for typo fixes", () => {
    const result = resolveBudget("Fix typo in README");
    expect(result.budgetUsd).toBe(0.5);
  });

  it("returns simple budget for rename tasks", () => {
    const result = resolveBudget("Rename the function to camelCase");
    expect(result.budgetUsd).toBe(0.5);
  });

  it("returns simple budget for bump tasks", () => {
    const result = resolveBudget("Bump lodash to 4.18");
    expect(result.budgetUsd).toBe(0.5);
  });

  it("returns simple budget for fix import tasks", () => {
    const result = resolveBudget("Fix import paths in module");
    expect(result.budgetUsd).toBe(0.5);
  });

  it("returns complex budget for feature tasks", () => {
    const result = resolveBudget("feat: add new user authentication flow");
    expect(result.budgetUsd).toBe(2.0);
    expect(result.maxTurns).toBe(75);
    expect(result.reason).toBe("complex feature");
  });

  it("returns complex budget for implement tasks", () => {
    const result = resolveBudget("Implement the new reservation system");
    expect(result.budgetUsd).toBe(2.0);
  });

  it("returns complex budget for architect tasks", () => {
    const result = resolveBudget("Architect the event-driven messaging layer");
    expect(result.budgetUsd).toBe(2.0);
  });

  it("returns complex budget for migration tasks", () => {
    const result = resolveBudget("Migration from Prisma 6 to Prisma 7");
    expect(result.budgetUsd).toBe(2.0);
  });

  it("returns standard budget for fix tasks", () => {
    const result = resolveBudget("Fix the broken API endpoint");
    expect(result.budgetUsd).toBe(1.0);
    expect(result.maxTurns).toBe(50);
    expect(result.reason).toBe("standard task");
  });

  it("returns standard budget for refactor tasks", () => {
    const result = resolveBudget("Refactor the session runner module");
    expect(result.budgetUsd).toBe(1.0);
  });

  it("returns standard budget for add test tasks", () => {
    const result = resolveBudget("Add test coverage for the auth module");
    expect(result.budgetUsd).toBe(1.0);
  });

  it("returns standard budget as default when no signals match", () => {
    const result = resolveBudget("Do the thing");
    expect(result.budgetUsd).toBe(1.0);
    expect(result.maxTurns).toBe(50);
  });

  it("complex takes precedence over simple when both keywords present", () => {
    // "feat" is complex, "lint" is simple — complex checked first
    const result = resolveBudget("feat: fix lint issues");
    expect(result.budgetUsd).toBe(2.0);
  });
});

// ── resolveModel ──────────────────────────────────────────────────────

describe("resolveModel", () => {
  it("returns haiku for lint tasks", () => {
    const result = resolveModel("Fix lint errors");
    expect(result).toBe("claude-haiku-4-5-20251001");
  });

  it("returns haiku for typo tasks", () => {
    const result = resolveModel("Fix typo in comment");
    expect(result).toBe("claude-haiku-4-5-20251001");
  });

  it("returns haiku for rename tasks", () => {
    const result = resolveModel("Rename the variable to snakeCase");
    expect(result).toBe("claude-haiku-4-5-20251001");
  });

  it("returns haiku for bump tasks", () => {
    const result = resolveModel("Bump zod to 3.24");
    expect(result).toBe("claude-haiku-4-5-20251001");
  });

  it("returns sonnet for complex feature tasks", () => {
    const result = resolveModel("Implement the new dashboard widget");
    expect(result).toBe("claude-sonnet-4-6");
  });

  it("returns sonnet for migration tasks", () => {
    const result = resolveModel("Migration from REST to GraphQL");
    expect(result).toBe("claude-sonnet-4-6");
  });

  it("returns sonnet as default for standard tasks", () => {
    const result = resolveModel("Fix the broken endpoint");
    expect(result).toBe("claude-sonnet-4-6");
  });

  it("returns sonnet when no keywords match", () => {
    const result = resolveModel("Do a thing");
    expect(result).toBe("claude-sonnet-4-6");
  });
});

// ── fetchRecentPrExamples ─────────────────────────────────────────────

describe("fetchRecentPrExamples", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns parsed PR examples on success", async () => {
    const prData = { title: "fix: auth bug", body: "Fixes the login", filesChanged: 3 };
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout: JSON.stringify(prData) });

    const result = await fetchRecentPrExamples("/repo");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("fix: auth bug");
    expect(result[0].filesChanged).toBe(3);
  });

  it("returns multiple PR examples when multiple JSON lines returned", async () => {
    const pr1 = { title: "fix: bug one", body: "Fix 1", filesChanged: 2 };
    const pr2 = { title: "feat: feature", body: "New feature", filesChanged: 5 };
    const stdout = `${JSON.stringify(pr1)}\n${JSON.stringify(pr2)}`;
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout });

    const result = await fetchRecentPrExamples("/repo");

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("fix: bug one");
    expect(result[1].title).toBe("feat: feature");
  });

  it("returns empty array when gh command fails", async () => {
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockRejectedValue(new Error("gh: command not found"));

    const result = await fetchRecentPrExamples("/repo");

    expect(result).toEqual([]);
  });

  it("returns empty array when stdout is empty", async () => {
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout: "" });

    const result = await fetchRecentPrExamples("/repo");

    expect(result).toEqual([]);
  });

  it("filters out PRs with empty titles (malformed JSON lines)", async () => {
    const validPr = { title: "fix: real PR", body: "Body", filesChanged: 1 };
    const invalidLine = "not-json";
    const stdout = `${JSON.stringify(validPr)}\n${invalidLine}`;
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout });

    const result = await fetchRecentPrExamples("/repo");

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("fix: real PR");
  });

  it("respects custom limit parameter", async () => {
    vi.mocked(
      execFile as unknown as (...args: unknown[]) => Promise<{ stdout: string }>
    ).mockResolvedValue({ stdout: "" });

    await fetchRecentPrExamples("/repo", 5);

    expect(execFile).toHaveBeenCalledWith(
      "gh",
      expect.arrayContaining(["--limit", "5"]),
      expect.any(Object),
      expect.any(Function)
    );
  });
});

// ── formatPrExamples ──────────────────────────────────────────────────

describe("formatPrExamples", () => {
  it("returns empty string for empty examples array", () => {
    expect(formatPrExamples([])).toBe("");
  });

  it("includes section header for non-empty examples", () => {
    const examples = [{ title: "fix: auth bug", body: "Fixes login", filesChanged: 2 }];
    const result = formatPrExamples(examples);
    expect(result).toContain("## Recent Successful PRs (follow this style)");
  });

  it("formats a single example with title and file count", () => {
    const examples = [{ title: "fix: auth bug", body: "Fixes login", filesChanged: 2 }];
    const result = formatPrExamples(examples);
    expect(result).toContain("### Example 1: fix: auth bug");
    expect(result).toContain("Files changed: 2");
    expect(result).toContain("Fixes login");
  });

  it("formats multiple examples with incrementing numbers", () => {
    const examples = [
      { title: "fix: bug one", body: "Fix 1", filesChanged: 1 },
      { title: "feat: new thing", body: "Feature", filesChanged: 7 },
    ];
    const result = formatPrExamples(examples);
    expect(result).toContain("### Example 1: fix: bug one");
    expect(result).toContain("### Example 2: feat: new thing");
  });
});
