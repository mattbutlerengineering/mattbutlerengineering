/**
 * Covers #5443: the AI-health page charts ACMM level and the queueEfficiency
 * composite over a trailing window, so the two append-only histories have to
 * be projected into a published series first.
 *
 * The projection is where honesty is won or lost: a day the collector could
 * not measure (`available: false`, e.g. 2026-09-15's `query_error`) must stay
 * in the series as an explicit hole, never be dropped and never be bridged.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TREND_WINDOW_DAYS,
  windowStartDate,
  selectTrendWindow,
  buildAcmmSeries,
  buildQueueEfficiencySeries,
  buildHealthTrends,
  writeHealthTrends,
} from "../generate-health-trends.mjs";

const TODAY = "2026-09-20";

describe("windowStartDate", () => {
  it("subtracts whole days in UTC, so a macOS-local run matches a CI-UTC one", () => {
    expect(windowStartDate("2026-09-20", 60)).toBe("2026-07-22");
  });

  it("crosses a month boundary without drifting", () => {
    expect(windowStartDate("2026-03-02", 3)).toBe("2026-02-27");
  });
});

describe("selectTrendWindow", () => {
  it("keeps only points inside the trailing window, oldest first", () => {
    const points = [
      { date: "2026-09-20", value: 3 },
      { date: "2026-09-18", value: 1 },
      { date: "2026-08-01", value: 9 },
      { date: "2026-09-19", value: 2 },
    ];
    expect(selectTrendWindow(points, { windowDays: 7, today: TODAY })).toEqual([
      { date: "2026-09-18", value: 1 },
      { date: "2026-09-19", value: 2 },
      { date: "2026-09-20", value: 3 },
    ]);
  });

  it("collapses a duplicated date to its last appended reading", () => {
    // metrics/process-metrics.jsonl really does carry two 2026-08-11 rows.
    const points = [
      { date: "2026-09-19", value: 0.947 },
      { date: "2026-09-19", value: 0.938 },
    ];
    expect(selectTrendWindow(points, { windowDays: 7, today: TODAY })).toEqual([
      { date: "2026-09-19", value: 0.938 },
    ]);
  });

  it("sorts by ISO date string, never by locale collation", () => {
    const points = [{ date: "2026-10-01" }, { date: "2026-09-30" }];
    expect(selectTrendWindow(points, { windowDays: 400, today: "2026-10-01" })).toEqual([
      { date: "2026-09-30" },
      { date: "2026-10-01" },
    ]);
  });

  it("drops a malformed entry rather than publishing it", () => {
    const points = [
      { date: "not-a-date", value: 1 },
      { value: 2 },
      { date: "2026-09-20", value: 3 },
    ];
    expect(selectTrendWindow(points, { windowDays: 7, today: TODAY })).toEqual([
      { date: "2026-09-20", value: 3 },
    ]);
  });
});

describe("buildAcmmSeries", () => {
  it("projects .claude/acmm/state.json history into dated level readings", () => {
    const history = [
      { date: "2026-09-19", level: 5, detected: 96, total: 99 },
      { date: "2026-09-20", level: 5, detected: 96, total: 99 },
    ];
    expect(buildAcmmSeries(history, { windowDays: 7, today: TODAY })).toEqual([
      { date: "2026-09-19", value: 5, note: null },
      { date: "2026-09-20", value: 5, note: null },
    ]);
  });

  it("marks a history entry with no level as a hole instead of dropping it", () => {
    const history = [
      { date: "2026-09-19", level: null },
      { date: "2026-09-20", level: 5 },
    ];
    expect(buildAcmmSeries(history, { windowDays: 7, today: TODAY })).toEqual([
      { date: "2026-09-19", value: null, note: "no_level_recorded" },
      { date: "2026-09-20", value: 5, note: null },
    ]);
  });

  it("returns an empty series for a state file with no history", () => {
    expect(buildAcmmSeries(undefined, { windowDays: 7, today: TODAY })).toEqual([]);
  });
});

describe("buildQueueEfficiencySeries", () => {
  it("keeps an unavailable day as an explicit hole carrying its reason", () => {
    const rows = [
      { date: "2026-09-13", sensor: "queueEfficiency", available: true, composite: 0.923 },
      { date: "2026-09-15", sensor: "queueEfficiency", available: false, reason: "query_error" },
      { date: "2026-09-16", sensor: "queueEfficiency", available: true, composite: 0.911 },
    ];
    expect(buildQueueEfficiencySeries(rows, { windowDays: 30, today: TODAY })).toEqual([
      { date: "2026-09-13", value: 0.923, note: null },
      { date: "2026-09-15", value: null, note: "query_error" },
      { date: "2026-09-16", value: 0.911, note: null },
    ]);
  });

  it("notes an unavailable day that recorded no reason at all", () => {
    const rows = [{ date: "2026-09-20", sensor: "queueEfficiency", available: false }];
    expect(buildQueueEfficiencySeries(rows, { windowDays: 30, today: TODAY })).toEqual([
      { date: "2026-09-20", value: null, note: "unavailable" },
    ]);
  });

  it("ignores rows belonging to other sensors", () => {
    const rows = [
      { date: "2026-09-20", sensor: "ciHealth", available: true, pass_rate_pct: 86 },
      { date: "2026-09-20", sensor: "queueEfficiency", available: true, composite: 0.964 },
    ];
    expect(buildQueueEfficiencySeries(rows, { windowDays: 30, today: TODAY })).toEqual([
      { date: "2026-09-20", value: 0.964, note: null },
    ]);
  });

  it("treats an available row with a non-numeric composite as a hole", () => {
    const rows = [{ date: "2026-09-20", sensor: "queueEfficiency", available: true }];
    expect(buildQueueEfficiencySeries(rows, { windowDays: 30, today: TODAY })).toEqual([
      { date: "2026-09-20", value: null, note: "no_composite_recorded" },
    ]);
  });
});

describe("buildHealthTrends / writeHealthTrends", () => {
  let root;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "health-trends-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function seed() {
    mkdirSync(join(root, ".claude", "acmm"), { recursive: true });
    mkdirSync(join(root, "metrics"), { recursive: true });
    writeFileSync(
      join(root, ".claude", "acmm", "state.json"),
      JSON.stringify({ history: [{ date: "2026-09-20", level: 5 }] })
    );
    writeFileSync(
      join(root, "metrics", "process-metrics.jsonl"),
      [
        JSON.stringify({
          date: "2026-09-15",
          sensor: "queueEfficiency",
          available: false,
          reason: "query_error",
        }),
        JSON.stringify({
          date: "2026-09-20",
          sensor: "queueEfficiency",
          available: true,
          composite: 0.964,
        }),
        "",
      ].join("\n")
    );
  }

  it("reads both committed histories into one payload", () => {
    seed();
    const trends = buildHealthTrends({ root, now: new Date("2026-09-20T12:00:00Z") });

    expect(trends.window_days).toBe(TREND_WINDOW_DAYS);
    expect(trends.generated_at).toBe("2026-09-20T12:00:00.000Z");
    expect(trends.acmmLevel.points).toEqual([{ date: "2026-09-20", value: 5, note: null }]);
    expect(trends.queueEfficiency.points).toEqual([
      { date: "2026-09-15", value: null, note: "query_error" },
      { date: "2026-09-20", value: 0.964, note: null },
    ]);
  });

  it("degrades to empty series when neither history file exists", () => {
    const trends = buildHealthTrends({ root, now: new Date("2026-09-20T12:00:00Z") });
    expect(trends.acmmLevel.points).toEqual([]);
    expect(trends.queueEfficiency.points).toEqual([]);
  });

  it("writes apps/marketing/public/ai-health-trends.json under root", () => {
    seed();
    const trends = buildHealthTrends({ root, now: new Date("2026-09-20T12:00:00Z") });
    const outPath = writeHealthTrends(trends, { root });

    expect(outPath).toBe(join(root, "apps", "marketing", "public", "ai-health-trends.json"));
    expect(JSON.parse(readFileSync(outPath, "utf-8"))).toEqual(trends);
  });
});
