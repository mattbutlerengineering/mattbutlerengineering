/**
 * feature:acmm-close-gaps: the Claude workflows that replace Copilot in the
 * ACMM criteria. They run with write access and secrets on comment-driven
 * triggers, so the properties that keep an outsider from steering them are
 * pinned here, not left to review.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkWorkflow } from "../check-action-pins.mjs";

const ROOT = join(import.meta.dirname, "..", "..");
const WORKFLOWS = ["claude.yml", "claude-review-apply.yml"];
const TRUSTED = `contains(fromJSON('["OWNER","MEMBER","COLLABORATOR"]'),`;

function load(name) {
  return readFileSync(join(ROOT, ".github", "workflows", name), "utf8");
}

describe.each(WORKFLOWS)("%s", (name) => {
  const content = load(name);

  it("pins every external action to a commit SHA", () => {
    expect(checkWorkflow(name, content).errors).toEqual([]);
  });

  it("never uses pull_request_target (secrets must not meet fork code)", () => {
    expect(content).not.toMatch(/pull_request_target/);
  });

  it("gates the job on a trusted author_association", () => {
    expect(content).toContain(TRUSTED);
    expect(content).toMatch(/author_association/);
  });

  it("declares explicit permissions and never write-all", () => {
    expect(content).toMatch(/^permissions:/m);
    expect(content).not.toMatch(/write-all/);
  });

  it("takes the key from secrets, never inline", () => {
    expect(content).toMatch(/anthropic_api_key: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
    expect(content).toMatch(
      /claude_code_oauth_token: \$\{\{ secrets\.CLAUDE_CODE_OAUTH_TOKEN \}\}/
    );
  });

  it("bounds runtime with timeout-minutes and serialises per PR/issue", () => {
    expect(content).toMatch(/timeout-minutes: \d+/);
    expect(content).toMatch(/^concurrency:/m);
  });

  it("dispatches CI after pushing (GITHUB_TOKEN pushes never fire ci.yml)", () => {
    expect(content).toMatch(/gh workflow run ci\.yml .*--ref/);
    expect(content).toMatch(/actions: write/);
  });
});

describe("claude.yml triggers", () => {
  it("answers @claude mentions on issue and PR review comments", () => {
    const content = load("claude.yml");
    expect(content).toMatch(/issue_comment:/);
    expect(content).toMatch(/pull_request_review_comment:/);
    expect(content).toContain("@claude");
  });
});

describe("claude-review-apply.yml triggers", () => {
  const content = load("claude-review-apply.yml");

  it("runs on a submitted pull request review", () => {
    expect(content).toMatch(/pull_request_review:/);
    expect(content).toMatch(/types: \[submitted\]/);
  });

  it("only touches PR branches from this repository, never forks", () => {
    expect(content).toContain("github.event.pull_request.head.repo.full_name == github.repository");
  });
});
