/**
 * Tests for the metrics staleness/emptiness self-check (#5529).
 *
 * The whole point of this check is that it must FIRE. The collector it
 * watches was silently dead for months — `metrics/review-burden.json` held
 * one entry from 2026-06-14 — and nothing went red, because nothing was
 * looking. A self-check that passes on an empty dataset would reproduce that
 * exact failure one level up: it would read as a safety net while pinning
 * nothing. (A sibling `domain-metrics` policy entry used to be watched here
 * too, until the collector behind it was retired in #5561 — it needed a
 * production credential nobody would provision. The `unconfigured`/`blocked`
 * mechanism it exercised below is exercised with synthetic fixtures now.)
 *
 * So the load-bearing assertions here are the negative ones — empty, stale,
 * undated, unreadable inputs must each produce a finding and a non-zero exit
 * code. `fresh` is the ONLY state that passes; every other state, including
 * states this module does not yet name, fails closed.
 */

import { describe, it, expect } from "vitest";
import {
  FRESHNESS_POLICY,
  classifyFreshness,
  assessFreshness,
  assessQueueTelemetryCompleteness,
  freshnessFindings,
  freshnessRegressions,
  freshnessExitCode,
  partitionFindings,
  formatFinding,
} from "../metrics-freshness.mjs";
import { METRICS } from "../metrics-store.mjs";

const NOW = new Date("2026-09-20T12:00:00.000Z");

/** One row that satisfies every policy entry's timestamp field AND health predicate. */
const FRESH_ROWS = [
  {
    timestamp: new Date(NOW.getTime()).toISOString(),
    collected_at: new Date(NOW.getTime()).toISOString(),
    claimed_at: new Date(NOW.getTime()).toISOString(),
    date: "2026-09-20",
    sensor: "queueEfficiency",
    available: true,
    categories: {},
  },
  { date: "2026-09-20", sensor: "sdlcSpeed", available: true },
];

const SDLC_ROW = { date: "2026-09-20", sensor: "sdlcSpeed", available: true };

