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
 * Usage:
 *   node scripts/metrics-freshness.mjs
 * Exit code: 0 when every watched metric is fresh, 1 otherwise.
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
 * @returns {{ state: "fresh"|"stale"|"empty"|"undated", latest: string|null, ageDays: number|null }}
 */
export function classifyFreshness({ entries, timestampField, maxAgeDays, now }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { state: "empty", latest: null, ageDays: null };
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
    return { ...entry, ...classifyFreshness({ ...entry, entries, now }) };
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
 * broken pipeline, while a stale one at least worked once.
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
    severity: result.state === "stale" ? "medium" : "high",
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

  process.exit(
    runCheck({
      name: "metrics freshness",
      findings,
      formatFinding,
      failMessage: `FAIL: metrics freshness — ${findings.length} metric(s) stale or empty:`,
    })
  );
}
