#!/usr/bin/env node

/**
 * Safety guard: scans new Prisma migration SQL files for destructive operations
 * (DROP TABLE, DROP COLUMN, TRUNCATE, DELETE FROM) that could cause data loss.
 *
 * Compares against the base branch (default: origin/main) to find new migrations.
 * Intentional destructive migrations can be marked with a comment:
 *   -- DESTRUCTIVE: <reason>
 *
 * Usage: node scripts/check-destructive-migrations.js [base-ref]
 * Exit code: 0 if safe, 1 if destructive operations found without approval marker
 */

import { execSync } from "node:child_process";
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

function getNewMigrationFiles(baseRef) {
  try {
    const output = execSync(
      `git diff --name-only --diff-filter=A ${baseRef}...HEAD -- 'services/*/prisma/migrations/**/*.sql'`,
      { encoding: "utf-8" }
    ).trim();
    return output ? output.split("\n") : [];
  } catch {
    // If base ref doesn't exist (e.g., first run), check all migration files
    // that are staged or untracked
    try {
      const staged = execSync(
        `git diff --name-only --cached -- 'services/*/prisma/migrations/**/*.sql'`,
        { encoding: "utf-8" }
      ).trim();
      return staged ? staged.split("\n") : [];
    } catch {
      return [];
    }
  }
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

if (isMain) {
  const baseRef = process.argv[2] || "origin/main";
  const files = getNewMigrationFiles(baseRef);

  if (files.length === 0) {
    console.log("No new migration files found — skipping destructive check.");
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
