import { describe, it, expect } from "vitest";
import { buildEntry, extractViolations, shouldFailBuild } from "../process-a11y-results.mjs";

const AGENT_BRANCH = "worktree-agent-abc123";
const HUMAN_BRANCH = "feat/new-component";

const PASSING_RESULTS = {
  numTotalTests: 28,
  numPassedTests: 28,
  numFailedTests: 0,
  testResults: [],
};

const FAILING_RESULTS = {
  numTotalTests: 28,
  numPassedTests: 27,
  numFailedTests: 1,
  testResults: [
    {
      assertionResults: [
        {
          status: "failed",
          fullName: "Accessibility — General Components Button",
          failureMessages: ["Expected no violations but found 1: aria-label"],
        },
        {
          status: "passed",
          fullName: "Accessibility — General Components Alert",
          failureMessages: [],
        },
      ],
    },
  ],
};

describe("extractViolations", () => {
  it("returns empty array when all tests pass", () => {
    const violations = extractViolations(PASSING_RESULTS);
    expect(violations).toHaveLength(0);
  });

  it("extracts failed tests as violations", () => {
    const violations = extractViolations(FAILING_RESULTS);
    expect(violations).toHaveLength(1);
    expect(violations[0].name).toBe("Accessibility — General Components Button");
    expect(violations[0].error).toContain("aria-label");
  });
});

describe("buildEntry", () => {
  it("marks agent branches as isAgent=true", () => {
    const entry = buildEntry(PASSING_RESULTS, AGENT_BRANCH, "github-actions[bot]");
    expect(entry.isAgent).toBe(true);
    expect(entry.branch).toBe(AGENT_BRANCH);
  });

  it("marks human branches as isAgent=false", () => {
    const entry = buildEntry(PASSING_RESULTS, HUMAN_BRANCH, "matt");
    expect(entry.isAgent).toBe(false);
  });

  it("marks actor with 'bot' suffix as agent", () => {
    const entry = buildEntry(PASSING_RESULTS, HUMAN_BRANCH, "dependabot[bot]");
    expect(entry.isAgent).toBe(true);
  });

  it("includes violation count in the entry", () => {
    const entry = buildEntry(FAILING_RESULTS, AGENT_BRANCH, "github-actions[bot]");
    expect(entry.numFailures).toBe(1);
    expect(entry.violations).toHaveLength(1);
  });

  it("includes a timestamp", () => {
    const entry = buildEntry(PASSING_RESULTS, AGENT_BRANCH, "github-actions[bot]");
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("shouldFailBuild", () => {
  it("returns false when all tests pass on an agent branch", () => {
    const entry = buildEntry(PASSING_RESULTS, AGENT_BRANCH, "github-actions[bot]");
    expect(shouldFailBuild(entry)).toBe(false);
  });

  it("returns true when there are failures on an agent branch", () => {
    const entry = buildEntry(FAILING_RESULTS, AGENT_BRANCH, "github-actions[bot]");
    expect(shouldFailBuild(entry)).toBe(true);
  });

  it("returns false when there are failures on a human branch", () => {
    const entry = buildEntry(FAILING_RESULTS, HUMAN_BRANCH, "matt");
    expect(shouldFailBuild(entry)).toBe(false);
  });
});
