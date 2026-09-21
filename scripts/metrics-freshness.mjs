#!/usr/bin/env node

/**
 * Staleness/emptiness self-check for the two metrics files that went
 * silently dead (#5529, tracking #5532).
 *
 * `metrics/domain-metrics.jsonl` has been 0 bytes since it was created;
 * `metrics/review-burden.json` holds exactly one entry, from 2026-06-14.
 * Neither absence reddened anything, because nothing was asking. The only
 * reason either was found was a human reading the directory by hand. Once
 * `.github/workflows/metrics-collectors.yml` (#5528) actually runs both
 * collectors, the next silent death — the workflow stops firing, a refactor
 * breaks the fetch, the venue credential expires — has to announce itself.
 *
 * ## Why this is not a `scripts/check-*.mjs` fitness check
 *
 * The `check-*` prefix in this repo means "wired into `pnpm repo-audit` /
 * CI, fails the build" (see scripts/__tests__/check-fitness-check-wiring.test.mjs).
 * This is deliberately NOT that. Both metrics are stale *right now* and
 * `domain-metrics` cannot become fresh until a human supplies
 * `DOMAIN_METRICS_VENUE_ID` — so gating `main` on it would red every PR for
 * a reason no PR author caused or can fix. Instead it reports through two
 * paths that already exist:
 *
 *   1. the `metricsFreshness` sensor in scripts/sensors-registry.mjs, whose
 *      `detectRegression` feeds `/learning-loop`'s existing triage step; and
 *   2. `.github/workflows/metrics-collectors.yml`, which runs this CLI right
 *      after collecting and files one deduped `ci-fix` issue through the
 *      shared `fileIssue()` seam when the verdict is non-zero.
 *
 * ## Fail-closed by construction
 *
 * `fresh` is the ONLY passing state. Empty file, missing file, non-array
 * payload, entries whose timestamp field is absent or unparseable, and a
 * read that throws are all findings. So is an empty result set — zero
 * metrics assessed is the "nothing ever entered the counted set" shape this
 * check exists to detect, not a vacuous pass.
 *
 * ## Two kinds of finding
 *
 * `unconfigured` (empty AND a declared prerequisite env var is absent) is
 * human-blocked; every other non-fresh state is actionable. They must file
 * under DIFFERENT dedupe keys — sharing one let the permanently-blocked
 * domain-metrics issue absorb a real review-burden failure (#5561). Both are
 * still findings, so the exit code is unchanged.
 *
 * Usage:
 *   node scripts/metrics-freshness.mjs           # human-readable
 *   node scripts/metrics-freshness.mjs --json    # { blocked, failures, lines }
 * Exit code: 0 when every watched metric is fresh, 1 otherwise — in both modes.
 */

import { fileURLToPath } from "node:url";
import { read } from "./metrics-store.mjs";
import { runCheck } from "./lib/fitness-check.mjs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The metrics this check watches, and how to read a timestamp out of each.
 *
 * `maxAgeDays` is 3 for both: `metrics-collectors.yml` runs them daily, and
 * the repo's convention for a staleness threshold is ~3x the collection
 * interval, so a single skipped or failed run is not an alert.
 *
 * @type {Array<{ metric: string, timestampField: string, maxAgeDays: number, producer: string }>}
 */
export const FRESHNESS_POLICY = [
  {
    metric: "domain-metrics",
    timestampField: "collected_at",
    maxAgeDays: 3,
    producer: "scripts/collect-domain-metrics.mjs",
    // A real production venue identifier no agent can invent, so an empty
    // domain-metrics is human-blocked rather than broken (#5561).
    requiresEnv: "DOMAIN_METRICS_VENUE_ID",
  },
  {
    metric: "review-burden",
    timestampField: "timestamp",
    maxAgeDays: 3,
    producer: "scripts/acmm/review-burden-metrics.js",
  },
];

/** The one passing state. Anything else — named or not — is a finding. */
export const FRESH = "fresh";

