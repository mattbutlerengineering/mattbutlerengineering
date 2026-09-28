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

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
 * True when the workflow file changed after every failing run in the window —
 * i.e. the evidence predates the fix, so the streak says nothing about the
 * workflow's current state.
 *
 * Returns false (keep the detection) whenever the comparison cannot be made:
 * no timestamp, an unparseable one, or any run missing `createdAt`.
 *
 * @param {Array<{createdAt?: string}>} failingRuns
 * @param {string|undefined} workflowModifiedAt
 * @returns {boolean}
 */
export function allFailuresPrecede(failingRuns, workflowModifiedAt) {
  const modifiedMs = Date.parse(workflowModifiedAt ?? "");
  if (!Number.isFinite(modifiedMs)) return false;
  if (failingRuns.length === 0) return false;

  return failingRuns.every((run) => {
    const runMs = Date.parse(run?.createdAt ?? "");
    return Number.isFinite(runMs) && runMs < modifiedMs;
  });
}

/**
 * Pure, network-free decision: classifies a scheduled workflow's health from
 * its recent runs (newest first). Runs with conclusion `cancelled` or
 * `skipped` are excluded from the streak entirely, rather than counted as
 * failures or as breaking a streak.
 *
 * `workflowModifiedAt` (optional, ISO-8601) is when the workflow file itself
 * last changed. Without it the classifier cannot tell a chronically broken
 * workflow from one that was broken, fixed, and simply has not run on its
 * schedule yet — on the detector's first live run that was 2 of 5 findings
 * (#4287, and #4290 by 1h39m). When every failing run in the window predates
 * that timestamp the workflow is `awaiting-rerun`, not `failing-streak`.
 *
 * Absent, unparseable, or uncomparable inputs (runs with no `createdAt`)
 * deliberately fall back to the previous behavior: a noisy detection is
 * recoverable, a silently suppressed one is not.
 *
 * @param {{runs: Array<{conclusion?: string|null, createdAt?: string}>, threshold?: number, workflowModifiedAt?: string}} args
 * @returns {{status: "healthy"|"failing-streak"|"insufficient-history"|"awaiting-rerun", streak: number, failingRuns: Array}}
 */
