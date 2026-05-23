import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  estimateFpRate,
  buildProcessMetricsEntry,
  collectProcessMetrics,
} from "../collect-process-metrics.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "process-metrics-collector-test-"));
}

describe("estimateFpRate", () => {
  it("returns fp_rate from auto-qa-tuning.json when available", () => {
    const config = {
      thresholds: { acceptanceRateFloor: 0.85 },
      history: [
        {
          date: "2026-05-22",
          trigger: "threshold-auto-tuner",
          adjustments: [],
          note: "FP rate: 15%",
        },
      ],
    };
    // acceptanceRateFloor at 0.85 maps to ~15% FP rate (1 - 0.85 = 0.15)
    const result = estimateFpRate(config, null);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(30);
  });

  it("returns fp_rate from existing process-metrics.jsonl when available", () => {
    const existingMetrics = [
      { date: "2026-05-20", fp_rate: 12, avg_cost_usd: 0.5, median_cycle_hours: 4 },
    ];
    const result = estimateFpRate(null, existingMetrics);
    expect(result).toBe(12);
  });

  it("returns a reasonable default when no data available", () => {
    const result = estimateFpRate(null, null);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(30);
  });

  it("prefers existing metrics fp_rate over derived value", () => {
    const config = { thresholds: { acceptanceRateFloor: 0.5 } };
    const existingMetrics = [{ date: "2026-05-20", fp_rate: 5 }];
    const result = estimateFpRate(config, existingMetrics);
    expect(result).toBe(5);
  });
});

describe("buildProcessMetricsEntry", () => {
  it("builds a complete metrics entry with all required fields", () => {
    const entry = buildProcessMetricsEntry({
      fpRate: 15,
      avgCostUsd: 0.65,
      medianCycleHours: 3.5,
      issuesClosed7d: 8,
    });

    expect(entry).toMatchObject({
      fp_rate: 15,
      avg_cost_usd: 0.65,
      median_cycle_hours: 3.5,
      issues_closed_7d: 8,
    });
    expect(entry.date).toBeDefined();
    // date should be today's ISO date
    expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles null optional fields gracefully", () => {
    const entry = buildProcessMetricsEntry({
      fpRate: 10,
      avgCostUsd: null,
      medianCycleHours: null,
      issuesClosed7d: 0,
    });

    expect(entry.fp_rate).toBe(10);
    expect(entry.avg_cost_usd).toBeNull();
    expect(entry.median_cycle_hours).toBeNull();
  });
});

describe("collectProcessMetrics", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, ".github"), { recursive: true });
    mkdirSync(join(dir, "metrics"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes a new metrics entry to JSONL file", () => {
    const metricsPath = join(dir, "metrics", "process-metrics.jsonl");
    const config = {
      thresholds: { acceptanceRateFloor: 0.85 },
      history: [],
    };
    writeFileSync(join(dir, ".github", "auto-qa-tuning.json"), JSON.stringify(config));

    const mockFetchIssuesClosed = () => 5;

    collectProcessMetrics(dir, metricsPath, mockFetchIssuesClosed);

    expect(existsSync(metricsPath)).toBe(true);
    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(entry.date).toBeDefined();
    expect(typeof entry.fp_rate).toBe("number");
    expect(entry.fp_rate).toBeLessThan(30);
    expect(entry.issues_closed_7d).toBe(5);
  });

  it("appends to existing JSONL file", () => {
    const metricsPath = join(dir, "metrics", "process-metrics.jsonl");
    const existingEntry = {
      date: "2026-05-15",
      fp_rate: 10,
      avg_cost_usd: 0.5,
      median_cycle_hours: 4,
      issues_closed_7d: 3,
    };
    writeFileSync(metricsPath, JSON.stringify(existingEntry) + "\n");

    collectProcessMetrics(dir, metricsPath, () => 7);

    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).date).toBe("2026-05-15");
    expect(JSON.parse(lines[1]).issues_closed_7d).toBe(7);
  });

  it("works without auto-qa-tuning.json", () => {
    const metricsPath = join(dir, "metrics", "process-metrics.jsonl");

    collectProcessMetrics(dir, metricsPath, () => 0);

    expect(existsSync(metricsPath)).toBe(true);
    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(1);

    const entry = JSON.parse(lines[0]);
    expect(typeof entry.fp_rate).toBe("number");
  });

  it("uses last entry from existing metrics for fp_rate when no tuning config", () => {
    const metricsPath = join(dir, "metrics", "process-metrics.jsonl");
    // Pre-populate with a known fp_rate
    writeFileSync(
      metricsPath,
      JSON.stringify({
        date: "2026-05-15",
        fp_rate: 8,
        avg_cost_usd: 0.4,
        median_cycle_hours: 3,
        issues_closed_7d: 2,
      }) + "\n"
    );

    collectProcessMetrics(dir, metricsPath, () => 3);

    const lines = readFileSync(metricsPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    const latest = JSON.parse(lines[lines.length - 1]);
    expect(latest.fp_rate).toBe(8);
  });

  it("returns count of entries written (always 1)", () => {
    const metricsPath = join(dir, "metrics", "process-metrics.jsonl");
    const count = collectProcessMetrics(dir, metricsPath, () => 0);
    expect(count).toBe(1);
  });
});