/**
 * Empty *because a declared prerequisite is absent* — a human-blocked state,
 * not a broken collector.
 *
 * Still a finding (see `freshnessFindings`), so the exit code stays non-zero
 * and nothing here becomes a silent pass. It exists only so the workflow can
 * route it to its OWN deduped issue: when a permanently-blocked metric and a
 * genuinely-failing one shared a dedupe key, the blocker's already-open issue
 * absorbed the real failure and it announced nothing (#5561).
 */
export const UNCONFIGURED = "unconfigured";

/**
 * Whether a metric's declared prerequisite env var is absent.
 *
 * A blank string counts as absent: `gh secret set NAME` with empty stdin
 * silently sets `""` (.claude/rules/gotchas.md § Auth0 / E2E), so a blank
 * value is the realistic shape of "never configured", not of a real value.
 *
 * @param {string|undefined} requiresEnv
 * @param {Record<string, string|undefined>} env
 * @returns {boolean}
 */
export function isPrerequisiteMissing(requiresEnv, env) {
  if (!requiresEnv) return false;
  return (env?.[requiresEnv] ?? "").trim() === "";
}

/**
 * Newest parseable timestamp across `entries`, as epoch ms.
 *
 * Deliberately a max rather than "the last row": a collector that appends
 * out of order, or a JSON array rewritten by a different writer, must not
 * be able to make a fresh file look stale.
 *
 * @param {unknown[]} entries
 * @param {string} timestampField
 * @returns {number|null} epoch ms, or null when nothing parses
 */
export function newestTimestampMs(entries, timestampField) {
  let newest = null;
  for (const entry of entries) {
    const raw = entry && typeof entry === "object" ? entry[timestampField] : undefined;
    const ms = Date.parse(typeof raw === "string" ? raw : "");
    if (!Number.isFinite(ms)) continue;
    if (newest === null || ms > newest) newest = ms;
  }
  return newest;
}

/**
 * Classify one metric's entries.
 *
 * @param {object} params
 * @param {unknown} params.entries - whatever `read()` returned (array, null, or worse)
 * @param {string} params.timestampField
 * @param {number} params.maxAgeDays
 * @param {Date} params.now
 * @returns {{ state: "fresh"|"stale"|"empty"|"undated"|"unconfigured", latest: string|null, ageDays: number|null }}
 */
export function classifyFreshness({
  entries,
  timestampField,
  maxAgeDays,
  now,
  requiresEnv,
  env = {},
}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return {
      state: isPrerequisiteMissing(requiresEnv, env) ? UNCONFIGURED : "empty",
      latest: null,
      ageDays: null,
    };
  }

  const newestMs = newestTimestampMs(entries, timestampField);
  if (newestMs === null) {
    return { state: "undated", latest: null, ageDays: null };
  }

  const ageDays = Math.round(((now.getTime() - newestMs) / MS_PER_DAY) * 100) / 100;
  return {
    state: ageDays > maxAgeDays ? "stale" : FRESH,
    latest: new Date(newestMs).toISOString(),
    ageDays,
  };
}

/**
 * Assess every metric in the policy. Never throws: a read failure becomes an
 * `unreadable` result, which is a finding like any other non-fresh state.
 *
 * @param {object} [params]
 * @param {(metric: string) => unknown} [params.readMetric] - injectable reader
 * @param {Date} [params.now]
 * @param {typeof FRESHNESS_POLICY} [params.policy]
 * @returns {Array<object>}
 */