export function classifyScheduledWorkflowHealth({
  runs,
  threshold = DEFAULT_THRESHOLD,
  workflowModifiedAt,
}) {
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

  if (allFailuresPrecede(window, workflowModifiedAt)) {
    return { status: "awaiting-rerun", streak: effectiveThreshold, failingRuns: window };
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

/**
 * Explicit, never-a-glob list of deploy workflows that must be evaluated for
 * a consecutive-failure streak regardless of trigger event (#5343). Deploy
 * workflows trigger on `push`/`workflow_run`/`workflow_dispatch`, never
 * `schedule` — `findScheduledWorkflows()` structurally cannot see them, so a
 * 40-run failure streak on `pulumi-up.yml` produced zero automated notice.
 * Per the `rialto-web-e2e.yml` precedent (gotchas.md § Build / pnpm /
 * turbo), a glob (e.g. `deploy-*.yml`) fails silently in either direction —
 * this list is the deliberate alternative.
 */
export const DEPLOY_WORKFLOW_FILES = ["deploy-services.yml", "deploy-static.yml", "pulumi-up.yml"];

/**
 * Enumerates the fixed `DEPLOY_WORKFLOW_FILES` set that actually exist under
 * `workflowsDir`, sorted by file name for deterministic output. Unlike
 * `findScheduledWorkflows()`, this does not inspect each file's `on:` block
 * at all — membership in the explicit list is the only criterion.
 *
 * @param {string} workflowsDir
 * @returns {Array<{name: string, file: string, path: string}>}
 */
export function findDeployWorkflows(workflowsDir) {
  return DEPLOY_WORKFLOW_FILES.filter((file) => existsSync(join(workflowsDir, file)))
    .map((file) => {
      const source = readFileSync(join(workflowsDir, file), "utf-8");
      const nameMatch = WORKFLOW_NAME_PATTERN.exec(source);
      return {
        name: nameMatch ? nameMatch[1].trim() : file,
        file,
        path: `.github/workflows/${file}`,
      };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * ## Recency / missed-run detection (#5815)
 *
 * `classifyScheduledWorkflowHealth()` above only ever asks "did recent runs
 * fail?" — a workflow that never executes has no failed runs to streak, so
 * its non-execution is structurally invisible to it. Both
 * `routine-liveness.yml` and this script's own workflow silently skipped a
 * day (2026-09-22/23) with zero automated notice. This section adds an
 * independent check — "did a run happen at all, recently enough?" — kept
 * fully separate from the failing-streak machinery above: distinct status
 * enum, distinct title pattern, distinct dedupe key namespace, and a
 * separate orchestrator (`runScheduledWorkflowRecencyCheck`) so neither can
 * be conflated with the other or with plain "healthy"/"success".
 */

/**
 * Overdue tolerance, in hours, layered on top of `periodDays`. Every
 * observed run of `routine-liveness.yml` and `scheduled-workflow-health.yml`
 * over 2026-09-20 -> 2026-09-27 started 4h51m-6h54m after its scheduled
 * minute — ordinary GitHub scheduling delay, not a defect. 12h clears that
 * measured ceiling (6h54m) with comfortable margin so a routinely-late daily
 * workflow is never misreported as overdue.
 */
export const DEFAULT_OVERDUE_TOLERANCE_HOURS = 12;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Pure, network-free: classifies how recently a scheduled workflow last ran,
 * independent of whether that run passed or failed. Returns one of four
 * mutually-exclusive states and never reports "fresh" when recency cannot be
 * established — an unparseable timestamp or an unusable period fails closed
 * to `undeterminable` rather than guessing fine, matching this repo's
 * convention elsewhere (e.g. `allFailuresPrecede` above,
 * `isTransientAuditError`): a noisy detection is recoverable, a silently
 * suppressed one is not.
 *
 * - `never-ran`: no `lastRunAt` at all.
 * - `undeterminable`: `lastRunAt` present but unparseable, or `periodDays`
 *   is not a finite positive number.
 * - `overdue`: last run older than `periodDays` plus `toleranceHours`.
 * - `fresh`: last run within that budget.
 *
 * @param {{lastRunAt?: string|null, periodDays: number, nowMs: number, toleranceHours?: number}} args
 * @returns {{status: "fresh"|"overdue"|"never-ran"|"undeterminable", ageHours: number|null}}
 */
export function classifyRunRecency({
  lastRunAt,
  periodDays,
  nowMs,
  toleranceHours = DEFAULT_OVERDUE_TOLERANCE_HOURS,
}) {
  if (lastRunAt === null || lastRunAt === undefined || lastRunAt === "") {
    return { status: "never-ran", ageHours: null };
  }

  const lastRunMs = Date.parse(lastRunAt);
  const isValidPeriod = Number.isFinite(periodDays) && periodDays > 0;
  if (!Number.isFinite(lastRunMs) || !isValidPeriod || !Number.isFinite(nowMs)) {
    return { status: "undeterminable", ageHours: null };
  }

  const ageHours = (nowMs - lastRunMs) / HOUR_MS;
  const budgetHours = periodDays * 24 + toleranceHours;

  return {
    status: ageHours > budgetHours ? "overdue" : "fresh",
    ageHours: Math.round(ageHours * 100) / 100,
  };
}

/**
 * Pure: extracts every `cron:` expression from a workflow file's `schedule:`
 * trigger, scoped to the `on:` block only — mirrors `hasScheduleTrigger`'s
 * column-0 boundary so a `cron:`-named key elsewhere in the file can never
 * leak in.
 *
 * @param {string} source
 * @returns {string[]}
 */
export function extractScheduleCrons(source) {
  const lines = source.split("\n");
  const onIndex = lines.findIndex((line) => /^on:\s*$/.test(line));
  if (onIndex === -1) return [];

  const crons = [];
  for (let i = onIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // back at column 0 — the on: block ended
    const match = /cron:\s*["']([^"']+)["']/.exec(line);
    if (match) crons.push(match[1].trim());
  }
  return crons;
}

/**
 * Best-effort period, in days, implied by a workflow's cron expression(s).
 * Deliberately conservative: any pattern this can't classify with confidence
 * returns `null` rather than guessing — a wrong guess would either miss a
 * real gap or flood `ci-fix` issues on a workflow that is actually fine.
 * Only the two shapes actually used by this repo's scheduled workflows are
 * supported:
 *   - `min hour * * *` (fixed minute+hour, every day) -> 1
 *   - `min hour * * <dow>` (fixed day-of-week, not `*`) -> 7
 * Multiple schedule entries, wildcard/step/list fields, or any dom/month
 * constraint return `null` (undeterminable).
 *
 * @param {string[]} crons
 * @returns {number|null}
 */
export function estimateCronPeriodDays(crons) {
  if (!Array.isArray(crons) || crons.length !== 1) return null;

  const fields = crons[0].trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, dom, month, dow] = fields;

  const isFixed = (field) => /^\d+$/.test(field);
  if (!isFixed(minute) || !isFixed(hour) || dom !== "*" || month !== "*") return null;

  if (dow === "*") return 1;
  return isFixed(dow) ? 7 : null;
}

/**
 * Reads a workflow file directly off disk (no git involved — unlike
 * `resolveWorkflowModifiedAt`, this only needs the file's current content)
 * and estimates its cron period. Returns `null` on any failure — missing
 * file, unreadable, or a schedule shape `estimateCronPeriodDays` doesn't
 * support — which `classifyRunRecency` treats as `undeterminable`, never as
 * "fine".
 *
 * @param {string} workflowFile file name only, e.g. "routine-liveness.yml"
 * @param {{workflowsDir?: string, readFile?: typeof readFileSync}} [deps]
 * @returns {number|null}
 */
export function resolveWorkflowPeriodDays(
  workflowFile,
  { workflowsDir = join(ROOT, ".github", "workflows"), readFile = readFileSync } = {}
) {
  try {
    const source = readFile(join(workflowsDir, workflowFile), "utf-8");
    return estimateCronPeriodDays(extractScheduleCrons(source));
  } catch {
    return null;
  }
}

/**
 * Pure: builds the deterministic missed-run ci-fix title so re-runs dedupe
 * by title match. Deliberately excludes any numeric age/streak value —
 * unlike `buildScheduledFailureTitle`'s streak (constant once a threshold is
 * hit), the age of an overdue run keeps growing, so embedding it would break
 * dedup across runs.
 */
export function buildMissedRunTitle(workflowName) {
  return `ci-fix: ${workflowName} missed its scheduled run`;
}

const MISSED_RUN_TITLE_PATTERN = /^ci-fix: (.+) missed its scheduled run$/;

/**
 * Pure: extracts the workflow name a missed-run issue was filed for, from
 * its title. Deliberately a separate pattern/function from
 * `extractWorkflowNameFromIssueTitle` — a missed-run finding and a
 * failing-streak finding for the same workflow must dedupe independently,
 * never against each other's ledger entry.
 */
export function extractWorkflowNameFromMissedRunTitle(issue) {
  const match = MISSED_RUN_TITLE_PATTERN.exec(issue?.title ?? "");
  return match ? match[1] : null;
}

/**
 * Pure: finds a prior missed-run issue for `workflowName` among candidate
 * issues (any state).
 *
 * @param {Array<{number: number, title: string}>} candidates
 * @param {string} workflowName
 * @returns {number | null}
 */
export function findPriorMissedRunIssue(candidates, workflowName) {
  const match = (candidates ?? []).find(
    (issue) => extractWorkflowNameFromMissedRunTitle(issue) === workflowName
  );
  return match ? match.number : null;
}

/** Pure: builds the issue body for a missed-run (overdue) finding. */
export function buildMissedRunBody({ workflowPath, lastRunAt, ageHours, periodDays }) {
  const lastRunLine = lastRunAt
    ? `**Last observed run:** ${lastRunAt} (${ageHours}h ago).`
    : "**Last observed run:** none found in the queried window.";

  return `\`${workflowPath}\` has not run within its expected ~${periodDays}-day schedule.

${lastRunLine}

**Action Required:** confirm whether GitHub dropped the scheduled run under load (see .claude/rules/gotchas.md § Metrics / staleness detection) or the workflow's trigger/cron configuration is broken, then re-dispatch or fix as needed.`;
}

/**
 * Orchestrates the missed-run (recency) check across scheduled workflows,
 * independent of `runScheduledWorkflowHealthCheck` above. For each workflow:
 * derive its last observed run and expected period, classify recency, and on
 * `overdue` file (or dedupe against) one `ci-fix` issue via the shared
 * `fileIssue()` seam, under a title distinct from — and never matched
 * against — the failing-streak title pattern.
 *
 * `never-ran` and `undeterminable` are reported but never filed — the same
 * restraint `insufficient-history` gets in the sibling check: neither is
 * evidence of a defect on its own (a brand-new workflow, or one with a
 * schedule shape this module can't confidently parse), and filing on it
 * would be exactly the guess `classifyRunRecency`/`estimateCronPeriodDays`
 * refuse to make.
 *
 * @param {{
 *   workflows: Array<{name: string, path: string, file: string}>,
 *   getRuns: (workflowName: string) => Array<{createdAt?: string}>,
 *   getPeriodDays: (workflowFile: string) => number|null,
 *   nowMs?: number,
 *   toleranceHours?: number,
 *   searchCiFixIssues?: () => Array<{number: number, title: string}>,
 *   getIssueState?: (issueNumber: number) => "open"|"closed"|"missing",
 *   createIssue: (title: string, body: string, labels: string[]) => number,
 *   reopenIssue?: (issueNumber: number) => void,
 *   log?: (msg: string) => void,
 * }} deps
 * @returns {Array<{workflow: string, status: string, action?: string, issueNumber?: number}>}
 */
export function runScheduledWorkflowRecencyCheck({
  workflows,
  getRuns,
  getPeriodDays,
  nowMs = Date.now(),
  toleranceHours = DEFAULT_OVERDUE_TOLERANCE_HOURS,
  searchCiFixIssues = () => [],
  getIssueState = () => "missing",
  createIssue,
  reopenIssue = () => {},
  log = () => {},
}) {
  return workflows.map((workflow) => {
    const runs = getRuns(workflow.name) ?? [];
    const lastRunAt = runs[0]?.createdAt ?? null;
    const periodDays = getPeriodDays(workflow.file);
    const recency = classifyRunRecency({ lastRunAt, periodDays, nowMs, toleranceHours });

    if (recency.status !== "overdue") {
      return { workflow: workflow.name, status: recency.status };
    }

    const title = buildMissedRunTitle(workflow.name);
    const body = buildMissedRunBody({
      workflowPath: workflow.path,
      lastRunAt,
      ageHours: recency.ageHours,
      periodDays,
    });
    const labels = ["ci-fix", COORDINATION_LABELS.READY];

    // A failed search must not swallow a genuine overdue finding — fail open
    // (treat as "no prior found", file the issue) rather than closed.
    let candidates = [];
    try {
      candidates = searchCiFixIssues();
    } catch (err) {
      log(`search for a prior missed-run issue failed, proceeding as no-match: ${err.message}`);
    }
    const priorNumber = findPriorMissedRunIssue(candidates, workflow.name);
    const ledger = priorNumber !== null ? { [workflow.name]: priorNumber } : {};

    const result = fileIssue({ title, body, labels, dedupeKey: workflow.name }, ledger, {
      getIssueState,
      createIssue,
      reopenIssue,
    });

    log(
      result.action === "skip"
        ? `Issue #${result.issueNumber} already tracks ${workflow.name}'s missed run — skipping.`
        : result.action === "reopen"
          ? `Reopened issue #${result.issueNumber} for ${workflow.name}'s missed run.`
          : `Created issue #${result.issueNumber} for ${workflow.name}'s missed run.`
    );

    return {
      workflow: workflow.name,
      status: recency.status,
      action: result.action,
      issueNumber: result.issueNumber,
    };
  });
}

/** Pure: builds the deterministic ci-fix issue title so re-runs dedupe by title match. */
export function buildScheduledFailureTitle(workflowName, streak) {
  return `ci-fix: ${workflowName} has failed ${streak} consecutive scheduled runs`;
}

/**
 * Pure: same as `buildScheduledFailureTitle`, but for a deploy workflow
 * flagged from non-`schedule` events — never claims "scheduled runs" for a
 * streak that was actually `push`/`workflow_run` (#5343 criterion 4).
 */
export function buildDeployFailureTitle(workflowName, streak) {
  return `ci-fix: ${workflowName} has failed ${streak} consecutive runs`;
}

const SCHEDULED_FAILURE_TITLE_PATTERN = /^ci-fix: (.+) has failed \d+ consecutive scheduled runs$/;
const DEPLOY_FAILURE_TITLE_PATTERN = /^ci-fix: (.+) has failed \d+ consecutive runs$/;

/** Pure: extracts the workflow name an issue was filed for, from its title. */
export function extractWorkflowNameFromIssueTitle(issue) {
  const title = issue?.title ?? "";
  const scheduledMatch = SCHEDULED_FAILURE_TITLE_PATTERN.exec(title);
  if (scheduledMatch) return scheduledMatch[1];
  const deployMatch = DEPLOY_FAILURE_TITLE_PATTERN.exec(title);
  return deployMatch ? deployMatch[1] : null;
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

/**
 * Pure: builds the issue body naming the workflow path, streak length, and
 * failing run URLs. `kind` (default `"scheduled"`) picks the wording so a
 * deploy-workflow finding never claims "scheduled runs" for a streak that
 * was actually `push`/`workflow_run` (#5343 criterion 4).
 */
export function buildScheduledFailureBody({
  workflowPath,
  streak,
  runs,
  workflowModifiedAt,
  kind = "scheduled",
}) {
  const runLines = (runs ?? [])
    .map((run) => `- ${run.url ?? "(no url)"}${run.createdAt ? ` (${run.createdAt})` : ""}`)
    .join("\n");

  // Surfaced so a human triaging this can see the fix-vs-failure ordering
  // without re-deriving it from git (#4291).
  const modifiedLine = workflowModifiedAt
    ? `\n**Workflow file last changed:** ${workflowModifiedAt} — at least one failing run above postdates it.\n`
    : "";

  const runsNoun = kind === "deploy" ? "consecutive runs" : "consecutive scheduled runs";
  const workflowNoun = kind === "deploy" ? "workflow" : "scheduled workflow";

  return `\`${workflowPath}\` has failed its last ${streak} ${runsNoun}.
${modifiedLine}
### Failing runs
${runLines}

**Action Required:** investigate why this ${workflowNoun} is failing and fix the root cause. Runs with conclusion \`cancelled\` or \`skipped\` are excluded from this streak — see .claude/rules/gotchas.md.`;
}

/** Pure: `buildScheduledFailureBody` with `kind: "deploy"` wording. */
export function buildDeployFailureBody(args) {
  return buildScheduledFailureBody({ ...args, kind: "deploy" });
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
 *   workflows: Array<{name: string, path: string, kind?: "scheduled"|"deploy"}>,
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
  getWorkflowModifiedAt = () => undefined,
}) {
  return workflows.map((workflow) => {
    const runs = getRuns(workflow.name);
    const workflowModifiedAt = getWorkflowModifiedAt(workflow.path);
    const health = classifyScheduledWorkflowHealth({ runs, threshold, workflowModifiedAt });

    if (health.status === "awaiting-rerun") {
      // Deliberately logged rather than silent: this is a suppressed
      // detection, and a suppression nobody can see is how the original
      // false positives (#4287/#4290) became believable in the first place.
      log(
        `${workflow.name}: ${health.streak} failing run(s), all predating the workflow's last change (${workflowModifiedAt}) — awaiting a post-change run, not filing.`
      );
      return { workflow: workflow.name, status: health.status };
    }

    if (health.status !== "failing-streak") {
      return { workflow: workflow.name, status: health.status };
    }

    // `kind` defaults to "scheduled" so callers that never set it (every
    // pre-#5343 call site, and every existing test) keep the exact prior
    // title/body wording — only deploy-workflow callers opt into "deploy".
    const kind = workflow.kind ?? "scheduled";
    const title =
      kind === "deploy"
        ? buildDeployFailureTitle(workflow.name, health.streak)
        : buildScheduledFailureTitle(workflow.name, health.streak);
    const body = buildScheduledFailureBody({
      workflowPath: workflow.path,
      streak: health.streak,
      runs: health.failingRuns,
      workflowModifiedAt,
      kind,
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

/**
 * Committer date of the workflow file's most recent commit, ISO-8601.
 *
 * Returns undefined on any failure (not a checkout, path never committed,
 * git unavailable) — the classifier treats that as "cannot compare" and keeps
 * the previous detection behavior rather than suppressing it (#4291).
 *
 * Also returns undefined when the repo is a shallow clone: `git log -1 --
 * <path>` in a depth-1 checkout reports the single commit it has regardless
 * of whether that commit touched `path`, which makes every workflow's
 * "modified at" resolve to HEAD's date and silently suppresses every
 * genuine failing streak (#4502). This is belt-and-braces — the workflow's
 * checkout step should already fetch full history — so a shallow clone is
 * treated the same as any other "cannot compare" case, not a hard error.
 *
 * @param {string} workflowPath repo-relative path, e.g. `.github/workflows/ci.yml`
 * @param {{exec?: typeof execFileSync}} [deps]
 * @returns {string|undefined}
 */
export function resolveWorkflowModifiedAt(workflowPath, { exec = execFileSync } = {}) {
  try {
    const shallow = exec("git", ["rev-parse", "--is-shallow-repository"], {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (shallow === "true") return undefined;

    const out = exec("git", ["log", "-1", "--format=%cI", "--", workflowPath], {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function main() {
  const args = process.argv.slice(2);
  const thresholdArg = readFlag(args, "--threshold");
  const threshold = thresholdArg ? Number(thresholdArg) : DEFAULT_THRESHOLD;

  const workflowsDir = join(ROOT, ".github", "workflows");
  const scheduledWorkflows = findScheduledWorkflows(workflowsDir);
  const deployWorkflows = findDeployWorkflows(workflowsDir);

  // Diagnostic/progress output goes to stderr; the final stdout write below
  // is this script's actual product (a machine-readable JSON summary),
  // mirroring revert-watchdog.mjs's checkBaseline() convention.
  console.error(
    `Checking ${scheduledWorkflows.length} scheduled + ${deployWorkflows.length} deploy workflow(s) (threshold=${threshold}).`
  );

  const ghClient = createGhClient();
  const commonDeps = {
    threshold,
    searchCiFixIssues: () =>
      ghClient.issue.list(["--label", "ci-fix", "--state", "all", "--json", "number,title"]),
    getIssueState: (issueNumber) => getIssueStateViaGhClient(ghClient, issueNumber),
    createIssue: (title, body) =>
      parseIssueNumberFromUrl(ghClient.issue.create(buildScheduledFailureCreateArgs(title, body))),
    reopenIssue: (issueNumber) => ghClient.issue.reopen(issueNumber),
    log: (msg) => console.error(msg),
    getWorkflowModifiedAt: (workflowPath) => resolveWorkflowModifiedAt(workflowPath),
  };

  // Memoized so the recency check below can reuse the exact same fetch
  // rather than issuing a second `gh` call per scheduled workflow (#5815) —
  // `runs[0]` (newest-first) is also this script's only signal for "when did
  // this workflow last run at all", regardless of pass/fail.
  const scheduledRunsCache = new Map();
  const getScheduledRuns = (name) => {
    if (!scheduledRunsCache.has(name)) {
      scheduledRunsCache.set(
        name,
        ghClient.workflow.runs([
          "--workflow",
          name,
          "--event",
          "schedule",
          "--limit",
          String(threshold + 5),
          "--json",
          "conclusion,url,createdAt",
        ])
      );
    }
    return scheduledRunsCache.get(name);
  };

  const scheduledResults = runScheduledWorkflowHealthCheck({
    ...commonDeps,
    workflows: scheduledWorkflows,
    getRuns: getScheduledRuns,
  });

  const recencyResults = runScheduledWorkflowRecencyCheck({
    workflows: scheduledWorkflows,
    getRuns: getScheduledRuns,
    getPeriodDays: (file) => resolveWorkflowPeriodDays(file, { workflowsDir }),
    searchCiFixIssues: commonDeps.searchCiFixIssues,
    getIssueState: commonDeps.getIssueState,
    createIssue: commonDeps.createIssue,
    reopenIssue: commonDeps.reopenIssue,
    log: commonDeps.log,
  });

  // No `--event` filter here: deploy workflows trigger on push/workflow_run/
  // workflow_dispatch, never schedule (#5343) — the whole point is to
  // evaluate them regardless of which event produced the run.
  const deployResults = runScheduledWorkflowHealthCheck({
    ...commonDeps,
    workflows: deployWorkflows.map((w) => ({ ...w, kind: "deploy" })),
    getRuns: (name) =>
      ghClient.workflow.runs([
        "--workflow",
        name,
        "--limit",
        String(threshold + 5),
        "--json",
        "conclusion,url,createdAt",
      ]),
  });

  const results = [...scheduledResults, ...deployResults];

  const failing = results.filter((r) => r.status === "failing-streak");
  if (failing.length > 0) {
    console.error(`${failing.length} workflow(s) failing ${threshold}+ consecutive runs.`);
  }

  const overdue = recencyResults.filter((r) => r.status === "overdue");
  if (overdue.length > 0) {
    console.error(`${overdue.length} workflow(s) missed a scheduled run.`);
  }

  // A separate top-level key, not merged into `results`: `results` entries
  // use the failing-streak status enum, `recency` entries use a disjoint one
  // (fresh/overdue/never-ran/undeterminable) — keeping them apart prevents
  // any consumer from accidentally treating one status set as the other.
  process.stdout.write(`${JSON.stringify({ results, recency: recencyResults }, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
