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
import { existsSync, readFileSync } from "node:fs";
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

describe("ai-audit.yml AI split", () => {
  // The predicate cases themselves live in agent-pr.test.mjs (#6380); here we
  // only pin that the workflow delegates to the canonical CLI.
  it("delegates the AI split to the canonical agent-pr CLI, not an inline predicate", () => {
    expect(executable).toContain("node scripts/agent-pr-filter.mjs /tmp/merged-prs.json");
    expect(executable).not.toMatch(/AI_PRS=\$\(jq/);
    expect(executable).not.toContain("worktree-agent-");
  });

  it("the CLI the workflow calls exists", () => {
    expect(existsSync(join(REPO_ROOT, "scripts/agent-pr-filter.mjs"))).toBe(true);
  });

  it("opens the run block with pipefail (its exit codes matter)", () => {
    expect(executable).toContain("set -o pipefail");
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
});
