#!/usr/bin/env node
/* global process, console */

/**
 * Instruction-changes collector for ACMM meta-criteria.
 *
 * Scans git log for changes to CLAUDE.md, AGENTS.md, and skill/ADR files
 * since a given date. Appends new entries to metrics/instruction-changes.jsonl.
 *
 * Usage:
 *   node scripts/collect-instruction-changes.mjs              # collect and persist
 *   node scripts/collect-instruction-changes.mjs --dry-run    # print only, no write
 */

import { execFileSync } from "node:child_process";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CHANGES_PATH = resolve(ROOT, "metrics", "instruction-changes.jsonl");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

/**
 * Classify the commit type from a conventional-commit subject line.
 */
export function buildInstructionEntry(date, file, summary) {
  const changeType = inferChangeType(summary);
  return {
    date,
    file,
    summary,
    change_type: changeType,
  };
}

/**
 * Infer change_type from commit message prefix.
 */
function inferChangeType(summary) {
  const lower = summary.toLowerCase();
  if (/^docs(\(.+\))?:/.test(lower)) return "documentation";
  if (/^feat(\(.+\))?:/.test(lower)) return "addition";
  if (/^fix(\(.+\))?:/.test(lower)) return "correction";
  if (/^(chore|refactor|perf)(\(.+\))?:/.test(lower)) return "update";
  return "update";
}

/**
 * Check if a file path is a generated artifact that should be excluded.
 */
function isExcludedFile(filePath) {
  // Exclude generated files and llms artifacts
  if (/llms[.-]/.test(filePath)) return true;
  if (/\/generated\//.test(filePath)) return true;
  if (/\/dist\//.test(filePath)) return true;
  return false;
}

/**
 * Parse git log output in the format produced by:
 *   git log --format="%ad %s" --date=short --name-only
 *
 * Format: date+subject on one line, then blank line, then filenames, with blank line separator.
 * Example:
 *   2026-06-21 chore(mcp): add Stripe MCP server (#2575)
 *
 *   CLAUDE.md
 *   .claude/rules/gotchas.md
 *
 *   2026-06-20 test(reservations): end-to-end route ownership enforcement (#2514)
 *
 *   services/reservations/CLAUDE.md
 */
export function parseGitLog(logOutput) {
  if (!logOutput || !logOutput.trim()) return [];

  const entries = [];
  const lines = logOutput.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip blank lines
    if (!line) {
      i++;
      continue;
    }

    // Check if this line is a commit header (date + subject)
    const headerMatch = line.match(/^(\d{4}-\d{2}-\d{2})\s+(.+)$/);
    if (!headerMatch) {
      i++;
      continue;
    }

    const date = headerMatch[1];
    const summary = headerMatch[2];
    i++;

    // Skip blank line(s) after header
    while (i < lines.length && !lines[i].trim()) {
      i++;
    }

    // Collect file names until we hit another commit header or blank line
    while (i < lines.length) {
      const fileLine = lines[i].trim();
      if (!fileLine) {
        // Blank line — stop collecting files for this commit
        i++;
        break;
      }

      // Check if this is the next commit header (starts with date pattern)
      if (/^\d{4}-\d{2}-\d{2}\s+/.test(fileLine)) {
        // This is the next commit header, don't consume it
        break;
      }

      // Skip excluded files
      if (!isExcludedFile(fileLine)) {
        entries.push({
          date,
          file: fileLine,
          summary,
        });
      }

      i++;
    }
  }

  return entries;
}

/**
 * Collect instruction changes and append to JSONL file.
 *
 * When called with (metricsPath, lastDate, gitLogOutput):
 *   - parses gitLogOutput
 *   - filters entries after lastDate
 *   - enriches with change_type
 *   - appends to metricsPath
 *   - returns count of entries written
 */
export function collectInstructionChanges(metricsPath, lastDate, gitLogOutput) {
  const parsed = parseGitLog(gitLogOutput);

  // Filter entries after lastDate
  const filtered = parsed.filter((entry) => entry.date > lastDate);

  if (filtered.length === 0) return 0;

  // Enrich with change_type
  const enriched = filtered.map((entry) =>
    buildInstructionEntry(entry.date, entry.file, entry.summary)
  );

  // Create directory if needed
  mkdirSync(dirname(metricsPath), { recursive: true });

  // Append to file
  for (const entry of enriched) {
    appendFileSync(metricsPath, JSON.stringify(entry) + "\n");
  }

  return enriched.length;
}

/**
 * Fetch git log output for instruction files changed since a given date.
 */
function fetchGitLog(root, lastDate) {
  try {
    return execFileSync(
      "git",
      [
        "log",
        `--after=${lastDate}`,
        "--format=%ad %s",
        "--date=short",
        "--name-only",
        "--",
        "CLAUDE.md",
        "AGENTS.md",
        ".claude/rules",
        ".claude/skills",
        "docs/adr",
        "packages/*/CLAUDE.md",
        "services/*/CLAUDE.md",
      ],
      { encoding: "utf-8", cwd: root, timeout: 15_000 }
    );
  } catch {
    return "";
  }
}

/**
 * Get the last recorded date from the metrics file.
 */
function getLastRecordedDate(metricsPath) {
  if (!existsSync(metricsPath)) return null;

  const lines = readFileSync(metricsPath, "utf-8")
    .split("\n")
    .filter((l) => l.trim());

  if (lines.length === 0) return null;

  // The file is in reverse chronological order (newest first), so read the first line
  try {
    const lastEntry = JSON.parse(lines[0]);
    return lastEntry.date || null;
  } catch {
    return null;
  }
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const lastDate = getLastRecordedDate(CHANGES_PATH);

  if (!lastDate) {
    console.log("collect-instruction-changes: no existing metrics file; skipping");
    return;
  }

  const gitOutput = fetchGitLog(ROOT, lastDate);
  const count = collectInstructionChanges(CHANGES_PATH, lastDate, gitOutput);

  if (DRY_RUN) {
    console.log(
      `collect-instruction-changes (dry-run): would append ${count} entry(ies) to ${CHANGES_PATH}`
    );
    return;
  }

  if (count === 0) {
    console.log("collect-instruction-changes: no new instruction changes found");
  } else {
    console.log(`collect-instruction-changes: appended ${count} entry(ies) to ${CHANGES_PATH}`);
  }
}

const isMain =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main();
}
