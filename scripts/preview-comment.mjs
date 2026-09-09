#!/usr/bin/env node

/**
 * preview-comment.mjs — the sticky-comment lookup for
 * `.github/workflows/preview-deploy.yml`'s "Post preview comment" step.
 *
 * The workflow's jq does projection only (`{id, body, login: .user.login}`,
 * one JSON object per line); the *decision* of which comment is the standing
 * one lives here, where it is unit-tested — the same split
 * `publish-visual-diffs.mjs` uses for the visual-diff comment (review
 * finding F4).
 */

import { fileURLToPath } from "node:url";

/** The substring the workflow's comment body has always been found by. */
export const PREVIEW_COMMENT_MARKER = "Preview Deployed";

/**
 * The account the workflow's `GH_TOKEN: ${{ github.token }}` comments as, and
 * therefore the only account whose comment may be treated as the standing one.
 * Confirmed against a live preview comment (PR #4642, comment 5456217055:
 * `user.login == "github-actions[bot]"`). If the step ever moves to a PAT or
 * an App, this constant moves with it — failing that way is loud (the run
 * stops recognising its own comment and posts a second one); failing the
 * other way is not.
 */
export const PREVIEW_COMMENT_AUTHOR = "github-actions[bot]";

/**
 * Pure: is this comment the workflow's own standing preview comment?
 *
 * The author half is an **authorization** check, not a lookup convenience:
 * this repo is public, so anyone who can comment can pre-post a body
 * containing the marker, and an author-blind lookup hands them every later
 * run's PATCH — the bot's output lands in a comment under their authorship
 * and control. Same gap review finding F4 closed in the visual-diff
 * publisher (`publish-visual-diffs.mjs`'s `isStandingComment`).
 *
 * @param {{login?: unknown, body?: unknown}|null|undefined} comment
 * @returns {boolean}
 */
export function isPreviewComment(comment) {
  return (
    comment?.login === PREVIEW_COMMENT_AUTHOR &&
    typeof comment.body === "string" &&
    comment.body.includes(PREVIEW_COMMENT_MARKER)
  );
}

/**
 * Pure: the id of the standing preview comment, or `null`.
 *
 * First match wins, preserving the workflow's original "oldest comment"
 * semantics (the comments endpoint returns ascending `created_at`).
 *
 * @param {Array<{id?: unknown, login?: unknown, body?: unknown}>|null|undefined} comments
 * @returns {number|null}
 */
export function findPreviewCommentId(comments) {
  const match = (comments ?? []).find(isPreviewComment);
  return match?.id ?? null;
}

/**
 * Pure: one `{id, body, login}` record per non-blank NDJSON line.
 *
 * Throws on an unparsable line — under `set -euo pipefail` in the workflow
 * step that makes the step fail loudly instead of silently treating a broken
 * listing as "no existing comment" and posting a duplicate.
 *
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseCommentLines(text) {
  return String(text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const id = findPreviewCommentId(parseCommentLines(input));
  if (id !== null) process.stdout.write(`${id}\n`);
}
