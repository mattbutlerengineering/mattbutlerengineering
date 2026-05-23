#!/usr/bin/env node
/**
 * Collect improvement-labeled issues and PRs from GitHub and write to
 * metrics/improvement-activity.jsonl.
 *
 * Supports --dry-run to preview without writing.
 * Idempotent: deduplicates on re-run by number+type.
 *
 * Usage:
 *   node scripts/collect-improvement-activity.mjs
 *   node scripts/collect-improvement-activity.mjs --dry-run
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const METRICS_DIR = join(REPO_ROOT, "metrics");
const OUTPUT_FILE = join(METRICS_DIR, "improvement-activity.jsonl");
const DRY_RUN = process.argv.includes("--dry-run");
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function loadExisting() {
  if (!existsSync(OUTPUT_FILE)) return new Map();
  const existing = new Map();
  readFileSync(OUTPUT_FILE, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .forEach((l) => {
      try {
        const e = JSON.parse(l);
        if (e.number && e.type) existing.set(`${e.type}:${e.number}`, true);
      } catch {
        // skip malformed
      }
    });
  return existing;
}

function queryGh(args, label = "") {
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } catch {
    console.warn(`  Warning: gh query failed${label ? ` (${label})` : ""} — skipping`);
    return [];
  }
}

const existing = loadExisting();
const cutoff = Date.now() - THIRTY_DAYS_MS;
const newEntries = [];

// Query closed issues
const issues = queryGh(
  [
    "issue",
    "list",
    "--label",
    "improvement",
    "--state",
    "closed",
    "--limit",
    "100",
    "--json",
    "number,title,closedAt,url",
  ],
  "issues"
);
for (const issue of issues) {
  if (!issue.closedAt) continue;
  const closedAt = new Date(issue.closedAt).getTime();
  if (closedAt < cutoff) continue;
  const key = `issue:${issue.number}`;
  if (existing.has(key)) continue;
  newEntries.push({
    number: issue.number,
    title: issue.title,
    closedAt: issue.closedAt,
    url: issue.url,
    type: "issue",
  });
}

// Query merged PRs
const prs = queryGh(
  [
    "pr",
    "list",
    "--label",
    "improvement",
    "--state",
    "merged",
    "--limit",
    "100",
    "--json",
    "number,title,mergedAt,url",
  ],
  "prs"
);
for (const pr of prs) {
  if (!pr.mergedAt) continue;
  const mergedAt = new Date(pr.mergedAt).getTime();
  if (mergedAt < cutoff) continue;
  const key = `pr:${pr.number}`;
  if (existing.has(key)) continue;
  newEntries.push({
    number: pr.number,
    title: pr.title,
    mergedAt: pr.mergedAt,
    url: pr.url,
    type: "pr",
  });
}

if (newEntries.length === 0) {
  console.log("collect-improvement-activity: no new entries found.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`collect-improvement-activity: dry run — ${newEntries.length} new entries:`);
  for (const e of newEntries) console.log(" ", JSON.stringify(e));
  process.exit(0);
}

mkdirSync(METRICS_DIR, { recursive: true });
for (const e of newEntries) {
  appendFileSync(OUTPUT_FILE, JSON.stringify(e) + "\n");
}
console.log(
  `collect-improvement-activity: appended ${newEntries.length} new entries to ${OUTPUT_FILE}`
);
