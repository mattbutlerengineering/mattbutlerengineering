#!/usr/bin/env node
/**
 * dev-speed-report.mjs — the fixed arithmetic behind the mbe-dev-speed routine.
 *
 * The routine used to compute percentiles by hand from "the 15 newest runs",
 * which read CI wall p50 as 122 min when the 7-day truth was 13 (#10113). This
 * script owns the measurement so every fire, and every before/after verdict,
 * uses the same window, the same sample and the same statistics.
 *
 * Usage:
 *   node scripts/dev-speed-report.mjs [--days 7] [--sample 60] [--json]
 *   node scripts/dev-speed-report.mjs --since <ISO> --job <name> [--control <name>]
 *
 * Report mode prints the ledger tables (markdown, or JSON with --json):
 *   wall     push -> CI Gate p50/p90 and the share spent waiting, not working
 *   jobs     per job: median and p90 run time and queue wait, critical-path share
 *   backlog  median queue wait of jobs created in the last hour
 *   deploys  merge -> deployed lead time and failures, from the deploy JOB
 * Verdict mode prints the same job row for runs created after a merge, for the
 * target job and one control job.
 *
 * Not measured: turbo cache hit or miss per job. That needs a log download per
 * job; a cache-miss tail shows here as a p90 far above the median.
 */
import { fileURLToPath } from "node:url";
import { gh, ghPaged, percentile, selectGateSample } from "./collect-sdlc-speed.mjs";

const GATE_JOB_NAME = "CI Gate";
const DEPLOY_WORKFLOW = "deploy-services.yml";
const DEPLOY_JOB_NAME = "Deploy API Services";
const BACKLOG_WINDOW_MIN = 60;
/** Newest runs (any state) read for the live backlog figure. */
const BACKLOG_RUNS = 10;
/** Deploy runs read per report; one `jobs` call each. */
const MAX_DEPLOY_RUNS = 30;
const MS_PER_MIN = 60_000;

const ms = (iso) => Date.parse(iso ?? "");
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ran = (j) => j?.conclusion === "success" || j?.conclusion === "failure";

/**
 * @param {{ name: string, conclusion?: string|null, created_at?: string,
 *   started_at?: string|null, completed_at?: string|null }} job
 * @returns {{ name: string, runMin: number, queueMin: number } | null} null
 *   unless the job ran to success or failure
 */
export function jobTimes(job) {
  if (!ran(job)) return null;
  const runMin = (ms(job.completed_at) - ms(job.started_at)) / MS_PER_MIN;
  const queueMin = (ms(job.started_at) - ms(job.created_at)) / MS_PER_MIN;
  if (!Number.isFinite(runMin) || !Number.isFinite(queueMin)) return null;
  return { name: job.name, runMin: round1(runMin), queueMin: round1(Math.max(0, queueMin)) };
}

/**
 * The jobs that decided when CI Gate finished, earliest first. Walks back from
 * CI Gate: the predecessor of a job is the one that completed last before that
 * job was created, since GitHub creates a job once its `needs` are done.
 * Empty when CI Gate never completed.
 */
export function criticalChain(jobs) {
  const done = jobs.filter((j) => ran(j) && Number.isFinite(ms(j.completed_at)));
  let current = done.find((j) => j.name === GATE_JOB_NAME);
  const chain = [];
  while (current) {
    chain.unshift(current);
    const releasedAt = ms(current.created_at ?? current.started_at);
    const earlier = done.filter((j) => !chain.includes(j) && ms(j.completed_at) <= releasedAt);
    current = earlier.sort((a, b) => ms(b.completed_at) - ms(a.completed_at))[0];
  }
  return chain;
}

/**
 * @param {Array<{ run: object, jobs: object[] }>} runs
 * @returns per-job rows, largest median run time first
 */
export function summarizeJobs(runs) {
  const byName = new Map();
  for (const { jobs } of runs) {
    const critical = new Set(criticalChain(jobs).map((j) => j.name));
    for (const job of jobs) {
      const t = jobTimes(job);
      if (!t) continue;
      const prev = byName.get(t.name) ?? { run: [], queue: [], critical: 0 };
      byName.set(t.name, {
        run: [...prev.run, t.runMin],
        queue: [...prev.queue, t.queueMin],
        critical: prev.critical + (critical.has(t.name) ? 1 : 0),
      });
    }
  }
  return [...byName]
    .map(([name, v]) => ({
      name,
      n: v.run.length,
      runP50: percentile(v.run, 50),
      runP90: percentile(v.run, 90),
      queueP50: percentile(v.queue, 50),
      queueP90: percentile(v.queue, 90),
      criticalShare: round2(v.critical / v.run.length),
    }))
    .sort((a, b) => b.runP50 - a.runP50 || (a.name < b.name ? -1 : 1));
}

