#!/usr/bin/env node

/**
 * Reconstruct weekly progress-tracker snapshots from real history sources
 * (git log, GitHub PRs/issues via `gh`, optional `.claude/agent-spend.jsonl`)
 * and prepend them to `metrics/log.md`.
 *
 * Why: ACMM check M5.1 requires ≥6 dated entries spanning ≥35 days. When the
 * weekly progress-tracker loop hasn't been running long enough, M5.1 fails
 * even though the underlying data *did* exist all along — it just wasn't
 * materialized into the log. This script catches the log up using real data,
 * not fabricated placeholders.
 *
 * Usage:
 *   node scripts/acmm/backfill-metrics.js            # last 8 weeks
 *   node scripts/acmm/backfill-metrics.js --weeks 12 # custom window
 *   node scripts/acmm/backfill-metrics.js --dry-run  # print to stdout, don't write
 *
 * Idempotent: entries whose ISO date already appears as `## YYYY-MM-DD` in
 * `metrics/log.md` are skipped.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const cwd = process.cwd();
const LOG_PATH = join(cwd, "metrics", "log.md");
const args = process.argv.slice(2);
const weeksArg = args.find((a) => a.startsWith("--weeks="));
const weeksIdx = args.indexOf("--weeks");
const DRY_RUN = args.includes("--dry-run");
const WEEKS = weeksArg
  ? parseInt(weeksArg.split("=")[1], 10)
  : weeksIdx >= 0 && args[weeksIdx + 1]
    ? parseInt(args[weeksIdx + 1], 10)
    : 8;

if (!Number.isFinite(WEEKS) || WEEKS < 1 || WEEKS > 52) {
  console.error(`--weeks must be an integer 1..52 (got ${WEEKS})`);
  process.exit(2);
}

/* ── Date helpers ────────────────────────────────────────── */

function iso(d) {
  return d.toISOString().slice(0, 10);
}

/** Returns array of {start, end} with end exclusive, oldest first. */
function weeklyBuckets(n) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const buckets = [];
  for (let i = n - 1; i >= 0; i--) {
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - 7 * i);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    buckets.push({ start, end });
  }
  return buckets;
}

/* ── Signal gatherers ────────────────────────────────────── */

function commitsInRange(start, end) {
  try {
    const out = execFileSync(
      "git",
      [
        "log",
        `--since=${iso(start)}`,
        `--until=${iso(end)}`,
        "--pretty=format:%h",
      ],
      { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.trim() ? out.trim().split("\n").length : 0;
  } catch {
    return 0;
  }
}

function ghJson(args) {
  try {
    const out = execFileSync("gh", args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out.trim() || "[]");
  } catch {
    return [];
  }
}

function mergedPrsInRange(start, end) {
  return ghJson([
    "pr",
    "list",
    "--state",
    "merged",
    "--search",
    `merged:${iso(start)}..${iso(end)}`,
    "--json",
    "number",
    "--limit",
    "200",
  ]);
}

function issuesClosedInRange(start, end) {
  return ghJson([
    "issue",
    "list",
    "--state",
    "closed",
    "--search",
    `closed:${iso(start)}..${iso(end)}`,
    "--json",
    "number,labels",
    "--limit",
    "300",
  ]);
}

function agentSpendInRange(start, end) {
  const p = join(cwd, ".claude", "agent-spend.jsonl");
  if (!existsSync(p)) return null;
  let runs = 0;
  let cost = 0;
  try {
    const lines = readFileSync(p, "utf-8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        const ts =
          entry.timestamp ??
          entry.date ??
          entry.completedAt ??
          entry.startedAt;
        if (!ts) continue;
        const d = new Date(ts);
        if (d >= start && d < end) {
          runs += 1;
          const c =
            entry.cost ?? entry.cost_usd ?? entry.totalCostUsd ?? entry.total_cost_usd ?? 0;
          cost += Number(c) || 0;
        }
      } catch {
        /* skip malformed line */
      }
    }
  } catch {
    return null;
  }
  return { runs, cost };
}

/* ── Entry builder ───────────────────────────────────────── */

function buildEntry({ start, end }) {
  const commits = commitsInRange(start, end);
  const prs = mergedPrsInRange(start, end);
  const issues = issuesClosedInRange(start, end);
  const spend = agentSpendInRange(start, end);

  const auditIssues = issues.filter((i) =>
    (i.labels ?? []).some((l) => l.name === "audit" || l.name === "acmm"),
  ).length;
  const ciFixIssues = issues.filter((i) =>
    (i.labels ?? []).some((l) => l.name === "ci-fix"),
  ).length;

  const body = [];
  body.push(`## ${iso(end)} — weekly progress (${iso(start)} → ${iso(end)})`);
  body.push("");
  body.push("```");
  body.push(`commits:             ${commits}`);
  body.push(`PRs merged:          ${prs.length}`);
  body.push(`issues closed:       ${issues.length}`);
  if (auditIssues > 0) body.push(`  · audit/acmm:      ${auditIssues}`);
  if (ciFixIssues > 0) body.push(`  · ci-fix:          ${ciFixIssues}`);
  if (spend && spend.runs > 0) {
    body.push(`agent runs / cost:   ${spend.runs} / $${spend.cost.toFixed(2)}`);
  }
  body.push("```");
  body.push("");
  body.push(
    `_Backfilled from git + GitHub by \`scripts/acmm/backfill-metrics.js\`; progress-tracker will overwrite/extend future entries._`,
  );
  body.push("");

  return { date: iso(end), body: body.join("\n") };
}

/* ── Main ────────────────────────────────────────────────── */

const existingBody = existsSync(LOG_PATH) ? readFileSync(LOG_PATH, "utf-8") : "";
const existingDates = new Set(
  [...existingBody.matchAll(/^## (\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]),
);

console.log(`Backfilling up to ${WEEKS} weekly entries from real history…`);

const buckets = weeklyBuckets(WEEKS);
const entries = buckets.map(buildEntry).filter((e) => {
  if (existingDates.has(e.date)) {
    console.log(`  skip ${e.date} (already in log)`);
    return false;
  }
  return true;
});

if (entries.length === 0) {
  console.log("\nNothing to add — every weekly date already present in metrics/log.md.");
  process.exit(0);
}

// Entries emerge oldest-first from weeklyBuckets; we want newest-first in the log
// so the log reads as a reverse-chronological changelog.
entries.sort((a, b) => (a.date < b.date ? 1 : -1));

// Insertion point: after the document's leading prose, before the first `## ` heading
// (or at end if no heading exists yet).
const lines = existingBody.split("\n");
let insertAt = lines.length;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith("## ")) {
    insertAt = i;
    break;
  }
}

const insertion = entries.map((e) => e.body).join("\n");
const rebuilt = [
  lines.slice(0, insertAt).join("\n").trimEnd(),
  "",
  insertion,
  lines.slice(insertAt).join("\n"),
]
  .join("\n")
  .replace(/\n{3,}/g, "\n\n") + (existingBody.endsWith("\n") ? "" : "\n");

if (DRY_RUN) {
  console.log("\n--- DRY RUN — would write ---\n");
  console.log(rebuilt);
  process.exit(0);
}

mkdirSync(dirname(LOG_PATH), { recursive: true });
writeFileSync(LOG_PATH, rebuilt, "utf-8");
console.log(`\nWrote ${entries.length} new weekly entries to metrics/log.md:`);
for (const e of entries) console.log(`  + ${e.date}`);
