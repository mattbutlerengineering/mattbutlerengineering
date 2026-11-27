/**
 * scripts/e2e-cross-branch-red.mjs
 *
 * `e2e.yml` is advisory and never runs on `main`, so a test that is broken for
 * everyone shows up red on every unrelated PR and nothing files an issue
 * (#9829). Each hospitality-e2e shard uploads a small `e2e-failed-tests` JSON
 * record on failure; this module groups those records across head branches and
 * files one `ci-fix` issue per test red on >= `minBranches` distinct branches.
 *
 * Usage:
 *   node scripts/e2e-cross-branch-red.mjs write-record <results.json> <out.json>
 *     (reads BRANCH, SHA, RUN_ID from env)
 *   node scripts/e2e-cross-branch-red.mjs scan   (GH_TOKEN + GITHUB_REPOSITORY from env)
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const DEFAULT_MIN_BRANCHES = 3;
export const WINDOW_HOURS = 48;
export const ARTIFACT_PATTERN = "e2e-failed-tests-shard-*";
const TITLE_PREFIX = "ci-fix: E2E test red on ";

/**
 * Walks a Playwright JSON report and returns tests that failed after retries.
 * @param {unknown} results
 * @returns {Array<{file: string, line: number, title: string}>}
 */
export function extractFailedTests(results) {
  const failed = [];
  const walk = (suite) => {
    for (const spec of suite?.specs ?? []) {
      if ((spec.tests ?? []).some((t) => t.status === "unexpected")) {
        failed.push({ file: spec.file, line: spec.line, title: spec.title });
      }
    }
    for (const child of suite?.suites ?? []) walk(child);
  };
  for (const suite of results?.suites ?? []) walk(suite);
  return failed;
}

/**
 * @param {{branch: string, sha: string, runId: number|string, results: unknown}} args
 */
export function buildFailureRecord({ branch, sha, runId, results }) {
  const base = { branch, sha, runId };
  if (!results) return { ...base, failed: [], resultsMissing: true };
  return { ...base, failed: extractFailedTests(results) };
}

const testKey = (t) => `${t.file}:${t.line} ${t.title}`;

/**
 * Groups failure records by test and returns tests that failed on at least
 * `minBranches` distinct head branches.
 * @param {Array<{branch: string, runId: number|string, createdAt?: string, failed: Array<{file: string, line: number, title: string}>}>} records
 * @param {{minBranches?: number}} [options]
 */
export function groupCrossBranchFailures(records, { minBranches = DEFAULT_MIN_BRANCHES } = {}) {
  const byTest = new Map();
  for (const record of records) {
    for (const test of record.failed ?? []) {
      const key = testKey(test);
      const prev = byTest.get(key) ?? { ...test, key, branches: [], runIds: [], times: [] };
      byTest.set(key, {
        ...prev,
        branches: prev.branches.includes(record.branch)
          ? prev.branches
          : [...prev.branches, record.branch],
        runIds: prev.runIds.includes(record.runId) ? prev.runIds : [...prev.runIds, record.runId],
        times: record.createdAt ? [...prev.times, record.createdAt] : prev.times,
      });
    }
  }
  return [...byTest.values()]
    .filter((g) => g.branches.length >= minBranches)
    .map(({ times, ...g }) => {
      const sorted = [...times].sort();
      return { ...g, firstSeen: sorted[0] ?? null, lastSeen: sorted[sorted.length - 1] ?? null };
    });
}

/**
 * True when a prior issue is closed and the test has NOT re-broken since: the
 * pre-fix runs still inside the 48h window must not reopen a fixed issue every
 * hour. A genuine re-break needs >= `minBranches` distinct branches failing
 * after `closedAt`.
 * @param {{state?: string, closedAt?: string|null}|null} prior
 * @param {string} key  `file:line title`
 * @param {Parameters<typeof groupCrossBranchFailures>[0]} records
 * @param {{minBranches?: number}} [options]
 */
export function shouldSuppressReopen(prior, key, records, options = {}) {
  if (!prior || String(prior.state).toLowerCase() !== "closed" || !prior.closedAt) return false;
  const closedMs = Date.parse(prior.closedAt);
  if (Number.isNaN(closedMs)) return false;
  const fresh = records.filter((r) => r.createdAt && Date.parse(r.createdAt) > closedMs);
  return !groupCrossBranchFailures(fresh, options).some((g) => g.key === key);
}

export function buildIssueTitle(group) {
  return `${TITLE_PREFIX}${group.branches.length} unrelated PR branches: ${group.file}:${group.line}`;
}

