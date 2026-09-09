import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildQueueEfficiencyProcessEntry,
  buildOptimizeLogEntry,
  buildRegressionIssueBody,
  isRealRegression,
  appendLogEntry,
} from "../optimize-implement-queue.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "optimize-implement-queue-test-"));
}

const HEALTHY_RESULT = {
  available: true,
  composite: 0.82,
  sub_metrics: {
    issues_merged: 12,
    first_pass_success_rate: 0.75,
    median_time_to_merge_hours: 18.5,
    median_rework_cycles: 0.4,
    cost_per_issue_usd: 1.2,
  },
  distribution: {
    "size:s": { count: 5, avg_commits: 1.4, avg_ttm_hours: 14.2 },
    "size:m": { count: 7, avg_commits: 2.1, avg_ttm_hours: 21.3 },
  },
  baseline: {
    composite_median: 0.8,
    weeks_sampled: 2,
    fps_median: 0.72,
    ttm_median: 19.0,
    cost_per_issue_median: 1.3,
  },
  regressions: [],
};

const REGRESSED_RESULT = {
  available: true,
  composite: 0.58,
  sub_metrics: {
    issues_merged: 8,
    first_pass_success_rate: 0.5,
    median_time_to_merge_hours: 28.0,
    median_rework_cycles: 1.5,
    cost_per_issue_usd: 2.8,
  },
  distribution: {
    "size:xl": { count: 6, avg_commits: 3.2, avg_ttm_hours: 32.0 },
    "size:s": { count: 2, avg_commits: 1.0, avg_ttm_hours: 12.0 },
  },
  baseline: {
    composite_median: 0.8,
    weeks_sampled: 3,
    fps_median: 0.78,
    ttm_median: 19.0,
    cost_per_issue_median: 1.3,
  },
  regressions: [
    {
      sensor: "queueEfficiency",
      metric: "composite",
      current: 0.58,
      baseline: 0.8,
      delta: -0.22,
      severity: "high",
    },
    {
      sensor: "queueEfficiency",
      metric: "first_pass_success_rate",
      current: 0.5,
      baseline: 0.78,
      delta: -0.28,
      severity: "high",
    },
  ],
};

describe("buildQueueEfficiencyProcessEntry", () => {
  it("returns a JSONL-compatible object with required fields", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", HEALTHY_RESULT);
    expect(entry).toMatchObject({
      date: "2026-06-27",
      sensor: "queueEfficiency",
      composite: 0.82,
    });
  });

  it("includes sub_metrics", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", HEALTHY_RESULT);
    expect(entry.sub_metrics).toBeDefined();
    expect(entry.sub_metrics.first_pass_success_rate).toBe(0.75);
  });

  it("includes regression count", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", REGRESSED_RESULT);
    expect(entry.regression_count).toBe(2);
  });

  it("handles unavailable sensor gracefully", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", { available: false });
    expect(entry).toMatchObject({
      date: "2026-06-27",
      sensor: "queueEfficiency",
      available: false,
    });
  });

  it("propagates the sensor's reason code instead of discarding it (#4044)", () => {
    // Before #4044, this field was silently dropped — every unavailable row
    // in metrics/process-metrics.jsonl looked identical no matter why the
    // sensor failed to run, hiding a 3-week-long credential-scope failure.
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", {
      available: false,
      reason: "credential_rejected",
      error:
        "GitHub auth failed (401) — REST fallback credential is not valid for direct API calls",
    });
    expect(entry).toMatchObject({
      date: "2026-06-27",
      sensor: "queueEfficiency",
      available: false,
      reason: "credential_rejected",
    });
  });

  it("falls back to reason 'unknown' when the sensor result carries no reason", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", { available: false });
    expect(entry.reason).toBe("unknown");
  });

  it("regression_count is 0 for healthy result", () => {
    const entry = buildQueueEfficiencyProcessEntry("2026-06-27", HEALTHY_RESULT);
    expect(entry.regression_count).toBe(0);
  });
});

describe("buildOptimizeLogEntry", () => {
  it("starts with the date as a heading", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", HEALTHY_RESULT, 0);
    expect(entry).toMatch(/^## 2026-06-27/);
  });

  it("includes sensor status line", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", HEALTHY_RESULT, 0);
    expect(entry).toContain("queueEfficiency");
    expect(entry).toContain("0.82");
  });

  it("includes issues filed count", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", REGRESSED_RESULT, 2);
    expect(entry).toContain("Issues filed");
  });

  it("marks healthy run when no regressions", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", HEALTHY_RESULT, 0);
    expect(entry.toLowerCase()).toContain("healthy");
  });

  it("mentions regression when regressions present", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", REGRESSED_RESULT, 1);
    expect(entry.toLowerCase()).toContain("regression");
  });

  it("includes difficulty distribution note when available", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", HEALTHY_RESULT, 0);
    expect(entry).toContain("size:");
  });

  it("handles unavailable sensor", () => {
    const entry = buildOptimizeLogEntry("2026-06-27", { available: false }, 0);
    expect(entry).toMatch(/^## 2026-06-27/);
    expect(entry).toContain("unavailable");
  });

  it("includes the sensor's reason code when unavailable (#4044)", () => {
    const entry = buildOptimizeLogEntry(
      "2026-06-27",
      { available: false, reason: "credential_rejected" },
      0
    );
    expect(entry).toContain("credential_rejected");
  });
});

