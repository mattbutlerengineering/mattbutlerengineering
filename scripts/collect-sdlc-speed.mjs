#!/usr/bin/env node

/**
 * Weekly SDLC-speed sensor (#6654, tracking #6637).
 *
 * Replaces ad-hoc hand measurement in mbe-weekly-retro with a recorded series:
 * PR open->merge by author class, ci.yml wall time on pull_request runs, and
 * whether main's branch protection is `strict`.
 *
 * Pitfalls taken from .claude/rules/gotchas.md § CI (the ciHealth bullet):
 *  - CI runs are scoped to `event=pull_request` on ci.yml only, and
 *    cancelled/skipped/in-flight runs are dropped, not folded into a denominator.
 *  - The week-over-week baseline is the previous recorded row (our own
 *    timestamp), never a platform `updatedAt`.
 *
 * Usage:
 *   node scripts/collect-sdlc-speed.mjs [--days 7] [--record] [--regressions]
 *     --record       upsert today's `sdlcSpeed` row into metrics/process-metrics.jsonl
 *     --regressions  add `proposals`: de-duplicated regression issues (at most one)
 * Output is one JSON document on stdout.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { isAgentPr } from "../plugins/acmm/scripts/agent-pr.js";
import { resolvePath } from "./metrics-store.mjs";

export const SENSOR = "sdlcSpeed";
export const AUTHOR_CLASSES = ["human", "agent", "dependabot", "github-actions"];
export const CLASS_P90_REGRESSION = 1.5;
export const CI_P50_REGRESSION = 1.3;
/** Per-run `jobs` calls are one request each; cap the sample. */
const MAX_JOB_SAMPLES = 25;
/** Lockfile attribution needs 1-2 calls per run; sample the newest runs only. */
const MAX_LOCKFILE_SAMPLES = 60;
const LOCKFILE = "pnpm-lock.yaml";
const MS_PER_MIN = 60_000;

/** @param {{ author?: string, labels?: string[] }} pr */
export function classifyAuthor(pr) {
  const login = (pr.author ?? "")
    .toLowerCase()
    .replace(/^app\//, "")
    .replace(/\[bot\]$/, "");
  if (login === "dependabot") return "dependabot";
  if (login === "github-actions") return "github-actions";
  return isAgentPr({ author: pr.author, labels: pr.labels ?? [] }) ? "agent" : "human";
}

/** Nearest-rank percentile; 0 for an empty list (never NaN). */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[Math.min(rank, sorted.length) - 1];
}

const minutesBetween = (from, to) => (Date.parse(to) - Date.parse(from)) / MS_PER_MIN;
const round1 = (n) => Math.round(n * 10) / 10;

/** @param {object} item one `items[]` entry of `gh api search/issues` */
export function normalizeSearchPr(item) {
  const mergedAt = item?.pull_request?.merged_at;
  if (!mergedAt || !item.created_at) return null;
  const labels = (item.labels ?? []).map((l) => l.name);
  const minutes = minutesBetween(item.created_at, mergedAt);
  if (!Number.isFinite(minutes)) return null;
  return {
    number: item.number,
    authorClass: classifyAuthor({ author: item.user?.login, labels }),
    openToMergeMin: round1(minutes),
  };
}

/** @param {object} run one `workflow_runs[]` entry; null unless success/failure */
export function normalizeCiRun(run, extras = {}) {
  if (run?.conclusion !== "success" && run?.conclusion !== "failure") return null;
  const wall = minutesBetween(run.run_started_at, run.updated_at);
  if (!Number.isFinite(wall)) return null;
  return { id: run.id, wallMin: round1(wall), touchedLockfile: null, jobs: [], ...extras };
}

function summarizeClass(prs) {
  const times = prs.map((p) => p.openToMergeMin);
  const slowest = [...prs]
    .sort((a, b) => b.openToMergeMin - a.openToMergeMin)
    .slice(0, 3)
    .map((p) => p.number);
  return {
    count: prs.length,
    p50: percentile(times, 50),
    p90: percentile(times, 90),
    max: times.length ? Math.max(...times) : 0,
    slowest,
  };
}

