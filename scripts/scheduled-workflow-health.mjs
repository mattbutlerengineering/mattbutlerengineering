#!/usr/bin/env node

/**
 * Scheduled Workflow Health — detects scheduled workflows failing N runs in
 * a row (#4276).
 *
 * `ci-monitor` watches `main` and open PRs. Nothing watches the scheduled
 * fleet: a scheduled workflow can fail every run indefinitely without
 * reddening any required check, without blocking any merge, and without any
 * routine noticing. `release.yml` (370 consecutive failures over 30 days)
 * and `chaos-agent.yml` (6 consecutive Monday failures) both survived weeks
 * this way, found only by a human-read weekly retro.
 *
 * This script enumerates every workflow under `.github/workflows/` that
 * carries a `schedule:` trigger, inspects each one's last N runs where
 * `event == "schedule"`, and files one deterministically-titled `ci-fix`
 * issue per workflow whose last N runs are all failures. Runs with
 * conclusion `cancelled` or `skipped` are excluded from the streak (a
 * superseded or correctly-gated run is not a defect — see
 * `revert-rca-loop.yml`, which is `skipped` by design on most runs), and a
 * workflow with fewer than N completed runs is `insufficient-history`, never
 * reported as failing.
 *
 * Design mirrors `revert-watchdog.mjs`: pure title/body/decision functions,
 * unit-tested without the network; GitHub mutations live behind injected
 * callbacks, and issue-filing dedup routes through the shared `fileIssue()`
 * seam so a rerun for the same still-failing workflow skips (still open) or
 * reopens (previously closed) instead of filing a duplicate every day.
 *
 * Usage:
 *   node scripts/scheduled-workflow-health.mjs [--threshold <n>]
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createGhClient, COORDINATION_LABELS } from "@mbe/gh-client";
import { fileIssue } from "./lib/issue-filing.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** Default number of consecutive scheduled runs required to flag a streak. */
export const DEFAULT_THRESHOLD = 3;

const EXCLUDED_CONCLUSIONS = new Set(["cancelled", "skipped"]);

/**
 * Pure, network-free decision: classifies a scheduled workflow's health from
 * its recent runs (newest first). Runs with conclusion `cancelled` or
 * `skipped` are excluded from the streak entirely, rather than counted as
 * failures or as breaking a streak.
 *
 * @param {{runs: Array<{conclusion?: string|null}>, threshold?: number}} args
 * @returns {{status: "healthy"|"failing-streak"|"insufficient-history", streak: number, failingRuns: Array}}
 */
export function classifyScheduledWorkflowHealth({ runs, threshold = DEFAULT_THRESHOLD }) {
  // Every comparison against NaN is false, so an unvalidated threshold does not
  // fail loudly — it falls through to `slice(0, NaN)` → [] → `[].every(...)`,
  // which is vacuously true, classifying EVERY workflow as a failing streak and
  // filing a ci-fix issue for each. Thresholds of 0 or a negative reach the same
  // vacuous window by a different route. Fail back to the default instead.
  const effectiveThreshold =
    Number.isInteger(threshold) && threshold > 0 ? threshold : DEFAULT_THRESHOLD;

  const relevant = (runs ?? []).filter((run) => !EXCLUDED_CONCLUSIONS.has(run?.conclusion));

  if (relevant.length < effectiveThreshold) {
    return { status: "insufficient-history", streak: relevant.length, failingRuns: [] };
  }

  const window = relevant.slice(0, effectiveThreshold);
  const isFailingStreak = window.every((run) => run.conclusion === "failure");

  if (!isFailingStreak) {
    return { status: "healthy", streak: 0, failingRuns: [] };
  }

  return { status: "failing-streak", streak: effectiveThreshold, failingRuns: window };
}

/**
 * Pure: true when `source` (a workflow YAML file's raw text) declares a
 * `schedule:` trigger nested directly under a bare `on:` key. Scoped to the
 * `on:` block only — stops at the first line back at column 0, so an
 * unrelated `schedule:`-named key elsewhere in the file (job step, etc.)
 * never matches.
 *
 * @param {string} source
 * @returns {boolean}
 */