export function assessFreshness({
  readMetric = (metric) => read(metric),
  now = new Date(),
  policy = FRESHNESS_POLICY,
  env = process.env,
} = {}) {
  return policy.map((entry) => {
    let entries;
    try {
      entries = readMetric(entry.metric);
    } catch (error) {
      return {
        ...entry,
        state: "unreadable",
        latest: null,
        ageDays: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    return { ...entry, ...classifyFreshness({ ...entry, entries, now, env }) };
  });
}

/**
 * Every result that is not explicitly `fresh`.
 *
 * @param {Array<{ state: string }>} results
 * @returns {Array<object>}
 */
export function freshnessFindings(results) {
  return results.filter((result) => result.state !== FRESH);
}

/**
 * Split findings into the ones a human must unblock and the ones that are
 * genuinely broken.
 *
 * The two must file under DIFFERENT dedupe keys. A permanently-blocked metric
 * opens its issue once and keeps it open forever; if a real collector failure
 * dedupes into that same issue, it is absorbed and nobody is told (#5561).
 * Every non-fresh state that is not explicitly `unconfigured` counts as a
 * failure — including states this module does not yet name, so a new state
 * defaults to "actionable" rather than to "someone else's problem".
 *
 * @param {Array<{ state: string }>} results
 * @returns {{ blocked: Array<object>, failures: Array<object> }}
 */
export function partitionFindings(results) {
  const findings = freshnessFindings(results);
  return {
    blocked: findings.filter((result) => result.state === UNCONFIGURED),
    failures: findings.filter((result) => result.state !== UNCONFIGURED),
  };
}

/**
 * Exit code for a set of results. An empty set fails: assessing nothing is
 * indistinguishable from a check that stopped running.
 *
 * @param {Array<{ state: string }>} results
 * @returns {0|1}
 */
export function freshnessExitCode(results) {
  if (results.length === 0) return 1;
  return freshnessFindings(results).length > 0 ? 1 : 0;
}

/**
 * Translate results into the regression shape `/learning-loop`'s triage step
 * already consumes (see `buildReport` in scripts/build-sensor-report.mjs).
 *
 * `empty` outranks `stale`: a metric that has never produced a row is a
 * broken pipeline, while a stale one at least worked once. `unconfigured`
 * ranks below both — it is waiting on a human, so it must not keep
 * re-entering the loop's triage as a fresh actionable regression (#5561).
 *
 * @param {Array<{ metric: string, state: string, ageDays: number|null, latest?: string|null }>} results
 * @returns {Array<object>}
 */
export function freshnessRegressions(results) {
  return freshnessFindings(results).map((result) => ({
    sensor: "metricsFreshness",
    metric: result.metric,
    current: result.state,
    previous: result.latest ?? null,
    delta: result.ageDays,
    severity: result.state === UNCONFIGURED ? "low" : result.state === "stale" ? "medium" : "high",
  }));
}

/**
 * One human-readable line per finding.
 *
 * @param {{ metric: string, state: string, ageDays: number|null, latest: string|null, producer?: string, error?: string }} result
 * @returns {string}
 */
export function formatFinding(result) {
  const age = result.ageDays === null ? "no dated entry" : `${result.ageDays}d old`;
  const detail = result.error ? ` (${result.error})` : "";
  return `${result.metric}: ${result.state} — ${age}${detail}; written by ${result.producer ?? "unknown producer"}`;
}

/* ── CLI ─────────────────────────────────────────────────── */

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const results = assessFreshness();

  // An empty policy must not render as PASS — freshnessExitCode() already
  // calls that state a failure, so the reported findings have to agree.
  const findings =
    results.length === 0
      ? [{ metric: "(none)", state: "unassessed", ageDays: null, latest: null }]
      : freshnessFindings(results);

  if (process.argv.includes("--json")) {
    // Machine-readable routing for metrics-collectors.yml: the two arrays get
    // separate issues under separate dedupe keys. `lines` is the same text the
    // human mode prints, so the step summary need not re-derive it.
    //
    // An `unassessed` synthetic finding (empty policy) has no `state` the
    // partition recognises, so it lands in `failures` — the correct side: a
    // policy that assessed nothing is broken, not waiting on a human.
    const { blocked, failures } = partitionFindings(findings);
    process.stdout.write(
      `${JSON.stringify({ blocked, failures, lines: findings.map(formatFinding) }, null, 2)}\n`
    );
    process.exit(freshnessExitCode(results));
  }

  process.exit(
    runCheck({
      name: "metrics freshness",
      findings,
      formatFinding,
      failMessage: `FAIL: metrics freshness — ${findings.length} metric(s) stale or empty:`,
    })
  );
}
