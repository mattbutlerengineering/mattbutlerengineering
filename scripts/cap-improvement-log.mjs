#!/usr/bin/env node
/**
 * Cap `.claude/improvement-loop/log.md` to its newest N dated sections.
 * The log is append-only narrative that nothing parses; older entries stay
 * recoverable from git history. Run after appending an entry (#9076).
 *
 *   node scripts/cap-improvement-log.mjs [path] [maxEntries]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DEFAULT_LOG_PATH = ".claude/improvement-loop/log.md";
const DEFAULT_MAX_ENTRIES = 60;

/**
 * @param {string} text
 * @param {number} maxEntries
 * @returns {string}
 */
export function capLog(text, maxEntries = DEFAULT_MAX_ENTRIES) {
  const starts = [...text.matchAll(/^## /gm)].map((m) => m.index);
  if (starts.length <= maxEntries) return text;
  const keepFrom = starts[starts.length - maxEntries];
  return text.slice(0, starts[0]) + text.slice(keepFrom);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? DEFAULT_LOG_PATH;
  const max = Number(process.argv[3] ?? DEFAULT_MAX_ENTRIES);
  writeFileSync(path, capLog(readFileSync(path, "utf8"), max));
}