export function hasScheduleTrigger(source) {
  const lines = source.split("\n");
  const onIndex = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (onIndex === -1) return false;

  for (let i = onIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // back at column 0 — the on: block ended
    if (/^\s+schedule:\s*$/.test(line)) return true;
  }
  return false;
}

const WORKFLOW_NAME_PATTERN = /^name:\s*(.+)\s*$/m;

/**
 * Enumerates every `.yml`/`.yaml` file under `workflowsDir` that carries a
 * `schedule:` trigger, sorted by file name for deterministic output.
 *
 * @param {string} workflowsDir
 * @returns {Array<{name: string, file: string, path: string}>}
 */
export function findScheduledWorkflows(workflowsDir) {
  const files = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));

  return files
    .map((file) => ({ file, source: readFileSync(join(workflowsDir, file), "utf-8") }))
    .filter(({ source }) => hasScheduleTrigger(source))
    .map(({ file, source }) => {
      const nameMatch = WORKFLOW_NAME_PATTERN.exec(source);
      return {
        name: nameMatch ? nameMatch[1].trim() : file,
        file,
        path: `.github/workflows/${file}`,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/** Pure: builds the deterministic ci-fix issue title so re-runs dedupe by title match. */
export function buildScheduledFailureTitle(workflowName, streak) {
  return `ci-fix: ${workflowName} has failed ${streak} consecutive scheduled runs`;
}

const SCHEDULED_FAILURE_TITLE_PATTERN = /^ci-fix: (.+) has failed \d+ consecutive scheduled runs$/;

/** Pure: extracts the workflow name an issue was filed for, from its title. */
export function extractWorkflowNameFromIssueTitle(issue) {
  const match = SCHEDULED_FAILURE_TITLE_PATTERN.exec(issue?.title ?? "");
  return match ? match[1] : null;
}

/**
 * Pure: finds a prior scheduled-failure issue for `workflowName` among
 * candidate issues (any state).
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @param {string} workflowName
 * @returns {number | null}
 */
export function findPriorScheduledFailureIssue(candidates, workflowName) {
  const match = (candidates ?? []).find(
    (issue) => extractWorkflowNameFromIssueTitle(issue) === workflowName
  );
  return match ? match.number : null;
}

/** Pure: builds the issue body naming the workflow path, streak length, and failing run URLs. */
export function buildScheduledFailureBody({ workflowPath, streak, runs }) {
  const runLines = (runs ?? [])
    .map((run) => `- ${run.url ?? "(no url)"}${run.createdAt ? ` (${run.createdAt})` : ""}`)
    .join("\n");

  return `\`${workflowPath}\` has failed its last ${streak} consecutive scheduled runs.

### Failing runs
${runLines}

**Action Required:** investigate why this scheduled workflow is failing and fix the root cause. Runs with conclusion \`cancelled\` or \`skipped\` are excluded from this streak — see .claude/rules/gotchas.md.`;
}

/** Pure: builds the `gh issue create` args for a scheduled-failure issue. */
export function buildScheduledFailureCreateArgs(title, body) {
  return [
    "--title",
    title,
    "--body",
    body,
    "--label",
    "ci-fix",
    "--label",
    COORDINATION_LABELS.READY,
  ];
}

/**
 * Orchestrates the health check across all scheduled workflows, with
 * injected GitHub operations (testable without the network). For each
 * workflow: classify its health, and on `failing-streak`, file (or dedupe
 * against) one `ci-fix` issue via the shared `fileIssue()` seam.
 *
 * @param {{
 *   workflows: Array<{name: string, path: string}>,
 *   getRuns: (workflowName: string) => Array<{conclusion?: string|null}>,
 *   threshold?: number,
 *   searchCiFixIssues?: () => Array<{number: number, title: string}>,
 *   getIssueState?: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   reopenIssue?: (issueNumber: number) => void,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Array<{workflow: string, status: string, action?: string, issueNumber?: number}>}
 */
export function runScheduledWorkflowHealthCheck({
  workflows,
  getRuns,
  threshold = DEFAULT_THRESHOLD,
  searchCiFixIssues = () => [],
  getIssueState = () => "missing",
  createIssue,
  reopenIssue = () => {},
  log = () => {},
}) {
  return workflows.map((workflow) => {
    const runs = getRuns(workflow.name);
    const health = classifyScheduledWorkflowHealth({ runs, threshold });

    if (health.status !== "failing-streak") {
      return { workflow: workflow.name, status: health.status };
    }

    const title = buildScheduledFailureTitle(workflow.name, health.streak);
    const body = buildScheduledFailureBody({
      workflowPath: workflow.path,
      streak: health.streak,
      runs: health.failingRuns,
    });
    const labels = ["ci-fix", COORDINATION_LABELS.READY];

    // A failed search must not swallow a genuine failing streak — fail open
    // (treat as "no prior found", file the issue) rather than closed.
    let candidates = [];
    try {
      candidates = searchCiFixIssues();
    } catch (err) {
      log(
        `search for a prior scheduled-failure issue failed, proceeding as no-match: ${err.message}`
      );
    }
    const priorNumber = findPriorScheduledFailureIssue(candidates, workflow.name);
    const ledger = priorNumber !== null ? { [workflow.name]: priorNumber } : {};

    const result = fileIssue({ title, body, labels, dedupeKey: workflow.name }, ledger, {
      getIssueState,
      createIssue,
      reopenIssue,
    });

    log(
      result.action === "skip"
        ? `Issue #${result.issueNumber} already tracks ${workflow.name}'s failing streak — skipping.`
        : result.action === "reopen"
          ? `Reopened issue #${result.issueNumber} for ${workflow.name}'s failing streak.`
          : `Created issue #${result.issueNumber} for ${workflow.name}'s failing streak.`
    );

    return {
      workflow: workflow.name,
      status: health.status,
      action: result.action,
      issueNumber: result.issueNumber,
    };
  });
}

/** Real `getIssueState` dep for `fileIssue()`, backed by `gh issue view`. */
function getIssueStateViaGhClient(ghClient, issueNumber) {
  try {
    const state = String(ghClient.issue.view(issueNumber, ["--json", "state"]).state).toLowerCase();
    return state === "open" ? "open" : state === "closed" ? "closed" : "missing";
  } catch {
    return "missing";
  }
}

/** Parses the issue number out of the URL `gh issue create` prints on success. */
function parseIssueNumberFromUrl(url) {
  const match = url.match(/\/issues\/(\d+)\s*$/);
  if (!match) throw new Error(`gh issue create returned unexpected output: ${url}`);
  return parseInt(match[1], 10);
}

function readFlag(args, name) {
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const thresholdArg = readFlag(args, "--threshold");
  const threshold = thresholdArg ? Number(thresholdArg) : DEFAULT_THRESHOLD;

  const workflowsDir = join(ROOT, ".github", "workflows");
  const workflows = findScheduledWorkflows(workflowsDir);

  // Diagnostic/progress output goes to stderr; the final stdout write below
  // is this script's actual product (a machine-readable JSON summary),
  // mirroring revert-watchdog.mjs's checkBaseline() convention.
  console.error(`Checking ${workflows.length} scheduled workflow(s) (threshold=${threshold}).`);

  const ghClient = createGhClient();

  const results = runScheduledWorkflowHealthCheck({
    workflows,
    threshold,
    getRuns: (name) =>
      ghClient.workflow.runs([
        "--workflow",
        name,
        "--event",
        "schedule",
        "--limit",
        String(threshold + 5),
        "--json",
        "conclusion,url,createdAt",
      ]),
    searchCiFixIssues: () =>
      ghClient.issue.list(["--label", "ci-fix", "--state", "all", "--json", "number,title"]),
    getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
    createIssue: (title, body) =>
      parseIssueNumberFromUrl(ghClient.issue.create(buildScheduledFailureCreateArgs(title, body))),
    reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
    log: (msg) => console.error(msg),
  });

  const failing = results.filter((r) => r.status === "failing-streak");
  if (failing.length > 0) {
    console.error(
      `${failing.length} scheduled workflow(s) failing ${threshold}+ consecutive runs.`
    );
  }

  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
