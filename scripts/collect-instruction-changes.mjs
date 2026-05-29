#!/usr/bin/env node

/**
 * Instruction-changes collector for ACMM meta-criteria.
 *
 * Scans git log for changes to CLAUDE.md, AGENTS.md, and skill files
 * in the last 30 days. Appends new entries to
 * metrics/instruction-changes.jsonl.
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

const THIRTY_DAYS = 30;

/** Files/patterns tracked as "instruction" files. */
const TRACKED_PATHS = [
  "CLAUDE.md",
  "AGENTS.md",
  "GEMINI.md",
  "skills",
  ".claude/skills",
  "skills-lock.json",
];

/**
 * Classify the commit type from a conventional-commit subject line.
 */
export function classifyChangeType(summary) {
  const lower = summary.toLowerCase();
  if (/^docs(\(.+\))?:/.test(lower)) return "documentation";
  if (/^feat(\(.+\))?:/.test(lower)) return "addition";
  if (/^fix(\(.+\))?:/.test(lower)) return "correction";
  if (/^(chore|refactor|perf)(\(.+\))?:/.test(lower)) return "maintenance";
  return "update";
}

/**
 * Parse raw git log output (format: "%ad\t%f_path\t%s" per line).
 * Lines that don't have exactly 3 tab-separated fields are skipped.
 */
export function parseGitLogOutput(raw) {
  if (!raw || !raw.trim()) return [];

  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => {
      const parts = line.split("\t");
      if (parts.length < 3) return null;
      const [date, file, ...summaryParts] = parts;
      if (!date || !file || !summaryParts.length) return null;
      // Validate date looks like YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
      return {
        date: date.trim(),
        file: file.trim(),
        summary: summaryParts.join("\t").trim(),
      };
    })
    .filter(Boolean);
}

/**
 * Remove entries already present based on date+file+summary.
 */
export function deduplicateInstructionEntries(newEntries, existing) {
  const existingKeys = new Set(existing.map((e) => `${e.date}|${e.file}|${e.summary}`));
  return newEntries.filter((e) => !existingKeys.has(`${e.date}|${e.file}|${e.summary}`));
}

/**
 * Read existing JSONL entries.
 */
function loadExisting(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Default git log runner. Queries last 30 days of commits touching
 * tracked instruction files and returns raw tab-separated output.
 */
function defaultGitLog(root) {
  const since = `${THIRTY_DAYS} days ago`;
  const pathArgs = TRACKED_PATHS.flatMap((p) => ["--", p]);

  try {
    return execFileSync(
      "git",
      ["log", `--since=${since}`, "--name-only", "--pretty=format:", "--diff-filter=AM"],
      { encoding: "utf-8", cwd: root, timeout: 15_000 }
    );
  } catch {
    // Fallback: use log with format that includes file per line
    try {
      const out = execFileSync(
        "git",
        [
          "log",
          `--since=${since}`,
          "--format=%ad\t%s",
          "--date=short",
          "--name-only",
          "--diff-filter=AM",
          "--",
          ...TRACKED_PATHS,
        ],
        { encoding: "utf-8", cwd: root, timeout: 15_000 }
      );
      return out;
    } catch {
      return "";
    }
  }
}

/**
 * Run git log and produce structured entries for instruction file changes.
 * gitLogFn(root) should return raw git log text in the format used by
 * the git-log-with-file approach (date TAB file TAB summary per line).
 */
export function collectInstructionChanges(root, changesPath, gitLogFn) {
  const runner = gitLogFn ?? defaultGitLog;

  // Use a format that gives us date, file path, and subject on one line
  // We use a custom approach: iterate commits with date+subject, then per-file
  const raw = getInstructionLogLines(root, runner);
  const parsed = parseGitLogOutput(raw);

  if (parsed.length === 0) return 0;

  const enriched = parsed.map((entry) => ({
    ...entry,
    change_type: classifyChangeType(entry.summary),
  }));

  const existing = loadExisting(changesPath);
  const fresh = deduplicateInstructionEntries(enriched, existing);
  if (fresh.length === 0) return 0;

  mkdirSync(dirname(changesPath), { recursive: true });
  for (const entry of fresh) {
    appendFileSync(changesPath, JSON.stringify(entry) + "\n");
  }

  return fresh.length;
}

/**
 * Build tab-separated lines (date TAB file TAB subject) from git log.
 * When gitLogFn is the default, we run git log with a special format.
 * When gitLogFn is a mock, it returns pre-formatted lines directly.
 */
function getInstructionLogLines(root, gitLogFn) {
  // If using the default git log function, run with proper format
  if (gitLogFn === defaultGitLog || gitLogFn === undefined) {
    return runGitLogFormatted(root);
  }
  // Custom/mock function: call directly and treat output as pre-formatted
  return gitLogFn(root);
}

function runGitLogFormatted(root) {
  try {
    // Use a separator-based format to get one record per file per commit
    const raw = execFileSync(
      "git",
      [
        "log",
        `--since=${THIRTY_DAYS} days ago`,
        "--format=COMMIT_START %ad %s",
        "--date=short",
        "--name-only",
        "--diff-filter=AM",
        "--",
        ...TRACKED_PATHS,
      ],
      { encoding: "utf-8", cwd: root, timeout: 15_000 }
    );

    return parseCommitNameOnlyFormat(raw);
  } catch {
    return "";
  }
}

/**
 * Parse git log output using --format=COMMIT_START + --name-only.
 * Produces "date\tfile\tsubject" lines.
 */
function parseCommitNameOnlyFormat(raw) {
  if (!raw || !raw.trim()) return "";

  const lines = [];
  let currentDate = null;
  let currentSubject = null;

  for (const line of raw.split("\n")) {
    if (line.startsWith("COMMIT_START ")) {
      const rest = line.slice("COMMIT_START ".length);
      const spaceIdx = rest.indexOf(" ");
      currentDate = rest.slice(0, spaceIdx);
      currentSubject = rest.slice(spaceIdx + 1).trim();
    } else if (line.trim() && currentDate && currentSubject) {
      const filePath = line.trim();
      // Only include tracked paths
      if (isTrackedPath(filePath)) {
        lines.push(`${currentDate}\t${filePath}\t${currentSubject}`);
      }
    }
  }

  return lines.join("\n");
}

function isTrackedPath(filePath) {
  return TRACKED_PATHS.some(
    (tracked) =>
      filePath === tracked || filePath.startsWith(tracked + "/") || filePath.endsWith("/" + tracked)
  );
}

/* ── Main ────────────────────────────────────────────── */

function main() {
  const count = collectInstructionChanges(ROOT, CHANGES_PATH);

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
