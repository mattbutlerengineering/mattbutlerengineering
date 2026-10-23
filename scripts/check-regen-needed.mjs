#!/usr/bin/env node
/**
 * check-regen-needed.mjs — Print "full" or "check" for pnpm regen gating.
 *
 * Usage (implement-queue worker):
 *   REGEN_MODE=$(node scripts/check-regen-needed.mjs)
 *   if [ "$REGEN_MODE" = "full" ]; then
 *     pnpm regen               # diff touches generated-artifact sources
 *   else
 *     pnpm regen --check       # fast path: test-only or unrelated changes
 *   fi
 *
 * Prints "full" when the change set intersects the generated-artifact source
 * paths defined in regen-manifest.mjs; "check" when only test files or other
 * non-source paths changed.
 *
 * The change set is the UNION of committed (`origin/main...HEAD`), staged
 * (`--cached`), unstaged, and untracked files — not just the committed range.
 * #7263 measured the committed-only version answering "check" on an
 * uncommitted packages/types edit that a full regen then proved drifted four
 * artifacts: a worker that asks before committing must not be handed the
 * fast path. Fail closed: if any git query errors, answer "full".
 *
 * The source list (REGEN_SOURCE_PREFIXES / REGEN_SOURCE_EXCLUDES) is the
 * canonical definition in regen-manifest.mjs — do not duplicate it here.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REGEN_SOURCE_PREFIXES, REGEN_SOURCE_EXCLUDES } from "./regen-manifest.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/**
 * Returns true if any file in `changedFiles` is a generated-artifact source:
 * a path that, when changed, could cause `pnpm regen` to produce different output.
 *
 * Two branches:
 *   empty intersection → returns false → caller should run `pnpm regen --check`
 *   non-empty intersection → returns true → caller should run `pnpm regen` (full)
 *
 * @param {string[]} changedFiles - File paths relative to repo root.
 * @returns {boolean}
 */
export function needsFullRegen(changedFiles) {
  return changedFiles.some(
    (f) =>
      REGEN_SOURCE_PREFIXES.some((prefix) => f.startsWith(prefix)) &&
      !REGEN_SOURCE_EXCLUDES.some((re) => re.test(f))
  );
}

/** The git queries whose union is the change set. Exported for the test. */
export const CHANGE_SET_GIT_ARGS = [
  ["diff", "--name-only", "origin/main...HEAD"], // committed on the branch
  ["diff", "--name-only", "--cached"], // staged
  ["diff", "--name-only"], // unstaged edits to tracked files
  ["ls-files", "--others", "--exclude-standard"], // untracked
];

/**
 * Collects the union of all four change sources. `runGit` takes a git argv
 * array and returns stdout; any throw means the change set cannot be proven
 * complete, so the caller must treat the answer as "full" (fail closed).
 *
 * @param {(args: string[]) => string} runGit
 * @returns {string[]}
 */
export function collectChangedFiles(runGit) {
  const files = new Set();
  for (const args of CHANGE_SET_GIT_ARGS) {
    for (const line of runGit(args).trim().split("\n")) {
      if (line) files.add(line);
    }
  }
  return [...files];
}

// Entry point: gather the change set and print the gating decision.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let decision;
  try {
    const files = collectChangedFiles((args) =>
      execFileSync("git", args, { cwd: ROOT, encoding: "utf8" })
    );
    decision = needsFullRegen(files) ? "full" : "check";
  } catch {
    decision = "full"; // change set unknowable -> never hand out the fast path
  }
  process.stdout.write(decision + "\n");
}
