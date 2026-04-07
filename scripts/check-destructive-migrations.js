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

const baseRef = process.argv[2] || "origin/main";

const DESTRUCTIVE_PATTERNS = [
  { pattern: /\bDROP\s+TABLE\b/i, label: "DROP TABLE" },
  { pattern: /\bDROP\s+COLUMN\b/i, label: "DROP COLUMN" },
  { pattern: /\bALTER\s+TABLE\s+\S+\s+DROP\b/i, label: "ALTER TABLE ... DROP" },
  { pattern: /\bTRUNCATE\b/i, label: "TRUNCATE" },
  { pattern: /\bDELETE\s+FROM\b/i, label: "DELETE FROM" },
];

const APPROVAL_MARKER = /--\s*DESTRUCTIVE:/i;

function getNewMigrationFiles() {
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

const files = getNewMigrationFiles();

if (files.length === 0) {
  console.log("No new migration files found — skipping destructive check.");
  process.exit(0);
}

console.log(`Checking ${files.length} new migration file(s) for destructive operations...\n`);

const violations = [];

for (const file of files) {
  const fullPath = resolve(file);
  if (!existsSync(fullPath)) continue;

  const content = readFileSync(fullPath, "utf-8");
  const hasApproval = APPROVAL_MARKER.test(content);

  for (const { pattern, label } of DESTRUCTIVE_PATTERNS) {
    if (pattern.test(content)) {
      if (hasApproval) {
        console.log(`  ${file}: ${label} (approved via -- DESTRUCTIVE: marker)`);
      } else {
        violations.push({ file, operation: label });
      }
    }
  }
}

if (violations.length === 0) {
  console.log("PASS: No unapproved destructive migrations found.");
} else {
  console.log(`FAIL: Found ${violations.length} unapproved destructive operation(s):\n`);
  for (const { file, operation } of violations) {
    console.log(`  ${file}: ${operation}`);
  }
  console.log(
    "\nTo approve an intentional destructive migration, add this comment to the SQL file:" +
      '\n  -- DESTRUCTIVE: <reason for the destructive change>' +
      "\n\nThis ensures destructive changes are explicitly acknowledged."
  );
  process.exit(1);
}
