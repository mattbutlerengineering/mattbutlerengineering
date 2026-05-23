import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("process-metrics", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "process-metrics-"));
    fs.mkdirSync(path.join(tmpDir, "metrics"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".claude", "improvement-loop"), {
      recursive: true,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("computeTimeToFix", () => {
    test("computes average hours from issue creation to PR merge", async () => {
      const { computeTimeToFix } = await import("../process-metrics.mjs");

      const issues = [
        {
          number: 1,
          createdAt: "2026-05-15T10:00:00Z",
          closedAt: "2026-05-15T14:00:00Z",
          labels: [{ name: "has-pr" }],
        },
        {
          number: 2,
          createdAt: "2026-05-16T08:00:00Z",
          closedAt: "2026-05-16T20:00:00Z",
          labels: [{ name: "has-pr" }],
        },
      ];

      const result = computeTimeToFix(issues);
      // (4 + 12) / 2 = 8
      expect(result).toBe(8);
    });

    test("returns zero when no issues", async () => {
      const { computeTimeToFix } = await import("../process-metrics.mjs");
      expect(computeTimeToFix([])).toBe(0);
    });

    test("filters to only has-pr labeled issues", async () => {
      const { computeTimeToFix } = await import("../process-metrics.mjs");

      const issues = [
        {
          number: 1,
          createdAt: "2026-05-15T10:00:00Z",
          closedAt: "2026-05-15T14:00:00Z",
          labels: [{ name: "has-pr" }],
        },
        {
          number: 2,
          createdAt: "2026-05-16T08:00:00Z",
          closedAt: "2026-05-16T20:00:00Z",
          labels: [{ name: "wontfix" }],
        },
      ];

      const result = computeTimeToFix(issues);
      expect(result).toBe(4);
    });
  });

  describe("computeCostPerFix", () => {
    test("extracts cost from issue comments with budget metadata", async () => {
      const { computeCostPerFix } = await import("../process-metrics.mjs");

      const issueComments = [
        {
          issueNumber: 1,
          comments: [
            { body: "Agent session completed. Budget used: $0.45" },
            { body: "LGTM, merging." },
          ],
        },
        {
          issueNumber: 2,
          comments: [{ body: "Budget used: $1.20" }],
        },
      ];

      const result = computeCostPerFix(issueComments);
      // (0.45 + 1.20) / 2 = 0.825
      expect(result).toBeCloseTo(0.825, 2);
    });

    test("returns null when no budget comments found", async () => {
      const { computeCostPerFix } = await import("../process-metrics.mjs");

      const issueComments = [
        {
          issueNumber: 1,
          comments: [{ body: "Fixed manually." }],
        },
      ];

      const result = computeCostPerFix(issueComments);
      expect(result).toBeNull();
    });

    test("handles empty comments array", async () => {
      const { computeCostPerFix } = await import("../process-metrics.mjs");
      expect(computeCostPerFix([])).toBeNull();
    });
  });

  describe("computeAgentSuccessRate", () => {
    test("computes ratio of successes to total attempts", async () => {
      const { computeAgentSuccessRate } = await import("../process-metrics.mjs");

      // 3 issues with has-pr (success), 1 agent-failed
      const issues = [
        { labels: [{ name: "has-pr" }] },
        { labels: [{ name: "has-pr" }] },
        { labels: [{ name: "has-pr" }] },
        { labels: [{ name: "agent-failed" }] },
      ];

      const result = computeAgentSuccessRate(issues);
      // 3 / (3+1) = 75%
      expect(result).toBe(75);
    });

    test("returns 100 when no agent attempts", async () => {
      const { computeAgentSuccessRate } = await import("../process-metrics.mjs");
      expect(computeAgentSuccessRate([])).toBe(100);
    });

    test("returns 0 when all attempts failed", async () => {
      const { computeAgentSuccessRate } = await import("../process-metrics.mjs");

      const issues = [
        { labels: [{ name: "agent-failed" }] },
        { labels: [{ name: "agent-failed" }] },
      ];

      expect(computeAgentSuccessRate(issues)).toBe(0);
    });
  });

  describe("computeFpRate", () => {
    test("computes FP rate from verifications log", async () => {
      const { computeFpRate } = await import("../process-metrics.mjs");

      const verifications = [
        { verified: true, issue_number: 1 },
        { verified: true, issue_number: 2 },
        { verified: false, issue_number: 3 },
        { verified: false, issue_number: 4 },
      ];

      // 2 false positives / 4 total = 50%
      expect(computeFpRate(verifications)).toBe(50);
    });

    test("returns null when no verifications exist", async () => {
      const { computeFpRate } = await import("../process-metrics.mjs");
      expect(computeFpRate(null)).toBeNull();
    });

    test("returns 0 when all verified", async () => {
      const { computeFpRate } = await import("../process-metrics.mjs");

      const verifications = [
        { verified: true, issue_number: 1 },
        { verified: true, issue_number: 2 },
      ];

      expect(computeFpRate(verifications)).toBe(0);
    });
  });

  describe("computeImprovementsShipped", () => {
    test("counts issues with improvement label that are closed", async () => {
      const { computeImprovementsShipped } = await import("../process-metrics.mjs");

      const issues = [
        {
          state: "CLOSED",
          labels: [{ name: "improvement" }, { name: "has-pr" }],
        },
        { state: "CLOSED", labels: [{ name: "improvement" }] },
        { state: "OPEN", labels: [{ name: "improvement" }] },
        { state: "CLOSED", labels: [{ name: "bug" }] },
      ];

      expect(computeImprovementsShipped(issues)).toBe(2);
    });

    test("returns 0 when no improvement issues exist", async () => {
      const { computeImprovementsShipped } = await import("../process-metrics.mjs");
      expect(computeImprovementsShipped([])).toBe(0);
    });
  });

  describe("collectProcessMetrics", () => {
    test("assembles all metrics into structured output", async () => {
      const { collectProcessMetrics } = await import("../process-metrics.mjs");

      const closedIssues = [
        {
          number: 1,
          createdAt: "2026-05-15T10:00:00Z",
          closedAt: "2026-05-15T14:00:00Z",
          state: "CLOSED",
          labels: [{ name: "has-pr" }, { name: "improvement" }],
        },
      ];

      const issueComments = [
        {
          issueNumber: 1,
          comments: [{ body: "Budget used: $0.50" }],
        },
      ];

      const allIssues = [...closedIssues, { labels: [{ name: "agent-failed" }] }];

      const verifications = [
        { verified: true, issue_number: 1 },
        { verified: false, issue_number: 2 },
      ];

      const result = collectProcessMetrics({
        closedIssues,
        issueComments,
        allIssues,
        verifications,
      });

      expect(result).toMatchObject({
        time_to_fix_hours: 4,
        cost_per_fix_usd: 0.5,
        agent_success_rate: 50,
        fp_rate: 50,
        improvements_shipped: 1,
      });
      expect(result.timestamp).toBeDefined();
    });

    test("handles empty period gracefully", async () => {
      const { collectProcessMetrics } = await import("../process-metrics.mjs");

      const result = collectProcessMetrics({
        closedIssues: [],
        issueComments: [],
        allIssues: [],
        verifications: null,
      });

      expect(result).toMatchObject({
        time_to_fix_hours: 0,
        cost_per_fix_usd: null,
        agent_success_rate: 100,
        fp_rate: null,
        improvements_shipped: 0,
      });
    });
  });

  describe("JSONL persistence", () => {
    test("appends metric line to jsonl file", async () => {
      const { appendMetricLine } = await import("../process-metrics.mjs");

      const metricsPath = path.join(tmpDir, "metrics", "process-metrics.jsonl");
      const entry1 = {
        timestamp: "2026-05-15T10:00:00Z",
        time_to_fix_hours: 4,
        cost_per_fix_usd: 0.5,
        agent_success_rate: 75,
        fp_rate: 10,
        improvements_shipped: 3,
      };
      const entry2 = {
        timestamp: "2026-05-22T10:00:00Z",
        time_to_fix_hours: 3,
        cost_per_fix_usd: 0.4,
        agent_success_rate: 80,
        fp_rate: 5,
        improvements_shipped: 5,
      };

      appendMetricLine(metricsPath, entry1);
      appendMetricLine(metricsPath, entry2);

      const lines = fs
        .readFileSync(metricsPath, "utf-8")
        .split("\n")
        .filter((l) => l.trim());
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]).time_to_fix_hours).toBe(4);
      expect(JSON.parse(lines[1]).time_to_fix_hours).toBe(3);
    });

    test("creates parent directories if missing", async () => {
      const { appendMetricLine } = await import("../process-metrics.mjs");

      const deepPath = path.join(tmpDir, "deep", "nested", "process-metrics.jsonl");
      appendMetricLine(deepPath, { timestamp: "2026-05-15T10:00:00Z" });

      expect(fs.existsSync(deepPath)).toBe(true);
    });
  });

  describe("weekly aggregation", () => {
    test("generates weekly summary with rolling 4-week trend", async () => {
      const { generateWeeklySummary } = await import("../process-metrics.mjs");

      // 5 weeks of data, each ~7 days apart
      const entries = [
        {
          timestamp: "2026-04-17T10:00:00Z",
          time_to_fix_hours: 10,
          cost_per_fix_usd: 1.0,
          agent_success_rate: 60,
          fp_rate: 20,
          improvements_shipped: 2,
        },
        {
          timestamp: "2026-04-24T10:00:00Z",
          time_to_fix_hours: 8,
          cost_per_fix_usd: 0.8,
          agent_success_rate: 70,
          fp_rate: 15,
          improvements_shipped: 3,
        },
        {
          timestamp: "2026-05-01T10:00:00Z",
          time_to_fix_hours: 6,
          cost_per_fix_usd: 0.6,
          agent_success_rate: 75,
          fp_rate: 10,
          improvements_shipped: 4,
        },
        {
          timestamp: "2026-05-08T10:00:00Z",
          time_to_fix_hours: 5,
          cost_per_fix_usd: 0.5,
          agent_success_rate: 80,
          fp_rate: 8,
          improvements_shipped: 5,
        },
        {
          timestamp: "2026-05-15T10:00:00Z",
          time_to_fix_hours: 4,
          cost_per_fix_usd: 0.4,
          agent_success_rate: 85,
          fp_rate: 5,
          improvements_shipped: 6,
        },
      ];

      const summary = generateWeeklySummary(entries);

      expect(summary.latest).toMatchObject({
        time_to_fix_hours: 4,
        agent_success_rate: 85,
      });
      // Rolling 4-week trend: last 4 entries
      expect(summary.rolling_4_week).toBeDefined();
      expect(summary.rolling_4_week.avg_time_to_fix_hours).toBeCloseTo((8 + 6 + 5 + 4) / 4, 1);
      expect(summary.rolling_4_week.avg_agent_success_rate).toBeCloseTo((70 + 75 + 80 + 85) / 4, 1);
      expect(summary.trend).toBeDefined();
    });

    test("handles fewer than 4 weeks of data", async () => {
      const { generateWeeklySummary } = await import("../process-metrics.mjs");

      const entries = [
        {
          timestamp: "2026-05-15T10:00:00Z",
          time_to_fix_hours: 4,
          cost_per_fix_usd: 0.4,
          agent_success_rate: 85,
          fp_rate: 5,
          improvements_shipped: 6,
        },
      ];

      const summary = generateWeeklySummary(entries);

      expect(summary.latest).toMatchObject({ time_to_fix_hours: 4 });
      expect(summary.rolling_4_week.avg_time_to_fix_hours).toBe(4);
      expect(summary.trend.direction).toBe("stable");
    });

    test("returns empty summary for no entries", async () => {
      const { generateWeeklySummary } = await import("../process-metrics.mjs");

      const summary = generateWeeklySummary([]);

      expect(summary.latest).toBeNull();
      expect(summary.rolling_4_week).toBeNull();
      expect(summary.trend).toBeNull();
    });
  });

  describe("writeWeeklySummary", () => {
    test("writes weekly JSON file", async () => {
      const { writeWeeklySummary } = await import("../process-metrics.mjs");

      const summaryPath = path.join(tmpDir, "metrics", "process-metrics-weekly.json");
      const summary = {
        generated_at: "2026-05-22T10:00:00Z",
        latest: { time_to_fix_hours: 4 },
        rolling_4_week: { avg_time_to_fix_hours: 5.75 },
        trend: { direction: "improving" },
      };

      writeWeeklySummary(summaryPath, summary);

      const written = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
      expect(written.latest.time_to_fix_hours).toBe(4);
      expect(written.trend.direction).toBe("improving");
    });
  });

  describe("readJsonl helper", () => {
    test("reads JSONL file into array", async () => {
      const { readJsonl } = await import("../process-metrics.mjs");

      const filePath = path.join(tmpDir, "test.jsonl");
      fs.writeFileSync(filePath, '{"a":1}\n{"a":2}\n{"a":3}\n');

      const result = readJsonl(filePath);
      expect(result).toHaveLength(3);
      expect(result[0].a).toBe(1);
    });

    test("returns empty array for missing file", async () => {
      const { readJsonl } = await import("../process-metrics.mjs");

      const result = readJsonl(path.join(tmpDir, "nonexistent.jsonl"));
      expect(result).toEqual([]);
    });

    test("skips malformed JSON lines", async () => {
      const { readJsonl } = await import("../process-metrics.mjs");

      const filePath = path.join(tmpDir, "bad.jsonl");
      fs.writeFileSync(filePath, '{"a":1}\nnot json\n{"a":3}\n');

      const result = readJsonl(filePath);
      expect(result).toHaveLength(2);
    });
  });

  describe("extractBudgetFromComments", () => {
    test("finds budget patterns in various formats", async () => {
      const { extractBudgetFromComments } = await import("../process-metrics.mjs");

      expect(extractBudgetFromComments([{ body: "Budget used: $0.45" }])).toBeCloseTo(0.45);
      expect(extractBudgetFromComments([{ body: "budget used: $1.20" }])).toBeCloseTo(1.2);
      expect(extractBudgetFromComments([{ body: "Cost: $0.30\nOther stuff" }])).toBeCloseTo(0.3);
    });

    test("returns null for no budget info", async () => {
      const { extractBudgetFromComments } = await import("../process-metrics.mjs");

      expect(extractBudgetFromComments([{ body: "Looks good!" }])).toBeNull();
      expect(extractBudgetFromComments([])).toBeNull();
    });
  });
});
