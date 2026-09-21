#!/usr/bin/env node

/**
 * Edit-time half of the rialto changeset gate.
 *
 * `.claude/hooks/check-changeset.sh` used to warn when you edited a
 * published package with "no changeset in .changeset/" — counting *every*
 * pending entry in the directory. That made it dead the moment the release
 * queue stopped being drained: the count last hit zero around 2026-07-13,
 * and by 2026-09-21 thirty-five pending changesets sat there permanently, so
 * `count == 0` was unreachable and the hook had been silent for two months
 * while 65 commits touched `packages/rialto/src`.
 *
 * `check-rialto-changeset.mjs` — the CI-side gate — had already written down
 * why that rule is wrong: "Pre-existing pending changesets do NOT count:
 * only files added/modified in the diff, otherwise every PR free-rides on
 * someone else's pending entry." Nobody carried the correction back to the
 * hook. This module is that correction: the hook now asks the same question
 * CI asks, against the same pure functions, so there is one rule with two
 * call sites instead of two rules that disagree.
 *
 * Failure direction is deliberately the opposite of CI's. The CI gate fails
 * CLOSED (an unresolvable base is a FAIL) because a silently skipped merge
 * gate reads exactly like a green one. This hook fails OPEN — any git error,
 * missing base, or unreadable file exits 0 in silence — because it is an
 * advisory printed while you type, it blocks nothing, and CI still catches
 * the real thing. A hook that errors on every edit in a detached worktree
 * would be turned off within a day, and then the advisory is worth zero.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, relative as relativePath } from "node:path";

import { isRialtoReleaseSource, evaluateRialtoChangesetGate } from "./check-rialto-changeset.mjs";

/** `.changeset/README.md` is documentation, never a changeset. */
const isChangesetEntry = (path) =>
  path.startsWith(".changeset/") && path.endsWith(".md") && !path.endsWith("README.md");

/**
 * The changeset files that belong to the change in progress.
 *
 * At edit time "the diff" is not one thing: part of it is committed on the
 * branch, part is staged, part is unstaged, and a brand-new changeset is
 * usually still untracked. All four are the author's own work on this
 * change, so all four count — and nothing else in `.changeset/` does, which
 * is the whole point of the fix.
 *
 * @param {object} input - Raw `git` path lists, each newline-joined.
 * @param {string} [input.committedSinceBase] - `diff --diff-filter=AM base..HEAD`
 * @param {string} [input.staged] - `diff --cached --name-only`
 * @param {string} [input.unstaged] - `diff --name-only`
 * @param {string} [input.untracked] - `ls-files --others --exclude-standard`
 * @returns {string[]} Deduped changeset paths, in stable sorted order.
 */
export function collectInProgressChangesets({
  committedSinceBase = "",
  staged = "",
  unstaged = "",
  untracked = "",
} = {}) {
  const all = [committedSinceBase, staged, unstaged, untracked]
    .flatMap((block) => block.split("\n"))
    .map((line) => line.trim())
    .filter(isChangesetEntry);
  return [...new Set(all)].sort();
}

/**
 * Resolve the absolute path a hook receives to a repo-relative one.
 *
 * `isRialtoReleaseSource` matches repo-relative paths, and the hook is always
 * handed an absolute `tool_input.file_path`, so this conversion is the whole
 * hook's load-bearing step — get it wrong and the advisory is silently dead
 * for every real edit while still passing every relative-path unit test.
 *
 * A naive `startsWith(repoRoot)` is not enough on macOS: `git rev-parse
 * --show-toplevel` reports the *realpath* (`/private/var/…`) while the path
 * arriving from the harness can still carry the `/var/…` symlink, so the
 * prefix never matches and every edit resolves to "not rialto source". Both
 * sides are realpath'd before comparing. A path outside the repo is returned
 * unchanged, which then fails the surface check — the safe direction for an
 * advisory.
 *
 * @param {string} editedPath - absolute or already-relative path
 * @param {string} repoRoot - `git rev-parse --show-toplevel`, may be ""
 * @param {(p: string) => string} [resolve] - realpath, injectable for tests
 * @returns {string} repo-relative path, or the input unchanged
 */
export function toRepoRelativePath(editedPath, repoRoot, resolve = defaultRealpath) {
  if (!editedPath || !isAbsolute(editedPath) || !repoRoot) return editedPath;
  const rel = relativePath(resolve(repoRoot), resolve(editedPath));
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : editedPath;
}

/** realpath that degrades to the input rather than throwing. */
function defaultRealpath(candidate) {
  try {
    return realpathSync(candidate);
  } catch {
    return candidate;
  }
}

/**
 * The advisory, as a pure decision.
 *
 * @param {object} input
 * @param {string} input.editedPath - repo-relative path just written
 * @param {{ path: string, content: string }[]} input.changesets -
 *   the in-progress changesets from `collectInProgressChangesets`
 * @returns {{ warn: boolean }} `warn: true` means print the advisory.
 */
export function evaluateEditTimeChangeset({ editedPath, changesets }) {
  if (!isRialtoReleaseSource(editedPath)) return { warn: false };
  const { findings } = evaluateRialtoChangesetGate({
    changedFiles: [editedPath],
    changesets,
  });
  return { warn: findings.length > 0 };
}

export const WARNING =
  "💡 This edit changes rialto's published source, and this change adds no changeset.\n" +
  "   Consumers get it on the next publish; without one the changelog documents none of it.\n" +
  "   pnpm changeset          # describe the change; pick rialto + the bump\n" +
  "   pnpm changeset --empty  # explicitly declare no consumer-visible change\n" +
  "   (Pending changesets from other PRs do not cover this one — CI checks the same rule.)";

/* c8 ignore start -- thin CLI over the pure functions above; exercised by the hook seam test */

/** @returns {string} stdout, or "" on any failure — this hook never throws. */
function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("changeset-hook.mjs");

if (isMain) {
  const editedPath = (process.argv[2] ?? "").trim();
  // Fail open on every unknown: no path, not our surface, no resolvable base.
  if (!editedPath) process.exit(0);

  const repoRoot = git("rev-parse", "--show-toplevel").trim();
  const relative = toRepoRelativePath(editedPath, repoRoot);

  if (!isRialtoReleaseSource(relative)) process.exit(0);

  const base = git("merge-base", "HEAD", "origin/main").trim();
  const changesetPaths = collectInProgressChangesets({
    committedSinceBase: base
      ? git("diff", "--name-only", "--diff-filter=AM", base, "HEAD", "--", ".changeset")
      : "",
    staged: git("diff", "--cached", "--name-only", "--", ".changeset"),
    unstaged: git("diff", "--name-only", "--", ".changeset"),
    untracked: git("ls-files", "--others", "--exclude-standard", "--", ".changeset"),
  });

  const changesets = changesetPaths.flatMap((path) => {
    try {
      return [{ path, content: readFileSync(`${repoRoot || "."}/${path}`, "utf-8") }];
    } catch {
      return [];
    }
  });

  const { warn } = evaluateEditTimeChangeset({ editedPath: relative, changesets });
  // stdout, not stderr: the wrapper forwards this and discards node's own
  // crash output, so a broken import can never spray a stack trace into the
  // stderr surface the model reads on every single edit.
  if (warn) process.stdout.write(`${WARNING}\n`);
  process.exit(0);
}
/* c8 ignore stop */
