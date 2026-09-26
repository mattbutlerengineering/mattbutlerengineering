#!/usr/bin/env node

/**
 * check-large-files.mjs — the ">800 lines" large-file heuristic used by
 * `auto-review.yml`, as a pure, testable module (#5786).
 *
 * The check used to run entirely as inline bash inside the workflow and had
 * no way to exempt a file from it. `.claude/improvement-loop/log.md` is an
 * append-only daily run log (CLAUDE.md § `.claude/improvement-loop/`) whose
 * whole purpose is to grow — it trips this warning on every routine log PR,
 * and "split into smaller, focused modules" (the check's own suggested fix)
 * does not apply to a log. A warning that fires on every PR of a class and
 * is correctly ignored every time trains readers to skim past auto-review
 * output altogether, including findings that do matter.
 *
 * `APPEND_ONLY_LOGS` is a narrow, explicit exemption list — not a blanket
 * `.md` carve-out — so a genuinely oversized markdown file (or any other
 * file) still gets flagged.
 *
 * Usage:
 *   node scripts/check-large-files.mjs < /tmp/changed-files.txt
 *   (reads one file path per line; prints "- `path` (N lines)" for each
 *   qualifying file, or nothing when none qualify)
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const LARGE_FILE_THRESHOLD = 800;

/** Append-only logs exempted from the large-file check. See module docstring. */
export const APPEND_ONLY_LOGS = [
  ".claude/improvement-loop/log.md",
  ".claude/improvement-loop/revert-log.md",
];

/** @param {string} filePath @returns {boolean} */
export function isExemptLargeFile(filePath) {
  return APPEND_ONLY_LOGS.includes(filePath);
}

/**
 * @param {Array<{path: string, lines: number}>} files
 * @returns {Array<{path: string, lines: number}>} files over the threshold, excluding exemptions
 */
export function filterLargeFiles(files) {
  return files.filter((file) => file.lines > LARGE_FILE_THRESHOLD && !isExemptLargeFile(file.path));
}

/**
 * Counts lines the way `wc -l` does: newline characters, not physical lines —
 * a file missing its trailing newline is one line short of split("\n").length.
 * @param {string} filePath
 * @returns {number}
 */
export function countLines(filePath) {
  const content = readFileSync(filePath, "utf8");
  if (content === "") return 0;
  return content.split("\n").length - 1;
}

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  const paths = readStdin()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && existsSync(line));

  const files = paths.map((path) => ({ path, lines: countLines(path) }));

  for (const file of filterLargeFiles(files)) {
    console.log(`- \`${file.path}\` (${file.lines} lines)`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
