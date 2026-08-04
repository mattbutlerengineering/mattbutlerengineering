#!/usr/bin/env node

/**
 * Architecture fitness test: fails CI when a producer creates a GitHub issue
 * by shelling out to `gh issue create` (workflow YAML / shell) or calling
 * `.issue.create(...)` on a `@mbe/gh-client` instance (JS/TS) instead of
 * routing the skip/create/reopen decision through the shared
 * `fileIssue()` seam (`scripts/lib/issue-filing.mjs`, #3672).
 *
 * Without this guard, nothing stops a new workflow or script from reaching
 * for the raw command again — which is exactly how the sixteen dialects
 * fixed by #3672/#3675/#3676 accumulated in the first place.
 *
 * Exceptions, precise and named (never a loose pattern that quietly matches
 * everything):
 *   1. `scripts/lib/issue-filing.mjs` itself — the module's own internals.
 *   2. Test files (`*.test.mjs`/`*.test.js`/`*.test.ts`) — these reference
 *      the raw patterns as string literals/mocked call assertions, not real
 *      invocations.
 *   3. A JS/TS file that also calls `fileIssue(` somewhere in its own
 *      source — this is the `deps.createIssue` callback shape every
 *      compliant producer uses (see `scripts/cors-audit.mjs` and
 *      `scripts/revert-watchdog.mjs`): the raw call is the *injected
 *      dependency*, and `fileIssue()` still owns the skip/create/reopen
 *      decision. A file with no `fileIssue(` call anywhere is, by
 *      definition, deciding on its own — a real bypass.
 *   4. `EXEMPT_FILES` below — a short, individually-justified allowlist of
 *      pre-existing producers that predate #3672's migration scope and are
 *      out of scope for this check. Comment lines (`#`, `//`) are never
 *      matched, so docs/comments referencing the raw commands don't trip
 *      the check either.
 *
 * Usage: node scripts/check-issue-filing-seam.mjs
 * Exit code: 0 if every producer routes through fileIssue(), 1 otherwise
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories that can plausibly contain issue-creating automation. */
const SCAN_ROOTS = [".github/workflows", "scripts", "plugins", "packages/gh-client/src"];

const SHELL_EXTENSIONS = new Set([".yml", ".yaml", ".sh"]);
const JS_EXTENSIONS = new Set([".mjs", ".js", ".ts"]);

const RAW_GH_ISSUE_CREATE = /\bgh\s+issue\s+create\b/;
const RAW_ISSUE_CREATE_CALL = /\.issue\.create\s*\(/;
const CALLS_FILE_ISSUE = /\bfileIssue\s*\(/;
const COMMENT_PREFIXES = ["#", "//", "*"];

/**
 * Pre-existing producers that predate #3672's "sixteen dialects" migration
 * scope and still hand-roll their own (or no) dedup instead of calling
 * `fileIssue()`. Each is a live, CI-wired producer — not dead code — so
 * fixing them is real, separately-scoped work, not a drive-by for this
 * ticket. `scripts/lib/ratchet.mjs`, `scripts/revert-rca.mjs`,
 * `scripts/secret-rotation-reminder.mjs`, and `scripts/resource-audit.mjs`
 * were migrated onto `fileIssue()` by #3775 and no longer need an entry
 * here — rule #3 above (a file that itself calls `fileIssue(`) now covers
 * them.
 */
const EXEMPT_FILES = new Set([
  "scripts/lib/issue-filing.mjs",
  // deps.createIssue callback fed into fileIssue(), but the fallback lives
  // in plain YAML so the "calls fileIssue(" JS heuristic can't see it. It's
  // a deliberate backstop for when the Node fileIssue() path itself fails
  // to build/install — see the step's own comment in the workflow and its
  // dedicated assertions in scripts/__tests__/issue-filing-migration.test.mjs.
  ".github/workflows/revert-watchdog.yml",
]);

/** True for any `*.test.mjs` / `*.test.js` / `*.test.ts` file, anywhere. */
export function isTestFile(relPath) {
  return /\.test\.(mjs|js|ts)$/.test(relPath);
}

function isCommentLine(line) {
  const trimmed = line.trimStart();
  return COMMENT_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Pure: scans one file's content for raw issue-creation call sites, honoring
 * every named exception above. Never touches the filesystem.
 *
 * @param {string} relPath - path relative to the repo root, POSIX-style
 * @param {string} content
 * @returns {Array<{file: string, line: number, pattern: string, snippet: string}>}
 */
export function scanContentForBypass(relPath, content) {
  if (EXEMPT_FILES.has(relPath) || isTestFile(relPath)) {
    return [];
  }

  const ext = extname(relPath);
  const isJs = JS_EXTENSIONS.has(ext);
  const isShell = SHELL_EXTENSIONS.has(ext);

  if (!isJs && !isShell) {
    return [];
  }

  // A JS/TS producer that itself calls fileIssue() owns its skip/create/
  // reopen decision through the shared seam — its raw `.issue.create(` call
  // is the deps.createIssue callback fileIssue() requires, not a bypass.
  if (isJs && CALLS_FILE_ISSUE.test(content)) {
    return [];
  }

  const pattern = isShell ? "gh issue create" : ".issue.create(";
  const matcher = isShell ? RAW_GH_ISSUE_CREATE : RAW_ISSUE_CREATE_CALL;

  return content
    .split("\n")
    .map((line, idx) => ({ line, number: idx + 1 }))
    .filter(({ line }) => !isCommentLine(line) && matcher.test(line))
    .map(({ line, number }) => ({
      file: relPath,
      line: number,
      pattern,
      snippet: line.trim(),
    }));
}

function walk(dir, root, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "generated") {
      continue;
    }

    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      walk(full, root, out);
      continue;
    }

    const ext = extname(entry.name);
    if (SHELL_EXTENSIONS.has(ext) || JS_EXTENSIONS.has(ext)) {
      out.push(full);
    }
  }
}

/** Scans every workflow/script/producer file under SCAN_ROOTS. */
export function findIssueFilingBypassFindings(root = DEFAULT_ROOT) {
  const files = [];

  for (const scanRoot of SCAN_ROOTS) {
    const fullDir = join(root, ...scanRoot.split("/"));
    if (existsSync(fullDir)) {
      walk(fullDir, root, files);
    }
  }

  const findings = files.flatMap((fullPath) => {
    const relPath = relative(root, fullPath).split(sep).join("/");
    return scanContentForBypass(relPath, readFileSync(fullPath, "utf-8"));
  });

  return { findings };
}

/** Formats one finding as a human-readable, actionable failure line. */
export function formatFinding(finding) {
  return (
    `${finding.file}:${finding.line} calls the raw command directly (\`${finding.pattern}\`) — ` +
    `route this through fileIssue() in scripts/lib/issue-filing.mjs instead.\n` +
    `      ${finding.snippet}`
  );
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-issue-filing-seam.mjs");

if (isMain) {
  const { findings } = findIssueFilingBypassFindings();

  const exitCode = runCheck({
    name: "issue-filing seam",
    findings,
    formatFinding,
    passMessage: "PASS: Every issue-creating producer routes through fileIssue().",
    failMessage:
      "FAIL: A producer bypasses the shared issue-filing module.\n" +
      "See scripts/lib/issue-filing.mjs's fileIssue() — every skip/create/reopen\n" +
      "decision belongs there, not in a fresh `gh issue create` / `.issue.create(...)` call.",
  });
  process.exit(exitCode);
}