/**
 * Push -> CI Gate wall time, and how much of it was waiting: one minus the run
 * time of the critical chain over the wall time. `queueShareSlowest` is the same
 * share over the runs at or above p90, where ADR-036's goal is decided.
 */
export function attributeWall(runs) {
  const measured = runs
    .map(({ run, jobs }) => {
      const chain = criticalChain(jobs);
      if (chain.length === 0) return null;
      const wallMin = (ms(chain.at(-1).completed_at) - ms(run.created_at)) / MS_PER_MIN;
      if (!Number.isFinite(wallMin) || wallMin <= 0) return null;
      const workMin = chain.reduce((sum, j) => sum + (jobTimes(j)?.runMin ?? 0), 0);
      return { wallMin: round1(wallMin), share: Math.min(1, Math.max(0, 1 - workMin / wallMin)) };
    })
    .filter(Boolean);
  const walls = measured.map((m) => m.wallMin);
  const p90 = percentile(walls, 90);
  return {
    runs: measured.length,
    p50: percentile(walls, 50),
    p90,
    queueShare: round2(mean(measured.map((m) => m.share))),
    queueShareSlowest: round2(mean(measured.filter((m) => m.wallMin >= p90).map((m) => m.share))),
  };
}

/**
 * Median queue wait of jobs created in the last hour; a still-queued job counts
 * its wait so far. Skipped and cancelled jobs never waited for a runner.
 */
export function backlogNow(jobs, now, windowMin = BACKLOG_WINDOW_MIN) {
  const from = now.getTime() - windowMin * MS_PER_MIN;
  const waits = jobs
    .filter(
      (j) => ms(j.created_at) >= from && j.conclusion !== "skipped" && j.conclusion !== "cancelled"
    )
    .map(
      (j) =>
        ((Number.isFinite(ms(j.started_at)) ? ms(j.started_at) : now.getTime()) -
          ms(j.created_at)) /
        MS_PER_MIN
    )
    .filter(Number.isFinite)
    .map(round1);
  return { jobs: waits.length, medianQueueMin: percentile(waits, 50) };
}

/**
 * Merge -> deployed, from the deploy JOB: a workflow-level `success` can be a
 * run whose deploy job was skipped. Each run is one services-touching push to
 * main; a later successful deploy ships every earlier push too.
 * @param {Array<{ id: number, created_at: string, jobs: object[] }>} deployRuns
 */
export function summarizeDeploys(deployRuns, now) {
  const runs = [...deployRuns].sort((a, b) => ms(a.created_at) - ms(b.created_at));
  const deployedAt = (r) => {
    const job = r.jobs.find((j) => j.name === DEPLOY_JOB_NAME && j.conclusion === "success");
    return job ? ms(job.completed_at) : null;
  };
  const leads = [];
  const undeployed = [];
  runs.forEach((run, i) => {
    const shippedBy = runs
      .slice(i)
      .map(deployedAt)
      .find((t) => t !== null);
    if (shippedBy === undefined) undeployed.push(run);
    else leads.push(round1((shippedBy - ms(run.created_at)) / MS_PER_MIN));
  });
  const failuresByStep = {};
  for (const run of runs) {
    for (const job of run.jobs.filter((j) => j.conclusion === "failure")) {
      const step = (job.steps ?? []).find((s) => s.conclusion === "failure");
      const key = step ? `${job.name} / ${step.name}` : job.name;
      failuresByStep[key] = (failuresByStep[key] ?? 0) + 1;
    }
  }
  return {
    runs: runs.length,
    deployed: runs.filter((r) => deployedAt(r) !== null).length,
    leadP50: percentile(leads, 50),
    leadP90: percentile(leads, 90),
    failuresByStep,
    undeployed: undeployed.length,
    oldestUndeployedMin: undeployed.length
      ? round1((now.getTime() - ms(undeployed[0].created_at)) / MS_PER_MIN)
      : 0,
  };
}

