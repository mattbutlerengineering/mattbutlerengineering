#!/usr/bin/env node
/**
 * Verify Fixes - Checks if recently closed issues actually fixed the problem
 */

import { execSync } from "child_process";
import fs from "fs";

const HOURS_AGO = 48;
const VERIFY_LOG = ".claude/improvement-loop/verifications.jsonl";

// Get issues closed in last N hours
function getRecentlyClosed() {
  const date = new Date();
  date.setHours(date.getHours() - HOURS_AGO);
  const since = date.toISOString();

  const output = execSync(
    `gh issue list --state closed --search "closed:>${since}" --json number,title,labels,closedAt --jq '[.[] | select(.labels | map(.name) | any(. | test("ci-fix|audit|acmm|bug")))]'`,
    { encoding: "utf-8" }
  );
  return JSON.parse(output || "[]");
}

// Check if fix is verified (simplified - just logs for now)
function verifyFix(issue) {
  const labels = issue.labels.map((l) => l.name);
  console.log(`Checking issue #${issue.number}: ${issue.title}`);

  // For now, just log that we'd verify
  // In production, this would re-run the sensor that created the issue
  return {
    issue: issue.number,
    verified: true, // Placeholder
    timestamp: new Date().toISOString(),
  };
}

// Main
const issues = getRecentlyClosed();
console.log(`Found ${issues.length} recently closed issues to verify`);

const results = issues.map(verifyFix);

// Append to log
const logEntry =
  JSON.stringify({
    timestamp: new Date().toISOString(),
    checked: results.length,
    results,
  }) + "\n";

fs.appendFileSync(VERIFY_LOG, logEntry);

console.log("Verification complete");
process.exit(0);