function slowestJob(ciRuns) {
  const byName = new Map();
  for (const run of ciRuns) {
    for (const job of run.jobs ?? []) {
      byName.set(job.name, [...(byName.get(job.name) ?? []), job.durationMin]);
    }
  }
  let best = null;
  for (const [name, durations] of byName) {
    const medianMin = percentile(durations, 50);
    if (best === null || medianMin > best.medianMin) best = { name, medianMin };
  }
  return best;
}

/**
 * @param {{ prs: Array<{number:number,authorClass:string,openToMergeMin:number}>,
 *   ciRuns: Array<{wallMin:number,touchedLockfile:boolean|null,jobs:Array<{name:string,durationMin:number}>}>,
 *   protection: { strict?: boolean } | null }} input
 */
export function summarizeSdlcSpeed({ prs, ciRuns, protection }) {
  const byClass = Object.fromEntries(
    AUTHOR_CLASSES.map((c) => [c, summarizeClass(prs.filter((p) => p.authorClass === c))])
  );
  const walls = ciRuns.map((r) => r.wallMin);
  // null = not sampled (resolving files costs API calls); excluded from the denominator.
  const sampled = ciRuns.filter((r) => r.touchedLockfile !== null);
  const locked = sampled.filter((r) => r.touchedLockfile).length;
  return {
    prs: { total: prs.length, byClass },
    ci: {
      runs: ciRuns.length,
      p50: percentile(walls, 50),
      p90: percentile(walls, 90),
      slowestJob: slowestJob(ciRuns),
      lockfileShare: sampled.length ? Math.round((locked / sampled.length) * 100) / 100 : 0,
    },
    mainStrict: typeof protection?.strict === "boolean" ? protection.strict : null,
  };
}

/** Regression proposals comparing two summaries; a missing/zero baseline never proposes. */
export function detectSdlcRegressions(current, previous) {
  if (!previous) return [];
  const proposals = [];
  for (const cls of AUTHOR_CLASSES) {
    const now = current.prs?.byClass?.[cls]?.p90 ?? 0;
    const before = previous.prs?.byClass?.[cls]?.p90 ?? 0;
    if (before > 0 && now >= before * CLASS_P90_REGRESSION) {
      const slowest = (current.prs.byClass[cls].slowest ?? []).map((n) => `#${n}`).join(", ");
      proposals.push({
        title: `sdlc-speed: ${cls} PR p90 open-to-merge regressed week over week`,
        body: `${cls} open-to-merge p90 went ${before} -> ${now} min (threshold +50%). Slowest: ${slowest || "n/a"}.\n\nSource: \`node scripts/collect-sdlc-speed.mjs\` (#6654).`,
      });
    }
  }
  const ciNow = current.ci?.p50 ?? 0;
  const ciBefore = previous.ci?.p50 ?? 0;
  if (ciBefore > 0 && ciNow >= ciBefore * CI_P50_REGRESSION) {
    proposals.push({
      title: "sdlc-speed: ci.yml p50 wall time regressed week over week",
      body: `ci.yml pull_request wall-clock p50 went ${ciBefore} -> ${ciNow} min (threshold +30%).\n\nSource: \`node scripts/collect-sdlc-speed.mjs\` (#6654).`,
    });
  }
  return proposals;
}

/** At most one proposal per run, and none whose title matches an open issue. */
export function dedupeProposals(proposals, openTitles) {
  const open = new Set(openTitles);
  return proposals.filter((p) => !open.has(p.title)).slice(0, 1);
}

/**
 * Replace-or-append a row keyed by (sensor, date). Same contract as
 * record-queue-efficiency's upsert, redefined here because importing that
 * module drags in @mbe/gh-client (needs a build) for a 10-line helper.
 */
export function upsertSensorRow(jsonlText, entry) {
  const kept = jsonlText
    .split("\n")
    .filter((l) => l.trim() !== "")
    .filter((l) => {
      try {
        const row = JSON.parse(l);
        return !(row.sensor === entry.sensor && row.date === entry.date);
      } catch {
        return true; // never drop a line we cannot parse
      }
    });
  return [...kept, JSON.stringify(entry)].join("\n") + "\n";
}

