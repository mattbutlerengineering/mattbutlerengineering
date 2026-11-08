#!/usr/bin/env node

/**
 * Edit-time half of the instruction-budget gate (#8463).
 *
 * `scripts/check-instruction-budget.mjs` only runs in CI's docs-only lane
 * (#8396), so an agent that appends a bullet to `.claude/rules/gotchas.md` or
 * `CLAUDE.md` learns about an overflow a CI round later (#8392, #8397), then
 * compresses by hand under time pressure — which has already dropped a
 * sibling entry's clause (#8399/#8400). This module reuses `BUDGET_BYTES`
 * from the CI script so the two cannot drift apart, and runs only when the
 * edited file is actually one of the two budgeted files.
 *
 * Blocking, not advisory: unlike `changeset-hook.mjs`, an over-budget file is
 * not a judgment call CI will double-check later with more context — it is
 * the exact same byte count the CI script would fail on, computed the same
 * way. Blocking at edit time catches it before a push instead of after.
 *
 * Still fails OPEN on everything that is not that one computation: a file
 * outside the two budgeted paths, an unreadable file, a missing repo root.
 * Those all exit 0 in silence so a broken import or unresolvable git state
 * can never deadlock an edit to an unrelated file.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative as relativePath } from "node:path";

import { BUDGET_BYTES } from "./check-instruction-budget.mjs";

/**
 * Resolve the absolute path a hook receives to a repo-relative one.
 *
 * `BUDGET_BYTES` keys are repo-relative ("CLAUDE.md", ".claude/rules/
 * gotchas.md"), and the hook is always handed an absolute
 * `tool_input.file_path`, so this conversion is the whole hook's
 * load-bearing step — get it wrong and the guard is silently dead for every
 * real edit while still passing every relative-path unit test (the mistake
 * `changeset-hook.mjs` already documents and avoids).
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
 * The byte-budget check for one edited file, pure.
 *
 * @param {string} root - repo root to read the file from
 * @param {string} relativePath - repo-relative path, e.g. "CLAUDE.md"
 * @returns {{ relativePath: string, size: number, limit: number, over: number } | null}
 *   `null` means "not budgeted" or "within budget" or "unreadable" — all
 *   three are the same no-op outcome for this hook.
 */
export function checkBudgetedFile(root, relativePath) {
  if (!(relativePath in BUDGET_BYTES)) return null;
  const limit = BUDGET_BYTES[relativePath];
  try {
    const size = Buffer.byteLength(readFileSync(join(root, relativePath), "utf8"));
    if (size <= limit) return null;
    return { relativePath, size, limit, over: size - limit };
  } catch {
    return null;
  }
}

/** Human-readable line naming the file, its size, and its limit. */
export function formatBudgetMessage({ relativePath, size, limit, over }) {
  return (
    `BLOCK: ${relativePath} is ${size} bytes, ${over} over the ${limit} byte budget ` +
    `(scripts/check-instruction-budget.mjs). Compress an entry or move it to a ` +
    `path-scoped gotchas-*.md sibling before this edit.`
  );
}

/* c8 ignore start -- thin CLI over the pure functions above; exercised by the hook seam test */

/** @returns {string} stdout, or "" on any failure — this hook never throws. */
function git(...args) {
  try {
    return execFileSync("git", args, { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("instruction-budget-hook.mjs");

if (isMain) {
  try {
    const editedPath = (process.argv[2] ?? "").trim();
    // Fail open on every unknown: no path, no resolvable repo root.
    if (!editedPath) process.exit(0);

    const repoRoot = git("rev-parse", "--show-toplevel").trim();
    const relative = toRepoRelativePath(editedPath, repoRoot);

    const violation = checkBudgetedFile(repoRoot || ".", relative);
    if (!violation) process.exit(0);

    // stdout, not stderr: the wrapper forwards this and discards node's own
    // crash output, so a broken import can never spray a stack trace into the
    // stderr surface the model reads on every single edit (same convention as
    // changeset-hook.mjs).
    process.stdout.write(`${formatBudgetMessage(violation)}\n`);
    process.exit(2);
  } catch {
    // Fail open: a broken import or unexpected error must never block an edit.
    process.exit(0);
  }
}
/* c8 ignore stop */
