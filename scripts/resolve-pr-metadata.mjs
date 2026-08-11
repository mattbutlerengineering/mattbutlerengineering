#!/usr/bin/env node

/**
 * resolve-pr-metadata.mjs — fetches a PR's title/body/head-sha/base-ref/
 * fork status by number and formats them as GITHUB_OUTPUT lines (#4070).
 *
 * `tier-classifier.yml` needs this on BOTH its trigger paths: a
 * `pull_request` event already carries the full payload, but the
 * `workflow_dispatch` path added for automation PRs (see
 * .claude/rules/gotchas.md § CI) only carries a PR number. Rather than
 * branch the workflow on which fields the event happened to supply, both
 * paths resolve everything from the API by number — one code path, not two
 * that can silently drift out of sync.
 *
 * `formatPrMetadataOutputs` is a pure function, unit-tested without
 * gh/network (scripts/__tests__/resolve-pr-metadata.test.mjs). The CLI below
 * is a thin caller:
 *   node scripts/resolve-pr-metadata.mjs --pr <n> >> "$GITHUB_OUTPUT"
 */

import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/**
 * Formats a `gh pr view --json title,body,headRefOid,baseRefName,isCrossRepository`
 * result as GITHUB_OUTPUT-file lines.
 *
 * Title/body are multiline-safe and attacker-influenceable (a PR title or
 * body is user-controlled text), so they use GITHUB_OUTPUT's `name<<DELIM`
 * heredoc form with a caller-supplied delimiter rather than a single-line
 * `name=value` — a fixed delimiter could be spoofed by a value that happens
 * to contain it, injecting fake extra output lines. The CLI passes a fresh
 * random delimiter per invocation; tests pass a fixed one for a stable
 * expected string.
 *
 * @param {{title?: string, body?: string, headRefOid?: string, baseRefName?: string, isCrossRepository?: boolean}} meta
 * @param {string} delimiter
 * @returns {string}
 */
export function formatPrMetadataOutputs(meta, delimiter) {
  const multiline = (name, value) => `${name}<<${delimiter}\n${value ?? ""}\n${delimiter}`;
  return [
    multiline("title", meta.title),
    multiline("body", meta.body),
    `head_sha=${meta.headRefOid ?? ""}`,
    `base_ref=${meta.baseRefName ?? ""}`,
    `is_fork=${meta.isCrossRepository ?? false}`,
  ].join("\n");
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const pr = readFlag(args, "--pr");
  if (!pr) {
    console.error("Usage: resolve-pr-metadata.mjs --pr <number>");
    process.exit(1);
  }

  const stdout = execFileSync(
    "gh",
    ["pr", "view", pr, "--json", "title,body,headRefOid,baseRefName,isCrossRepository"],
    { encoding: "utf-8" }
  );
  const meta = JSON.parse(stdout);
  console.log(formatPrMetadataOutputs(meta, randomUUID()));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
