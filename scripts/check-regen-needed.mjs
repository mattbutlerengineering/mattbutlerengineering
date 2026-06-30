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
 * Prints "full" when `git diff --name-only origin/main...HEAD` intersects the
 * generated-artifact source paths defined in regen-manifest.mjs.
 * Prints "check" when only test files or other non-source paths changed.
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

// Entry point: run git diff and print gating decision.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const files = result.trim().split("\n").filter(Boolean);
  process.stdout.write((needsFullRegen(files) ? "full" : "check") + "\n");
}