// ── I/O (CLI only) ───────────────────────────────────────────────────────

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 256 * 1024 * 1024 });
}

const lines = (text) =>
  text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

function fetchPrs(days, now) {
  const repo = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const q = `repo:${repo} is:pr is:merged merged:>=${since}`;
  const out = gh([
    "api",
    "--method",
    "GET", // -f alone would POST
    "--paginate",
    "search/issues",
    "-f",
    `q=${q}`,
    "-f",
    "per_page=100",
    "--jq",
    ".items[]",
  ]);
  return lines(out).map(normalizeSearchPr).filter(Boolean);
}

function fetchCiRuns(days, now) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const path = `repos/{owner}/{repo}/actions/workflows/ci.yml/runs?event=pull_request&created=>=${since}&per_page=100`;
  const out = gh([
    "api",
    "--paginate",
    path,
    "--jq",
    ".workflow_runs[] | {id,conclusion,run_started_at,updated_at,sha:.head_sha,pr:(.pull_requests[0].number // null)}",
  ]);
  const runs = lines(out);
  const fileCache = new Map();
  // A merged PR's branch is usually deleted, which empties the run's
  // `pull_requests` (62% of runs) — recover the PR from the head commit.
  const prFor = (run) => {
    if (run.pr !== null) return run.pr;
    const found = gh([
      "api",
      `repos/{owner}/{repo}/commits/${run.sha}/pulls`,
      "--jq",
      ".[0].number // empty",
    ]).trim();
    return found ? Number(found) : null;
  };
  const touchesLock = (n) => {
    if (n === null) return null;
    if (!fileCache.has(n)) {
      const files = gh([
        "api",
        "--paginate",
        `repos/{owner}/{repo}/pulls/${n}/files`,
        "--jq",
        ".[].filename",
      ]);
      fileCache.set(n, files.split("\n").includes(LOCKFILE));
    }
    return fileCache.get(n);
  };
  return runs
    .map((run, i) => {
      const extras = i < MAX_LOCKFILE_SAMPLES ? { touchedLockfile: touchesLock(prFor(run)) } : {};
      if (i < MAX_JOB_SAMPLES) {
        const jobs = gh([
          "api",
          `repos/{owner}/{repo}/actions/runs/${run.id}/jobs?per_page=100`,
          "--jq",
          '.jobs[] | select(.conclusion=="success" or .conclusion=="failure") | {name,s:.started_at,c:.completed_at}',
        ]);
        extras.jobs = lines(jobs).map((j) => ({
          name: j.name,
          durationMin: round1(minutesBetween(j.s, j.c)),
        }));
      }
      return normalizeCiRun(run, extras);
    })
    .filter(Boolean);
}

function fetchProtection() {
  try {
    return JSON.parse(
      gh(["api", "repos/{owner}/{repo}/branches/main/protection/required_status_checks"])
    );
  } catch {
    return null; // unknown, reported as mainStrict: null — never guessed
  }
}

function readRows(path) {
  return existsSync(path) ? lines(readFileSync(path, "utf-8")) : [];
}

function openReadyTitles() {
  const out = gh([
    "api",
    "--paginate",
    "repos/{owner}/{repo}/issues?state=open&labels=ready&per_page=100",
    "--jq",
    ".[].title",
  ]);
  return out.split("\n").filter(Boolean);
}

function main(argv) {
  const dIdx = argv.indexOf("--days");
  const days = dIdx >= 0 ? Number(argv[dIdx + 1]) : 7;
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const summary = summarizeSdlcSpeed({
    prs: fetchPrs(days, now),
    ciRuns: fetchCiRuns(days, now),
    protection: fetchProtection(),
  });
  const path = resolvePath("process-metrics");
  const prior = readRows(path)
    .filter((r) => r.sensor === SENSOR && r.available === true && r.date < date)
    .at(-1);
  const result = { date, days, ...summary };
  if (argv.includes("--regressions")) {
    result.proposals = dedupeProposals(detectSdlcRegressions(summary, prior), openReadyTitles());
  }
  if (argv.includes("--record")) {
    const entry = { date, sensor: SENSOR, available: true, days, ...summary };
    const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, upsertSensorRow(existing, entry), "utf-8");
  }
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
