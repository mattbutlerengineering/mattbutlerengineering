import { describe, it, expect } from "vitest";
import {
  buildEvaluationPrompt,
  extractAcceptanceCriteria,
  extractExpectedFiles,
} from "../evaluation-prompt-builder.js";

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

describe("buildEvaluationPrompt", () => {
  it("includes the task description and diff", () => {
    const prompt = buildEvaluationPrompt("Add health endpoint", "diff --git a/x b/x\n+code");
    expect(prompt).toContain("Add health endpoint");
    expect(prompt).toContain("diff --git a/x b/x");
    expect(prompt).toContain("Return your evaluation as JSON.");
  });

  it("includes an acceptance criteria section when present", () => {
    const task = "## Acceptance Criteria\n\n- [ ] Endpoint returns 200";
    const prompt = buildEvaluationPrompt(task, "diff");
    expect(prompt).toContain("## Acceptance Criteria (from the issue)");
    expect(prompt).toContain("1. Endpoint returns 200");
  });

  it("includes an expected files section when present", () => {
    const task = "## Files to Modify\n\n- `src/routes.ts`";
    const prompt = buildEvaluationPrompt(task, "diff");
    expect(prompt).toContain("## Expected Files");
    expect(prompt).toContain("`src/routes.ts`");
  });

  it("truncates very large diffs", () => {
    const bigDiff = "x".repeat(60_000);
    const prompt = buildEvaluationPrompt("Task", bigDiff);
    expect(prompt).toContain("... (diff truncated)");
  });
});
