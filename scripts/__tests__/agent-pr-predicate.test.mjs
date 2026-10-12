/**
 * Table test for the one canonical agent-PR predicate (#6380).
 *
 * Five call sites used to carry five divergent copies of this rule
 * (collect-queue-efficiency `isAiPr`, collect-queue-telemetry-from-github
 * `isAgentPr`, plugins/acmm pr-outcomes `isAgentPr`, ai-audit.yml inline jq,
 * collect-repo-stats label-only query). Each row below is a PR shape on which
 * at least two of those copies disagreed; the expected answer is the agreed one:
 * the #5852 rule — `agent-authored` label OR an agent branch prefix, minus
 * bookkeeping/automation PRs.
 */
import { describe, it, expect } from "vitest";
import { AGENT_LABEL, isAgentPr, isBookkeepingPr } from "../../plugins/acmm/scripts/agent-pr.js";

/** @type {Array<[string, object, boolean]>} */
const ROWS = [
  ["label only", { headRefName: "fix/x", labels: [{ name: "agent-authored" }] }, true],
  ["label only, string labels", { headRefName: "fix/x", labels: ["agent-authored"] }, true],
  ["worktree-agent- branch", { headRefName: "worktree-agent-ab12", labels: [] }, true],
  ["agent- branch", { headRefName: "agent-thing", labels: [] }, true],
  ["fix/agent- branch", { headRefName: "fix/agent-thing", labels: [] }, true],
  ["feat/agent- branch", { headRefName: "feat/agent-thing", labels: [] }, true],
  [
    "has-pr alone is not agent work (#5852)",
    { headRefName: "fix/issue-1", labels: ["has-pr"] },
    false,
  ],
  ["human PR", { headRefName: "feat/manual", labels: [{ name: "feature" }] }, false],
  ["null branch, no labels", { headRefName: null, labels: [] }, false],
  ["missing labels and branch", {}, false],
  [
    "mislabeled bookkeeping branch",
    { headRefName: "chore/acmm-daily-audit-1", labels: ["agent-authored"] },
    false,
  ],
  [
    "metrics branch with has-pr + label",
    { headRefName: "metrics/x", labels: [{ name: "has-pr" }, { name: "agent-authored" }] },
    false,
  ],
  [
    "bot author (gh {login} shape)",
    { headRefName: "bump", labels: ["agent-authored"], author: { login: "app/dependabot" } },
    false,
  ],
  [
    "bot author (string shape)",
    { headRefName: "bump", labels: ["agent-authored"], author: "github-actions[bot]" },
    false,
  ],
  [
    "the coding agent itself is not bookkeeping",
    { headRefName: "fix/y", labels: ["agent-authored"], author: { login: "app/claude" } },
    true,
  ],
];

describe("isAgentPr (canonical)", () => {
  it.each(ROWS)("%s", (_name, pr, expected) => {
    expect(isAgentPr(pr)).toBe(expected);
  });

  it("exports the label constant call sites query by", () => {
    expect(AGENT_LABEL).toBe("agent-authored");
  });

  it("isBookkeepingPr flags automation branches", () => {
    expect(isBookkeepingPr({ headRefName: "dependabot/npm/x" })).toBe(true);
    expect(isBookkeepingPr({ headRefName: "fix/x" })).toBe(false);
  });
});
