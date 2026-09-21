/**
 * Tests for the metrics staleness/emptiness self-check (#5529).
 *
 * The whole point of this check is that it must FIRE. Both collectors it
 * watches were silently dead for months — `metrics/domain-metrics.jsonl` at
 * 0 bytes since it was created, `metrics/review-burden.json` holding one
 * entry from 2026-06-14 — and nothing went red, because nothing was looking.
 * A self-check that passes on an empty dataset would reproduce that exact
 * failure one level up: it would read as a safety net while pinning nothing.
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
  freshnessFindings,
  freshnessRegressions,
  freshnessExitCode,
  formatFinding,
} from "../metrics-freshness.mjs";
import { METRICS } from "../metrics-store.mjs";

const NOW = new Date("2026-09-20T12:00:00.000Z");

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
  it("covers both collectors that went silently dead", () => {
    expect(FRESHNESS_POLICY.map((p) => p.metric).sort()).toEqual([
      "domain-metrics",
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
    // scripts/collect-domain-metrics.mjs writes `collected_at`;
    // scripts/acmm/review-burden-metrics.js writes `timestamp`.
    expect(byMetric["domain-metrics"].timestampField).toBe("collected_at");
    expect(byMetric["review-burden"].timestampField).toBe("timestamp");
  });

  it("sets a threshold wider than the daily collection cadence", () => {
    for (const entry of FRESHNESS_POLICY) {
      expect(entry.maxAgeDays).toBeGreaterThanOrEqual(2);
      expect(entry.maxAgeDays).toBeLessThanOrEqual(7);
    }
  });
});

describe("assessFreshness", () => {
  it("reports one result per policy entry", () => {
    const results = assessFreshness({
      readMetric: () => [{ timestamp: daysAgo(0), collected_at: daysAgo(0) }],
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
    const results = assessFreshness({
      readMetric: (metric) =>
        metric === "review-burden" ? [{ timestamp: daysAgo(0) }] : [{ collected_at: daysAgo(90) }],
      now: NOW,
    });
    const byMetric = Object.fromEntries(results.map((r) => [r.metric, r.state]));
    expect(byMetric["review-burden"]).toBe("fresh");
    expect(byMetric["domain-metrics"]).toBe("stale");
  });

  it("reproduces the real-world state this check was built for", () => {
    // domain-metrics.jsonl: 0 bytes. review-burden.json: one 2026-06-14 entry.
    // Both must be findings — if this assertion ever passes with an empty
    // findings list, the check has become decorative.
    const results = assessFreshness({
      readMetric: (metric) =>
        metric === "domain-metrics" ? [] : [{ timestamp: "2026-06-14T04:52:03.798Z" }],
      now: NOW,
    });
    const findings = freshnessFindings(results);
    expect(findings.map((f) => f.state).sort()).toEqual(["empty", "stale"]);
    expect(freshnessExitCode(results)).toBe(1);
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