/** The target and control job rows over runs created at or after `since`. */
export function verdictRows(runs, { since, job, control }) {
  const after = runs.filter(({ run }) => ms(run.created_at) >= ms(since));
  const rows = summarizeJobs(after);
  const target = rows.find((r) => r.name === job) ?? null;
  return {
    since,
    runs: target?.n ?? 0,
    target,
    control: rows.find((r) => r.name === control) ?? null,
  };
}

const pct = (share) => `${Math.round(share * 100)}%`;

export function renderMarkdown({ days, wall, jobs, backlog, deploys }) {
  const deployLine = deploys
    ? `merge→deploy p50 ${deploys.leadP50}m p90 ${deploys.leadP90}m · ${deploys.deployed}/${deploys.runs} deployed · ${deploys.undeployed} undeployed (oldest ${deploys.oldestUndeployedMin}m)`
    : "merge→deploy: not measured";
  const head = [
    `window ${days}d · ${wall.runs} PR runs · CI wall p50 ${wall.p50}m p90 ${wall.p90}m (queue ${pct(wall.queueShareSlowest)} at p90)`,
    `backlog now: median queue ${backlog.medianQueueMin}m over ${backlog.jobs} jobs`,
    deployLine,
  ];
  const rows = jobs.map(
    (j, i) =>
      `| ${i + 1} | ${j.name} | ${j.runP50} | ${j.runP90} | ${j.queueP50} | ${j.queueP90} | ${pct(j.criticalShare)} | ${j.n} |`
  );
  const failures = Object.entries(deploys?.failuresByStep ?? {}).map(
    ([step, n]) => `- deploy failure: ${step} ×${n}`
  );
  return [
    ...head,
    "",
    "| Rank | Job | Median run (m) | p90 run (m) | Median queue (m) | p90 queue (m) | Critical path | n |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    ...(failures.length ? ["", ...failures] : []),
    "",
  ].join("\n");
}

// ── I/O (CLI only) ───────────────────────────────────────────────────────

const REPO = "repos/{owner}/{repo}";
const JOB_JQ =
  "[.jobs[] | {name,conclusion,created_at,started_at,completed_at,steps:[.steps[]? | {name,conclusion}]}]";
const fetchJobs = (id) =>
  JSON.parse(gh(["api", `${REPO}/actions/runs/${id}/jobs?per_page=100`, "--jq", JOB_JQ]));
const fetchRuns = (workflow, query) =>
  ghPaged(
    `${REPO}/actions/workflows/${workflow}/runs?${query}`,
    ".workflow_runs[] | {id,conclusion,run_attempt,created_at}"
  ).map((l) => JSON.parse(l));

const flag = (argv, name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

function main(argv) {
  const now = new Date();
  const days = Number(flag(argv, "--days", 7));
  const sample = Number(flag(argv, "--sample", 60));
  const since = flag(argv, "--since", null);
  const day = (since ?? new Date(now.getTime() - days * 86_400_000).toISOString()).slice(0, 10);
  if (!Number.isFinite(days) || !Number.isFinite(sample) || Number.isNaN(ms(day))) {
    throw new Error("dev-speed-report: --days and --sample take numbers, --since an ISO timestamp");
  }

  const listed = fetchRuns("ci.yml", `event=pull_request&created=>=${day}`);
  const sampled = selectGateSample(listed, sample).map((run) => ({ run, jobs: fetchJobs(run.id) }));

  if (since) {
    const job = flag(argv, "--job", null);
    if (!job) throw new Error("dev-speed-report: --since needs --job <name>");
    const verdict = verdictRows(sampled, { since, job, control: flag(argv, "--control", null) });
    process.stdout.write(JSON.stringify(verdict, null, 2) + "\n");
    return;
  }

  const liveJobs = listed.slice(0, BACKLOG_RUNS).flatMap((run) => fetchJobs(run.id));
  const deployRuns = fetchRuns(DEPLOY_WORKFLOW, `branch=main&created=>=${day}`)
    .slice(0, MAX_DEPLOY_RUNS)
    .map((run) => ({ ...run, jobs: fetchJobs(run.id) }));
  const report = {
    date: now.toISOString(),
    days,
    listedRuns: listed.length,
    wall: attributeWall(sampled),
    jobs: summarizeJobs(sampled),
    backlog: backlogNow(liveJobs, now),
    deploys: summarizeDeploys(deployRuns, now),
  };
  process.stdout.write(
    argv.includes("--json") ? JSON.stringify(report, null, 2) + "\n" : renderMarkdown(report)
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
