#!/usr/bin/env node

/**
 * Safety guard: scans new Prisma migration SQL files for destructive operations
 * (DROP TABLE, DROP COLUMN, TRUNCATE, DELETE FROM) that could cause data loss.
 *
 * Compares against the base branch (default: origin/main) to find new migrations.
 * Intentional destructive migrations can be marked with a comment:
 *   -- DESTRUCTIVE: <reason>
 *
 * Base resolution: `DESTRUCTIVE_MIGRATION_BASE` env override, else the
 * `[base-ref]` argument, else `origin/main`, narrowed to
 * `git merge-base HEAD <ref>`. An unresolvable base BLOCKS the check (exit 10,
 * BLOCKED in repo-audit) rather than passing: this gate only sees a migration by diffing against a base, so
 * a base it cannot resolve means it inspected nothing. It used to swallow that
 * failure and print "No new migration files found", which reads exactly like a
 * real all-clear. Same fail-closed stance, and wording, as
 * check-rialto-changeset.mjs.
 *
 * Usage: node scripts/check-destructive-migrations.js [base-ref]
 * Exit code: 0 if safe, 1 if destructive operations found without approval marker,
 *   10 if the diff base is unresolvable (BLOCKED in repo-audit; never a pass)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { runCheck } from "./lib/fitness-check.mjs";

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
  { pattern: /\bDROP\s+COLUMN\b/i, label: "DROP COLUMN" },
  { pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\b/i, label: "ALTER TABLE ... DROP" },
  { pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
];

const APPROVAL_MARKER = /--\s*DESTRUCTIVE:/i;

const MIGRATION_PATHSPEC = "services/*/prisma/migrations/**/*.sql";

/** @param {...string} args @returns {string} */
function git(...args) {
  return execFileSync("git", args, { encoding: "utf-8" }).trim();
}

/**
 * The commit to diff HEAD against. Throws when it does not resolve, which the
 * CLI turns into a failure rather than an empty file list.
 *
 * @param {string} ref
 * @returns {string}
 */
function resolveBase(ref) {
  // `--end-of-options`: a ref beginning with "-" is a ref, never a merge-base flag (#10143).
  return git("merge-base", "--end-of-options", "HEAD", ref);
}

/**
 * Exit codes for an environmental blocker (#10143), so `pnpm repo-audit` reports
 * BLOCKED rather than a destructive-migration violation. Never a pass, never a skip.
 */
export const BLOCKED_EXIT_CODES = { "base-unresolvable": 10 };

/**
 * Migration files added between `base` and HEAD.
 *
 * @param {string} base - an already-resolved commit
 * @returns {string[]}
 */
function getNewMigrationFiles(base) {
  return git("diff", "--name-only", "--diff-filter=A", base, "HEAD", "--", MIGRATION_PATHSPEC)
    .split("\n")
    .filter(Boolean);
}

/** Pure scan of one migration file's SQL content — no I/O, no logging. */
export function scanMigrationContent(content) {
  const hasApproval = APPROVAL_MARKER.test(content);
  const operations = DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(content)).map(
    ({ label }) => label
  );
  return { hasApproval, operations };
}

/**
 * Scan a list of migration file paths, splitting operations into
 * unapproved findings vs. explicitly approved ones.
 */
export function findDestructiveMigrationFindings(files) {
  const findings = [];
  const approved = [];

  for (const file of files) {
    const fullPath = resolve(file);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, "utf-8");
    const { hasApproval, operations } = scanMigrationContent(content);

    for (const operation of operations) {
      const entry = { file, operation };
      if (hasApproval) approved.push(entry);
      else findings.push(entry);
    }
  }

  return { findings, approved };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-destructive-migrations.js");

// Edit-time hook mode (#6291): `--file <path>` scans one file and only warns
// (stderr, exit 0), so the .claude/settings.json hook shares this rule
// instead of restating the regex.
if (isMain && process.argv[2] === "--file") {
  const file = process.argv[3];
  const { findings } = file ? findDestructiveMigrationFindings([file]) : { findings: [] };
  if (findings.length > 0) {
    console.error(
      "⚠️  Destructive migration detected without a -- DESTRUCTIVE: <reason> marker. Add the marker or redesign as a shadow-column-then-drop-later pattern before committing."
    );
  }
  process.exit(0);
}

if (isMain) {
  const baseRef = process.env.DESTRUCTIVE_MIGRATION_BASE || process.argv[2] || "origin/main";

  let base;
  try {
    base = resolveBase(baseRef);
  } catch {
    runCheck({
      name: "destructive migrations",
      findings: [`merge-base(HEAD, ${baseRef}) did not resolve`],
      formatFinding: (line) => line,
      failMessage:
        "BLOCKED: destructive-migration check could not resolve a diff base.\n" +
        "It needs `origin/main` and enough history for a merge base — in CI\n" +
        "that means `fetch-depth: 0` on the checkout; locally, `git fetch\n" +
        "origin main`. Set DESTRUCTIVE_MIGRATION_BASE=<ref> to override.\n" +
        "Failing closed: a silently skipped gate reads exactly like a green one.",
    });
    process.exit(BLOCKED_EXIT_CODES["base-unresolvable"]);
  }

  const files = getNewMigrationFiles(base);

  if (files.length === 0) {
    // Not "skipping": a base resolved, so this is a real all-clear. The old
    // wording was printed on an unresolvable base too, which is what let the
    // inert case pass for a clean one.
    console.log(`No new migration files since ${baseRef} — nothing to check.`);
    process.exit(0);
  }

  console.log(`Checking ${files.length} new migration file(s) for destructive operations...\n`);

  const { findings, approved } = findDestructiveMigrationFindings(files);

  for (const { file, operation } of approved) {
    console.log(`  ${file}: ${operation} (approved via -- DESTRUCTIVE: marker)`);
  }

  const exitCode = runCheck({
    name: "destructive migrations",
    findings,
    formatFinding: ({ file, operation }) => `${file}: ${operation}`,
    passMessage: "PASS: No unapproved destructive migrations found.",
    failMessage: `FAIL: Found ${findings.length} unapproved destructive operation(s):\n`,
  });

  if (exitCode !== 0) {
    console.log(
      "\nTo approve an intentional destructive migration, add this comment to the SQL file:" +
        "\n  -- DESTRUCTIVE: <reason for the destructive change>" +
        "\n\nThis ensures destructive changes are explicitly acknowledged."
    );
  }

  process.exit(exitCode);
}