describe("buildRegressionIssueBody", () => {
  const regression = REGRESSED_RESULT.regressions[0];

  it("includes sensor and metric in body", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("queueEfficiency");
    expect(body).toContain("composite");
  });

  it("includes current and baseline values", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("0.58");
    // JavaScript renders 0.80 as "0.8"; accept either form
    expect(body).toMatch(/0\.8(?:0)?/);
  });

  it("includes severity", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("high");
  });

  it("includes acceptance criteria checklist", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("- [ ]");
  });

  it("includes difficulty distribution when available", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("size:");
  });

  it("references the learning loop skill", () => {
    const body = buildRegressionIssueBody(regression, REGRESSED_RESULT);
    expect(body).toContain("optimize-implement-queue");
  });
});

describe("isRealRegression", () => {
  it("returns false for unavailable sensor", () => {
    expect(isRealRegression({ available: false })).toBe(false);
  });

  it("returns false for empty regressions array", () => {
    expect(isRealRegression(HEALTHY_RESULT)).toBe(false);
  });

  it("returns true when regressions exist", () => {
    expect(isRealRegression(REGRESSED_RESULT)).toBe(true);
  });

  it("normalizes for difficulty: false when xl-dominant and composite difference is small", () => {
    // If >80% of issues are size:xl the bar is lowered — a slight composite drop
    // might be difficulty-explained, not a real regression.
    const dominantXl = {
      ...REGRESSED_RESULT,
      composite: 0.77,
      sub_metrics: { ...REGRESSED_RESULT.sub_metrics, issues_merged: 10 },
      distribution: {
        "size:xl": { count: 9, avg_commits: 3.0, avg_ttm_hours: 35.0 },
        "size:xs": { count: 1, avg_commits: 1.0, avg_ttm_hours: 5.0 },
      },
      baseline: { ...REGRESSED_RESULT.baseline, composite_median: 0.8 },
      regressions: [
        {
          sensor: "queueEfficiency",
          metric: "composite",
          current: 0.77,
          baseline: 0.8,
          delta: -0.03,
          severity: "medium",
        },
      ],
    };
    expect(isRealRegression(dominantXl)).toBe(false);
  });

  it("returns true when xl-dominant but composite drop is large", () => {
    const dominantXlLarge = {
      ...REGRESSED_RESULT,
      distribution: {
        "size:xl": { count: 9, avg_commits: 3.0, avg_ttm_hours: 35.0 },
        "size:xs": { count: 1, avg_commits: 1.0, avg_ttm_hours: 5.0 },
      },
    };
    expect(isRealRegression(dominantXlLarge)).toBe(true);
  });
});

describe("appendLogEntry", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("appends entry to existing log file", () => {
    const logPath = join(dir, "log.md");
    writeFileSync(logPath, "## 2026-06-20\n\nold entry\n");
    appendLogEntry(logPath, "## 2026-06-27\n\nnew entry\n", false);
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("2026-06-20");
    expect(content).toContain("2026-06-27");
  });

  it("creates parent directories if missing", () => {
    const logPath = join(dir, "deep", "nested", "log.md");
    appendLogEntry(logPath, "## 2026-06-27\n\nentry\n", false);
    expect(existsSync(logPath)).toBe(true);
  });

  it("does NOT write when dry-run is true", () => {
    const logPath = join(dir, "log.md");
    appendLogEntry(logPath, "## 2026-06-27\n\nentry\n", true);
    expect(existsSync(logPath)).toBe(false);
  });

  it("appends a blank separator line between entries", () => {
    const logPath = join(dir, "log.md");
    writeFileSync(logPath, "## 2026-06-20\n\nold entry\n");
    appendLogEntry(logPath, "## 2026-06-27\n\nnew entry\n", false);
    const content = readFileSync(logPath, "utf-8");
    // Should have two heading blocks separated by a blank line
    expect(content).toMatch(/old entry\n\n## 2026-06-27/);
  });

  it("creates a new log file when none exists", () => {
    const logPath = join(dir, "new-log.md");
    appendLogEntry(logPath, "## 2026-06-27\n\nfirst entry\n", false);
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("2026-06-27");
  });
});