/** Stable identity of a title, independent of the branch count. */
export function titleTestId(title) {
  const match = /^ci-fix: E2E test red on \d+ unrelated PR branches: (\S+)$/.exec(title ?? "");
  return match ? match[1] : null;
}

export function buildIssueBody(group, repo) {
  const branches = group.branches.map((b) => `- \`${b}\``).join("\n");
  const runs = group.runIds
    .map((id) => `- https://github.com/${repo}/actions/runs/${id}`)
    .join("\n");
  return [
    `\`${group.file}:${group.line}\` — "${group.title}" failed (after retries) on ${group.branches.length} unrelated PR branches.`,
    "",
    "This test is red for everyone, not for the PR that shows it. `Hospitality E2E` is advisory and does not run on `main`, so PRs merge through it.",
    "",
    `First seen: ${group.firstSeen ?? "unknown"}  Last seen: ${group.lastSeen ?? "unknown"}`,
    "",
    "Branches:",
    branches,
    "",
    "Runs:",
    runs,
    "",
    "Filed by `scripts/e2e-cross-branch-red.mjs` (#9829).",
  ].join("\n");
}

function writeRecord([resultsPath, outPath]) {
  const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf-8")) : null;
  const record = buildFailureRecord({
    branch: process.env.BRANCH ?? "",
    sha: process.env.SHA ?? "",
    runId: process.env.RUN_ID ?? "",
    results,
  });
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);
}

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
}

function collectRecords(repo, nowMs) {
  const since = new Date(nowMs - WINDOW_HOURS * 3600 * 1000).toISOString();
  const runs = JSON.parse(
    gh([
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      "e2e.yml",
      "--status",
      "failure",
      "--created",
      `>=${since}`,
      "--limit",
      "300",
      "--json",
      "databaseId,headBranch,headSha,createdAt",
    ])
  );
  const records = [];
  for (const run of runs) {
    const dir = mkdtempSync(join(tmpdir(), `e2e-red-${run.databaseId}-`));
    try {
      gh([
        "run",
        "download",
        String(run.databaseId),
        "--repo",
        repo,
        "--pattern",
        ARTIFACT_PATTERN,
        "--dir",
        dir,
      ]);
    } catch (err) {
      console.error(
        `run ${run.databaseId}: no failed-tests artifact (${err.message.split("\n")[0]})`
      );
      continue;
    }
    for (const shard of readdirSync(dir)) {
      const file = join(dir, shard, "failed-tests.json");
      if (!existsSync(file)) continue;
      const rec = JSON.parse(readFileSync(file, "utf-8"));
      records.push({
        ...rec,
        branch: rec.branch || run.headBranch,
        runId: run.databaseId,
        createdAt: run.createdAt,
      });
    }
  }
  return records;
}

async function scan() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  const { createGhClient } = await import("@mbe/gh-client");
  const { fileIssueBySearch, ghIssueDeps } = await import("./lib/issue-filing.mjs");
  const ghClient = createGhClient();
  const records = collectRecords(repo, Date.now());
  const groups = groupCrossBranchFailures(records);
  process.stdout.write(`${groups.length} test(s) red on >= ${DEFAULT_MIN_BRANCHES} branches\n`);
  for (const group of groups) {
    const id = `${group.file}:${group.line}`;
    let candidates = [];
    try {
      candidates = ghClient.issue.list([
        "--label",
        "ci-fix",
        "--state",
        "all",
        "--search",
        `"E2E test red on" in:title ${id}`,
        "--json",
        "number,title,state,closedAt",
      ]);
    } catch (err) {
      console.error(`prior-issue search failed: ${err.message}`);
    }
    const prior = candidates.find((issue) => titleTestId(issue.title) === id) ?? null;
    if (shouldSuppressReopen(prior, group.key, records)) {
      process.stdout.write(`${id}: skip (closed #${prior.number}, no failures since close)\n`);
      continue;
    }
    const result = fileIssueBySearch(
      {
        title: buildIssueTitle(group),
        body: buildIssueBody(group, repo),
        labels: ["ci-fix"],
        dedupeKey: id,
      },
      { search: () => candidates, match: (issue) => titleTestId(issue.title) === id },
      ghIssueDeps(ghClient)
    );
    process.stdout.write(`${id}: ${result.action} #${result.issueNumber}\n`);
  }
}

if (import.meta.url === new URL(process.argv[1], "file://").href) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "write-record") writeRecord(rest);
  else if (cmd === "scan") await scan();
  else {
    console.error("Usage: e2e-cross-branch-red.mjs write-record <results> <out> | scan");
    process.exit(1);
  }
}
