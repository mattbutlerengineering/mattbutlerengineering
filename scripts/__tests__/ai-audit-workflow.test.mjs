/**
 * Regression tests for the AI audit trail's PR population.
 *
 * The 2026-W34 audit (#4295) reported 21 AI PRs out of 30 merged, all of them
 * `+1/-0` metrics-commit automation. The real window held 170 merged PRs and
 * 98 AI-authored ones, including 11 carrying `tier:sensitive` — among them
 * #4267 (auth ownership) and #4268 (guest-data exposure). Two independent
 * defects produced that:
 *
 *   1. The query narrowed on `--label "has-pr"`. `has-pr` is an ISSUE-state
 *      label from the coordination machine; the only PRs carrying it are the
 *      metrics automation, so every substantive agent PR was omitted.
 *   2. Neither `gh pr list` passed `--limit`, so both numerator and
 *      denominator silently truncated at gh's default of 30.
 *
 * Both failed toward reassurance: the checklist item "review any
 * security-sensitive AI changes" was answered by a list containing none.
 *
 * These tests read the real workflow file and execute its real jq predicate,
 * so a regression in either has to break them.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ai-audit.yml");
const workflow = readFileSync(WORKFLOW_PATH, "utf-8");

/**
 * The workflow with comment-only lines removed.
 *
 * The shape assertions below must judge what the step RUNS, not what it
 * explains. Both defects being guarded against are described in comments that
 * quote the old broken code verbatim — asserting over the raw file makes the
 * explanation itself fail the gate, which would pressure the next author to
 * delete the explanation to get green.
 */
const executable = workflow
  .split("\n")
  .filter((line) => !/^\s*#/.test(line))
  .join("\n");

/**
 * Pull the AI-split jq program out of the workflow so the test exercises the
 * shipped predicate rather than a copy that can drift away from it.
 *
 * @returns {string}
 */
function extractAiPredicate() {
  const match = workflow.match(/AI_PRS=\$\(jq '([\s\S]*?)'\s+\/tmp\/merged-prs\.json\)/);
  if (!match) throw new Error("AI_PRS jq predicate not found in ai-audit.yml");
  return match[1];
}

/**
 * Run the workflow's own predicate over fixture PRs.
 *
 * @param {unknown[]} prs
 * @returns {number[]} PR numbers the predicate selected
 */
function selectAiPrs(prs) {
  const out = execFileSync("jq", [`${extractAiPredicate()} | [.[].number]`], {
    input: JSON.stringify(prs),
    encoding: "utf-8",
  });
  return JSON.parse(out);
}

const pr = (number, { labels = [], headRefName = "some/branch" } = {}) => ({
  number,
  headRefName,
  labels: labels.map((name) => ({ name })),
  additions: 1,
  deletions: 0,
});

describe("ai-audit.yml AI predicate", () => {
  it("selects a PR carrying the agent-authored label", () => {
    expect(selectAiPrs([pr(1, { labels: ["agent-authored", "tier:sensitive"] })])).toEqual([1]);
  });

  it("still selects the legacy has-pr coordination label", () => {
    expect(selectAiPrs([pr(2, { labels: ["has-pr"] })])).toEqual([2]);
  });

  it("selects worker branch names", () => {
    const prs = [
      pr(3, { headRefName: "worktree-agent-abc123" }),
      pr(4, { headRefName: "agent-thing" }),
      pr(5, { headRefName: "fix/agent-thing" }),
      pr(6, { headRefName: "feat/agent-thing" }),
    ];
    expect(selectAiPrs(prs)).toEqual([3, 4, 5, 6]);
  });

  it("excludes a human PR with no AI label and no worker branch", () => {
    expect(selectAiPrs([pr(7, { labels: ["tier:standard"], headRefName: "fix/typo" })])).toEqual(
      []
    );
  });

  it("does not crash on a PR with no labels and a null branch", () => {
    expect(selectAiPrs([{ number: 8, labels: [], headRefName: null }])).toEqual([]);
  });

  it("keeps a tier:sensitive agent PR — the exact population #4295 omitted", () => {
    const prs = [
      pr(4267, { labels: ["agent-authored", "tier:sensitive"], headRefName: "fix/4262-email" }),
      pr(4283, { labels: ["has-pr", "tier:trivial"], headRefName: "chore/queue-telemetry" }),
    ];
    expect(selectAiPrs(prs)).toEqual([4267, 4283]);
  });
});

describe("ai-audit.yml query shape", () => {
  it("every gh pr list passes an explicit --limit", () => {
    const invocations = executable.split("gh pr list").slice(1);
    expect(invocations.length).toBeGreaterThan(0);
    for (const body of invocations) {
      // Only inspect the invocation itself, not the rest of the file.
      expect(body.slice(0, 400)).toContain("--limit");
    }
  });

  it("does not narrow the merged-PR query to a single label", () => {
    expect(executable).not.toContain('--label "has-pr"');
  });

  it("the AI split covers all three legs of the repo's canonical predicate", () => {
    const predicate = extractAiPredicate();
    expect(predicate).toContain("agent-authored");
    expect(predicate).toContain("has-pr");
    expect(predicate).toContain("worktree-agent-");
  });
});
