/**
 * Pins `.github/workflows/preview-deploy.yml`'s "Post preview comment" step to
 * the preconditions `scripts/preview-comment.mjs` documents and depends on.
 *
 * Why this file exists at all: `preview-comment.mjs` is one of the exercised
 * paths `scripts/check-workflow-paths-coverage.mjs` ALLOWLISTs — the workflow's
 * `paths:` filter can never fire on a change to it, so a regression in this
 * wiring ships without the preview job ever running. Its sibling helpers
 * (`deploy-ci-precondition.mjs`, `require-deploy-secrets.mjs`,
 * `collect-repo-stats.mjs`, `publish-visual-diffs.mjs`) each already have a
 * test that reads their real workflow; this one had none, so all three of the
 * script's own documented preconditions were unpinned.
 *
 * The one that matters most is the first. The author check in
 * `isPreviewComment` is an **authorization** check, not a lookup convenience:
 * this repo is public, so an author-blind `contains()` lookup lets any
 * commenter pre-post the marker and capture every later run's PATCH — the gap
 * review finding F4 closed in the visual-diff publisher. That protection lives
 * entirely in the `| node scripts/preview-comment.mjs` stage. Delete the stage
 * and go back to a jq-only lookup and nothing goes red: the script's unit
 * tests still pass (it is simply no longer called), the paths-coverage check
 * still passes (the gap is allowlisted), and the hijack path is open again.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { PREVIEW_COMMENT_AUTHOR } from "../preview-comment.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const WORKFLOW = readFileSync(resolve(ROOT, ".github/workflows/preview-deploy.yml"), "utf8");

/** The `run:` body of the step that posts the sticky preview comment. */
function stickyCommentStep() {
  const start = WORKFLOW.indexOf("- name: Post preview comment");
  expect(start, "preview-deploy.yml has a 'Post preview comment' step").toBeGreaterThan(-1);
  // To the next sibling step/job at the same or shallower indentation.
  const rest = WORKFLOW.slice(start + 1);
  const end = rest.search(/\n {0,6}(- name:|[a-z][\w-]*:)/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("preview-deploy.yml's sticky-comment step keeps preview-comment.mjs in the loop", () => {
  it("routes the comment listing through scripts/preview-comment.mjs", () => {
    // The authorization decision. A jq-only `contains()` lookup here is the
    // comment-hijack regression; nothing else in CI would catch it.
    expect(stickyCommentStep()).toMatch(/\|\s*node scripts\/preview-comment\.mjs/);
  });

  it("projects .user.login into the records the script reads", () => {
    // isPreviewComment() compares `comment.login`. If the jq projection stops
    // emitting it, every comment reads as un-authored, the standing comment is
    // never recognised, and each run posts a duplicate instead of updating.
    expect(stickyCommentStep()).toMatch(/login:\s*\.user\.login/);
  });

  it("sets pipefail before the pipe, so a failed listing cannot read as 'no comment'", () => {
    // parseCommentLines() throws on an unparsable line and documents that the
    // throw is loud "under set -euo pipefail in the workflow step". Without it
    // the pipe reports node's status and a broken listing silently becomes a
    // duplicate post. (gotchas.md § CI names this workflow as the reference.)
    const step = stickyCommentStep();
    const pipefail = step.indexOf("set -euo pipefail");
    expect(pipefail, "the step sets `set -euo pipefail`").toBeGreaterThan(-1);
    expect(pipefail, "pipefail must precede the `gh api | node` pipeline it protects").toBeLessThan(
      step.indexOf("node scripts/preview-comment.mjs")
    );
  });

  it("comments as the account PREVIEW_COMMENT_AUTHOR hard-codes", () => {
    // The script pins the author to github-actions[bot], which is only correct
    // while the step authenticates with the default GITHUB_TOKEN. Moving to a
    // PAT or an App changes the login and must move the constant with it.
    expect(PREVIEW_COMMENT_AUTHOR).toBe("github-actions[bot]");
    expect(stickyCommentStep()).toMatch(/GH_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/);
  });
});