/** `daysAgo(2)` -> an ISO timestamp two days before NOW. */
function daysAgo(days) {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

describe("classifyFreshness", () => {
  const base = { timestampField: "timestamp", maxAgeDays: 3, now: NOW };

  it("flags an empty array as empty, never fresh", () => {
    const result = classifyFreshness({ ...base, entries: [] });
    expect(result.state).toBe("empty");
    expect(result.latest).toBeNull();
    expect(result.ageDays).toBeNull();
  });

  it("flags a missing file (null) as empty", () => {
    expect(classifyFreshness({ ...base, entries: null }).state).toBe("empty");
  });

  it("flags a non-array payload as empty rather than trusting it", () => {
    expect(classifyFreshness({ ...base, entries: { timestamp: daysAgo(0) } }).state).toBe("empty");
  });

  it("flags entries older than the threshold as stale", () => {
    const result = classifyFreshness({ ...base, entries: [{ timestamp: daysAgo(10) }] });
    expect(result.state).toBe("stale");
    expect(result.ageDays).toBe(10);
    expect(result.latest).toBe(daysAgo(10));
  });

  it("passes entries inside the threshold as fresh", () => {
    const result = classifyFreshness({ ...base, entries: [{ timestamp: daysAgo(1) }] });
    expect(result.state).toBe("fresh");
    expect(result.ageDays).toBe(1);
  });

  it("uses the newest entry, not the last one written", () => {
    const entries = [{ timestamp: daysAgo(0.5) }, { timestamp: daysAgo(30) }];
    expect(classifyFreshness({ ...base, entries }).state).toBe("fresh");
  });

  it("treats exactly the threshold as fresh and a hair over as stale", () => {
    expect(classifyFreshness({ ...base, entries: [{ timestamp: daysAgo(3) }] }).state).toBe(
      "fresh"
    );
    expect(classifyFreshness({ ...base, entries: [{ timestamp: daysAgo(3.01) }] }).state).toBe(
      "stale"
    );
  });

  it("flags entries with no timestamp field as undated, not fresh", () => {
    // The dangerous direction: an entry whose timestamp key was renamed by a
    // refactor would otherwise read as "present, therefore fine".
    const result = classifyFreshness({ ...base, entries: [{ collected: daysAgo(0) }] });
    expect(result.state).toBe("undated");
  });

  it("flags an unparseable timestamp as undated", () => {
    expect(classifyFreshness({ ...base, entries: [{ timestamp: "not-a-date" }] }).state).toBe(
      "undated"
    );
  });

  it("reads the configured timestamp field, not a hardcoded one", () => {
    const result = classifyFreshness({
      entries: [{ collected_at: daysAgo(1) }],
      timestampField: "collected_at",
      maxAgeDays: 3,
      now: NOW,
    });
    expect(result.state).toBe("fresh");
  });
});

describe("FRESHNESS_POLICY", () => {
  it("no longer watches domain-metrics — the collector was retired (#5561)", () => {
    expect(FRESHNESS_POLICY.map((p) => p.metric).sort()).toEqual([
      "ai-issue-feedback",
      "lighthouse", // weekly, #7581
      "mutation-score", // weekly, #7581
      "process-metrics", // queueEfficiency
      "process-metrics", // sdlcSpeed (#6654)
      "queue-telemetry",
      "review-burden",
    ]);
  });

  it("names only metrics the metrics-store registry actually knows", () => {
    // A typo'd logical name would make read() throw -> "unreadable" -> still
    // a finding (fail-closed), but it would report the wrong reason forever.
    for (const entry of FRESHNESS_POLICY) {
      expect(METRICS[entry.metric], `${entry.metric} must be a registered metric`).toBeDefined();
    }
  });

  it("uses each collector's real timestamp field", () => {
    const byMetric = Object.fromEntries(FRESHNESS_POLICY.map((p) => [p.metric, p]));
    // scripts/acmm/review-burden-metrics.js writes `timestamp`.
    expect(byMetric["review-burden"].timestampField).toBe("timestamp");
    // scripts/queue-telemetry-store.mjs rows carry `claimed_at` (always set);
    // `merged_at` is null until reconciled, so it must not be the field.
    expect(byMetric["queue-telemetry"].timestampField).toBe("claimed_at");
  });

  it("sets a threshold wider than the collection cadence", () => {
    for (const entry of FRESHNESS_POLICY) {
      expect(entry.maxAgeDays).toBeGreaterThanOrEqual(2);
      // sdlcSpeed is weekly (two missed runs = 14); lighthouse and mutation-score
      // are weekly behind a PR that can sit (three missed runs = 21, #7581);
      // every other entry is daily.
      const weekly = { sdlcSpeed: 14, lighthouse: 21, "mutation-score": 21 };
      expect(entry.maxAgeDays).toBeLessThanOrEqual(weekly[entry.label ?? entry.metric] ?? 7);
    }
  });
});

describe("queue-telemetry policy entry", () => {
  const readWith = (claimedAt) => (metric) =>
    metric === "queue-telemetry" ? [{ claimed_at: claimedAt, merged_at: null }] : FRESH_ROWS;
  const queueResult = (claimedAt) =>
    assessFreshness({ readMetric: readWith(claimedAt), now: NOW }).find(
      (r) => r.metric === "queue-telemetry"
    );

  it("is fresh when the newest claimed_at is within the threshold", () => {
    expect(queueResult(daysAgo(2)).state).toBe("fresh");
  });

  it("is stale once the newest claimed_at exceeds the threshold", () => {
    expect(queueResult(daysAgo(8)).state).toBe("stale");
  });
});

describe("queue-telemetry regression: rows stop landing silently (#5777)", () => {
  // Every other metric fresh, so the verdict can only come from queue-telemetry.
  const assess = (queueRows) =>
    assessFreshness({
      readMetric: (metric) => (metric === "queue-telemetry" ? queueRows : FRESH_ROWS),
      now: NOW,
    });

  it("fails the self-check (exit 1) when the newest row is older than the threshold", () => {
    const results = assess([{ claimed_at: daysAgo(20), merged_at: null }]);
    expect(freshnessExitCode(results)).toBe(1);
    expect(partitionFindings(results).failures.map((r) => r.metric)).toEqual(["queue-telemetry"]);
  });

  it("fails as `empty`, not a silent pass, when queue-telemetry.jsonl has no rows", () => {
    const results = assess([]);
    const queue = results.find((r) => r.metric === "queue-telemetry");
    expect(queue.state).toBe("empty");
    expect(freshnessExitCode(results)).toBe(1);
    // A failure must never be routed into the human-blocked bucket (#5561).
    expect(partitionFindings(results).blocked).toEqual([]);
  });

  it("passes (exit 0) once a recent row lands again", () => {
    expect(freshnessExitCode(assess([{ claimed_at: daysAgo(1), merged_at: null }]))).toBe(0);
  });
});

describe("assessFreshness", () => {
  it("reports one result per policy entry", () => {
    const results = assessFreshness({
      readMetric: () => FRESH_ROWS,
      now: NOW,
    });
    expect(results).toHaveLength(FRESHNESS_POLICY.length);
    expect(results.every((r) => r.state === "fresh")).toBe(true);
  });

  it("marks a metric unreadable when the read throws, never fresh", () => {
    const results = assessFreshness({
      readMetric: () => {
        throw new Error("corrupt JSON");
      },
      now: NOW,
    });
    expect(results.every((r) => r.state === "unreadable")).toBe(true);
    expect(results[0].error).toContain("corrupt JSON");
  });

  it("evaluates each metric independently", () => {
    // Synthetic two-entry policy — the real FRESHNESS_POLICY has only one
    // metric since domain-metrics was retired (#5561), so independence
    // between metrics is exercised with an injected policy instead.
    const policy = [
      { metric: "metric-a", timestampField: "timestamp", maxAgeDays: 3, producer: "a" },
      { metric: "metric-b", timestampField: "timestamp", maxAgeDays: 3, producer: "b" },
    ];
    const results = assessFreshness({
      readMetric: (metric) =>
        metric === "metric-a" ? [{ timestamp: daysAgo(0) }] : [{ timestamp: daysAgo(90) }],
      now: NOW,
      policy,
    });
    const byMetric = Object.fromEntries(results.map((r) => [r.metric, r.state]));
    expect(byMetric["metric-a"]).toBe("fresh");
    expect(byMetric["metric-b"]).toBe("stale");
  });
});

describe("freshnessFindings / freshnessExitCode", () => {
  const stateFor = (state) => ({ metric: "domain-metrics", state, ageDays: 9, latest: null });

  it("treats every non-fresh state as a finding", () => {
    for (const state of ["empty", "stale", "undated", "unreadable", "something-new"]) {
      expect(freshnessFindings([stateFor(state)]), state).toHaveLength(1);
      expect(freshnessExitCode([stateFor(state)]), state).toBe(1);
    }
  });

  it("passes only when every metric is explicitly fresh", () => {
    expect(freshnessFindings([stateFor("fresh")])).toHaveLength(0);
    expect(freshnessExitCode([stateFor("fresh")])).toBe(0);
  });

  it("fails an empty result set rather than reporting a vacuous pass", () => {
    // Zero results means the policy was emptied or the assessment never ran —
    // the exact "nothing entered the counted set" shape this check exists for.
    expect(freshnessExitCode([])).toBe(1);
  });
});

describe("freshnessRegressions", () => {
  it("emits a learning-loop regression per non-fresh metric", () => {
    const regressions = freshnessRegressions([
      { metric: "domain-metrics", state: "empty", ageDays: null, latest: null },
      { metric: "review-burden", state: "stale", ageDays: 98, latest: "2026-06-14T04:52:03.798Z" },
    ]);

    expect(regressions).toHaveLength(2);
    expect(regressions[0]).toMatchObject({
      sensor: "metricsFreshness",
      metric: "domain-metrics",
      current: "empty",
      severity: "high",
    });
    expect(regressions[1]).toMatchObject({
      sensor: "metricsFreshness",
      metric: "review-burden",
      current: "stale",
      severity: "medium",
    });
  });

  it("emits nothing when everything is fresh", () => {
    expect(freshnessRegressions([{ metric: "review-burden", state: "fresh", ageDays: 0 }])).toEqual(
      []
    );
  });
});

describe("formatFinding", () => {
  it("names the metric, its state, and the producer that should have written it", () => {
    const line = formatFinding({
      metric: "domain-metrics",
      state: "empty",
      ageDays: null,
      latest: null,
      producer: "scripts/collect-domain-metrics.mjs",
    });
    expect(line).toContain("domain-metrics");
    expect(line).toContain("empty");
    expect(line).toContain("scripts/collect-domain-metrics.mjs");
  });
});

/**
 * A metric can be empty for two completely different reasons, and #5561
 * proved they must not share one issue.
 *
 * `domain-metrics` is empty because `DOMAIN_METRICS_VENUE_ID` has never been
 * configured — a real production venue identifier no agent can invent, so
 * this state persists until a human acts. `review-burden` going stale, by
 * contrast, is a broken collector someone should fix today.
 *
 * Both used to render as the same finding and file under the same
 * `--dedupe-key metrics-collection-stale`. So once the permanently-blocked
 * one had opened its issue, a genuine collector failure was absorbed into
 * that already-open issue and announced nothing — the human-gated condition
 * MASKING the actionable one. That is the same silent-narrowing shape as the
 * stale-`agent-core`-dist and skipped-run-denominator entries in
 * .claude/rules/gotchas.md: the dangerous direction is the one that reports
 * less than reality.
 *
 * `unconfigured` therefore is NOT a pass — it stays a finding and keeps the
 * non-zero exit code, preserving fail-closed — it is only routed separately.
 */
describe("unconfigured vs. genuinely broken (#5561)", () => {
  const base = { timestampField: "timestamp", maxAgeDays: 3, now: NOW };

  it("classifies an empty metric whose required env var is absent as unconfigured", () => {
    const result = classifyFreshness({
      ...base,
      entries: [],
      requiresEnv: "DOMAIN_METRICS_VENUE_ID",
      env: {},
    });
    expect(result.state).toBe("unconfigured");
  });

  it("treats a blank-string env var as absent, not as configured", () => {
    // `gh secret set NAME` with empty stdin silently sets "" (gotchas.md),
    // so a blank value is the realistic shape of "never configured".
    const result = classifyFreshness({
      ...base,
      entries: [],
      requiresEnv: "DOMAIN_METRICS_VENUE_ID",
      env: { DOMAIN_METRICS_VENUE_ID: "   " },
    });
    expect(result.state).toBe("unconfigured");
  });

  it("stays plain empty when the required env var IS configured", () => {
    // Configured but still producing nothing is a real defect, not a blocker.
    const result = classifyFreshness({
      ...base,
      entries: [],
      requiresEnv: "DOMAIN_METRICS_VENUE_ID",
      env: { DOMAIN_METRICS_VENUE_ID: "venue_123" },
    });
    expect(result.state).toBe("empty");
  });

  it("never lets a missing env var excuse a STALE metric", () => {
    // The load-bearing negative: a collector that worked once and then broke
    // has proven its credential exists. Letting `unconfigured` absorb that
    // would hide a live regression behind a permanent blocker.
    const result = classifyFreshness({
      ...base,
      entries: [{ timestamp: daysAgo(30) }],
      requiresEnv: "DOMAIN_METRICS_VENUE_ID",
      env: {},
    });
    expect(result.state).toBe("stale");
  });

  it("keeps unconfigured a finding with a non-zero exit code (fail-closed)", () => {
    const results = [{ metric: "domain-metrics", state: "unconfigured", ageDays: null }];
    expect(freshnessFindings(results)).toHaveLength(1);
    expect(freshnessExitCode(results)).toBe(1);
  });

  it("partitions findings so a blocker cannot absorb a real failure", () => {
    const { blocked, failures } = partitionFindings([
      { metric: "domain-metrics", state: "unconfigured", ageDays: null },
      { metric: "review-burden", state: "stale", ageDays: 98 },
      { metric: "fresh-one", state: "fresh", ageDays: 0 },
    ]);

    expect(blocked.map((r) => r.metric)).toEqual(["domain-metrics"]);
    expect(failures.map((r) => r.metric)).toEqual(["review-burden"]);
  });

  it("reports no failures when the only finding is human-blocked", () => {
    const { blocked, failures } = partitionFindings([
      { metric: "domain-metrics", state: "unconfigured", ageDays: null },
    ]);
    expect(blocked).toHaveLength(1);
    expect(failures).toHaveLength(0);
  });

  it("grades unconfigured below a genuine regression for the learning loop", () => {
    const [regression] = freshnessRegressions([
      { metric: "domain-metrics", state: "unconfigured", ageDays: null, latest: null },
    ]);
    expect(regression.severity).toBe("low");
  });
});

/* ── #6312: collectors that "ran" but only ever wrote error rows ──────────── */

describe("sdlcSpeed policy entry (#6654)", () => {
  const assess = (rows) =>
    assessFreshness({
      readMetric: (metric) => (metric === "process-metrics" ? rows : FRESH_ROWS),
      now: NOW,
    });
  const sdlcOf = (results) => results.find((r) => r.label === "sdlcSpeed")?.state;
  const queueRow = { date: "2026-09-20", sensor: "queueEfficiency", available: true };

  it("is fresh with a healthy row inside the weekly window", () => {
    const row = { date: daysAgo(9).slice(0, 10), sensor: "sdlcSpeed", available: true };
    expect(sdlcOf(assess([queueRow, row]))).toBe("fresh");
  });
  it("goes stale after two missed weekly runs", () => {
    const row = { date: daysAgo(20).slice(0, 10), sensor: "sdlcSpeed", available: true };
    expect(sdlcOf(assess([queueRow, row]))).toBe("stale");
  });
  it("fails as empty when the sensor never recorded", () => {
    expect(sdlcOf(assess([queueRow]))).toBe("empty");
  });
});

describe("queueEfficiency + ai-issue-feedback policy (#6312)", () => {
  const dayStamp = (days) => daysAgo(days).slice(0, 10);
  const queueRow = (days, fields) => ({
    date: dayStamp(days),
    sensor: "queueEfficiency",
    ...fields,
  });
  const okQueue = (days) => queueRow(days, { available: true, composite: 0.9 });
  const darkQueue = (days) => queueRow(days, { available: false, reason: "credential_rejected" });
  const goodFeedback = (days) => ({ collected_at: daysAgo(days), categories: {}, budgets: {} });
  const errorFeedback = (days) => ({ collected_at: daysAgo(days), error: "HTTP 403" });

  const assess = ({ queue, feedback }) =>
    assessFreshness({
      readMetric: (metric) => {
        if (metric === "process-metrics") return [...queue, SDLC_ROW];
        if (metric === "ai-issue-feedback") return feedback;
        if (metric === "queue-telemetry") return [{ claimed_at: daysAgo(0) }];
        return [{ timestamp: daysAgo(0), date: daysAgo(0).slice(0, 10) }];
      },
      now: NOW,
    });
  const stateOf = (results, label) => results.find((r) => (r.label ?? r.metric) === label)?.state;

  it("watches both collectors, reading real timestamp fields", () => {
    const queue = FRESHNESS_POLICY.find((p) => p.label === "queueEfficiency");
    expect(queue).toMatchObject({ metric: "process-metrics", timestampField: "date" });
    const feedback = FRESHNESS_POLICY.find((p) => p.metric === "ai-issue-feedback");
    expect(feedback).toMatchObject({ timestampField: "collected_at" });
  });

  it("passes when both collectors have a recent healthy row", () => {
    const results = assess({ queue: [okQueue(1)], feedback: goodFeedback(0) });
    expect(freshnessExitCode(results)).toBe(0);
  });

  it("ignores other sensors' rows in the shared process-metrics file", () => {
    const other = { date: dayStamp(0), sensor: "somethingElse", available: true };
    const results = assess({ queue: [other], feedback: goodFeedback(0) });
    expect(stateOf(results, "queueEfficiency")).toBe("empty");
    expect(freshnessExitCode(results)).toBe(1);
  });

  it("FAILS when queueEfficiency only ever writes unavailable rows (fresh date, no data)", () => {
    // The exact 2026-09-27 -> 2026-10-12 shape: a row every day, none usable.
    const results = assess({
      queue: [darkQueue(0), darkQueue(1), darkQueue(2)],
      feedback: goodFeedback(0),
    });
    expect(stateOf(results, "queueEfficiency")).toBe("unhealthy");
    expect(freshnessExitCode(results)).toBe(1);
    expect(partitionFindings(results).failures.map((r) => r.label)).toContain("queueEfficiency");
  });

  it("goes stale on the last HEALTHY row, not the newest row of any kind", () => {
    const results = assess({ queue: [okQueue(20), darkQueue(0)], feedback: goodFeedback(0) });
    expect(stateOf(results, "queueEfficiency")).toBe("stale");
  });

  it("FAILS when ai-issue-feedback holds only an error object", () => {
    const results = assess({ queue: [okQueue(0)], feedback: errorFeedback(0) });
    expect(stateOf(results, "ai-issue-feedback")).toBe("unhealthy");
    expect(freshnessExitCode(results)).toBe(1);
  });

  it("FAILS when ai-issue-feedback is stale or missing", () => {
    const stale = assess({ queue: [okQueue(0)], feedback: goodFeedback(30) });
    expect(stateOf(stale, "ai-issue-feedback")).toBe("stale");
    const missing = assess({ queue: [okQueue(0)], feedback: null });
    expect(stateOf(missing, "ai-issue-feedback")).toBe("empty");
  });

  it("names the collector in the finding text", () => {
    const [finding] = freshnessFindings(
      assess({ queue: [darkQueue(0)], feedback: goodFeedback(0) })
    );
    expect(formatFinding(finding)).toMatch(/^queueEfficiency: unhealthy/);
  });
});

/* ── #6943: queue-telemetry completeness (silent nulls) ───────────────────── */

describe("assessQueueTelemetryCompleteness", () => {
  const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();
  const full = (claimed_at) => ({
    claimed_at,
    merged: true,
    merged_at: claimed_at,
    ci_first_pass: true,
    reviewer_verdict: "pass",
    cost_usd: 1,
    model_tier: "sonnet",
  });
  const silent = (claimed_at) => ({ ...full(claimed_at), cost_usd: null });
  const assess = (rows) => assessQueueTelemetryCompleteness({ readMetric: () => rows, now: NOW });
  const mixed = (silentN) =>
    Array.from({ length: 10 }, (_, i) => (i < silentN ? silent(hoursAgo(48)) : full(hoursAgo(48))));

  it("passes with exactly 20% of rows carrying a silent null", () => {
    const results = assess(mixed(2));
    expect(results[0].state).toBe("fresh");
    expect(freshnessExitCode(results)).toBe(0);
  });

  it("is incomplete above 20% and exits 1", () => {
    const results = assess(mixed(3));
    expect(results[0].state).toBe("incomplete");
    expect(freshnessExitCode(results)).toBe(1);
    expect(freshnessFindings(results)).toHaveLength(1);
    expect(freshnessRegressions(results)[0].severity).toBe("high");
  });

  it("does not fail rows whose null carries an unknown reason", () => {
    const rows = Array.from({ length: 10 }, () => ({
      ...full(hoursAgo(48)),
      cost_usd: null,
      unknown_reasons: { cost_usd: "no-ledger-row" },
    }));
    expect(assess(rows)[0].state).toBe("fresh");
  });

  it("excludes rows claimed under 24h ago", () => {
    const rows = Array.from({ length: 10 }, () => silent(hoursAgo(2)));
    expect(assess(rows)[0].state).toBe("empty");
  });

  it("ignores rows older than 7 days", () => {
    const rows = [silent(hoursAgo(24 * 10)), full(hoursAgo(48))];
    expect(assess(rows)[0].state).toBe("fresh");
  });

  it("reports an empty window as empty (existing behaviour)", () => {
    expect(assess([])[0].state).toBe("empty");
  });

  it("reports an unreadable sink as a finding", () => {
    const results = assessQueueTelemetryCompleteness({
      readMetric: () => {
        throw new Error("corrupt");
      },
      now: NOW,
    });
    expect(results[0].state).toBe("unreadable");
  });
});
