#!/usr/bin/env node

/**
 * PR-acceptance metric for the ACMM L3 ("Measured / Enforced") signal.
 *
 * Pulls recent PRs from the GitHub CLI, computes acceptance rate and a
 * lightweight breakdown of human-vs-agent authorship, appends one dated
 * JSONL entry to metrics/acmm-pr-history.jsonl, and prints a summary.
 *
 * Usage:
 *   node scripts/pr-metrics.mjs                 # default: last 30 days, append to history
 *   node scripts/pr-metrics.mjs --days 90       # configurable window
 *   node scripts/pr-metrics.mjs --dry-run       # compute + print, do not append
 *   node scripts/pr-metrics.mjs --print-history # tail recent history entries instead
 *
 * The script is invoked manually or by a scheduled progress-tracker.
 * It does not modify code; it only writes to metrics/.
 *
 * Why this exists (acmm:pr-acceptance-metric, L3 feedback-loop):
 *   The L3 maturity signal is "we measure the AI loop itself, not just
 *   the code." Acceptance rate is the simplest meta-metric: of the PRs
 *   we open (human or agent-authored), what fraction merges? A drop
 *   across two consecutive runs is the earliest signal that something
 *   in the loop has regressed.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const cwd = process.cwd();
const HISTORY_PATH = join(cwd, 'metrics/acmm-pr-history.jsonl');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRINT_HISTORY = args.includes('--print-history');
const daysIdx = args.indexOf('--days');
const DAYS = daysIdx >= 0 ? parseInt(args[daysIdx + 1] ?? '30', 10) : 30;

if (PRINT_HISTORY) {
  if (!existsSync(HISTORY_PATH)) {
    console.log('No history yet at', HISTORY_PATH);
    process.exit(0);
  }
  const body = readFileSync(HISTORY_PATH, 'utf-8');
  const lines = body.split('\n').filter(Boolean).slice(-10);
  console.log(`PR metrics history (last ${lines.length} entries):`);
  console.log('');
  console.log('Date        Window  Total  Merged  Closed  Accept%  Agent%');
  for (const line of lines) {
    const e = JSON.parse(line);
    const accept = e.total === 0 ? '—' : `${Math.round((e.merged / e.total) * 100)}%`;
    const agent = e.merged === 0 ? '—' : `${Math.round((e.agentMerged / e.merged) * 100)}%`;
    console.log(
      `${e.date}  ${String(e.windowDays).padStart(3)}d   ${String(e.total).padStart(4)}   ${String(e.merged).padStart(5)}   ${String(e.closed).padStart(5)}    ${accept.padStart(5)}  ${agent.padStart(5)}`,
    );
  }
  process.exit(0);
}

/* ── 1. Pull PRs from gh ─────────────────────────────────── */

const sinceMs = Date.now() - DAYS * 24 * 60 * 60 * 1000;
const since = new Date(sinceMs).toISOString().slice(0, 10);
let prsRaw;
try {
  prsRaw = execFileSync(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      '200',
      '--json',
      'number,title,state,createdAt,closedAt,mergedAt,body,author,labels',
    ],
    { encoding: 'utf-8' },
  );
} catch (err) {
  console.error(`gh pr list failed: ${err.message}`);
  process.exit(1);
}

/** @type {Array<{number:number, title:string, state:string, createdAt:string, closedAt:string|null, mergedAt:string|null, body:string|null, author:{login:string}, labels:Array<{name:string}>}>} */
const allPrs = JSON.parse(prsRaw);

// Filter to PRs whose terminal event (merge or close) happened in window.
// PRs still OPEN are skipped — they're undecided.
const prs = allPrs.filter((p) => {
  const terminal = p.mergedAt ?? p.closedAt;
  if (!terminal) return false;
  return new Date(terminal).getTime() >= sinceMs;
});

/* ── 2. Compute metrics ──────────────────────────────────── */

function isAgentAuthored(pr) {
  // Two signals: body contains Co-Authored-By: Claude, or PR has 'has-pr' label
  // (added by mbe-issue-worker after a successful agent run).
  const body = pr.body ?? '';
  if (/Co-Authored-By:\s*Claude/i.test(body)) return true;
  if (pr.labels?.some((l) => l.name === 'has-pr')) return true;
  return false;
}

function timeToCloseHours(pr) {
  const end = pr.mergedAt ?? pr.closedAt;
  if (!end || !pr.createdAt) return null;
  return (new Date(end).getTime() - new Date(pr.createdAt).getTime()) / (1000 * 60 * 60);
}

const merged = prs.filter((p) => p.mergedAt !== null);
const closed = prs.filter((p) => p.state === 'CLOSED' && p.mergedAt === null);
const total = merged.length + closed.length;

const agentMerged = merged.filter(isAgentAuthored).length;
const agentClosed = closed.filter(isAgentAuthored).length;

const closeTimes = [...merged, ...closed].map(timeToCloseHours).filter((h) => h !== null);
const meanCloseHours = closeTimes.length > 0 ? closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length : null;

/* ── 3. Build entry ──────────────────────────────────────── */

const date = new Date().toISOString().slice(0, 10);
const entry = {
  date,
  windowDays: DAYS,
  total,
  merged: merged.length,
  closed: closed.length,
  acceptanceRate: total === 0 ? null : Math.round((merged.length / total) * 1000) / 1000,
  agentMerged,
  agentClosed,
  agentMergeShare: merged.length === 0 ? null : Math.round((agentMerged / merged.length) * 1000) / 1000,
  meanCloseHours: meanCloseHours === null ? null : Math.round(meanCloseHours * 10) / 10,
};

/* ── 4. Print summary ────────────────────────────────────── */

console.log('');
console.log(`PR acceptance metric — last ${DAYS} days (since ${since})`);
console.log('');
console.log(`  Total decisions:      ${total}  (merged: ${merged.length}, closed-unmerged: ${closed.length})`);
if (total > 0) {
  console.log(`  Acceptance rate:      ${(entry.acceptanceRate * 100).toFixed(1)}%`);
}
if (merged.length > 0) {
  console.log(`  Agent-authored merges: ${agentMerged} (${(entry.agentMergeShare * 100).toFixed(1)}% of merges)`);
}
if (meanCloseHours !== null) {
  console.log(`  Mean time-to-close:   ${entry.meanCloseHours} hours`);
}

/* ── 5. Persist ──────────────────────────────────────────── */

if (DRY_RUN) {
  console.log('');
  console.log('--dry-run: not appending. Entry would have been:');
  console.log(JSON.stringify(entry, null, 2));
  process.exit(0);
}

mkdirSync(dirname(HISTORY_PATH), { recursive: true });
appendFileSync(HISTORY_PATH, JSON.stringify(entry) + '\n', 'utf-8');
console.log('');
console.log(`Appended to: ${HISTORY_PATH}`);
