import { describe, it, expect } from "vitest";
import {
  normalizeHealthTrends,
  describeTrendSeries,
  type HealthTrendsPayload,
} from "./ai-health-trends.js";

// Matches scripts/generate-health-trends.mjs's output exactly — the real shape
// written to apps/marketing/public/ai-health-trends.json.
const MOCK_TRENDS: HealthTrendsPayload = {
  generated_at: "2026-09-20T12:00:00.000Z",
  window_days: 60,
  acmmLevel: {
    label: "ACMM maturity level",
    source: ".claude/acmm/state.json",
    points: [
      { date: "2026-09-18", value: 4, note: null },
      { date: "2026-09-19", value: 5, note: null },
      { date: "2026-09-20", value: 5, note: null },
    ],
  },
  queueEfficiency: {
    label: "Queue efficiency composite",
    source: "metrics/process-metrics.jsonl",
    points: [
      { date: "2026-09-13", value: 0.923, note: null },
      { date: "2026-09-15", value: null, note: "query_error" },
      { date: "2026-09-16", value: 0.911, note: null },
    ],
  },
};

describe("normalizeHealthTrends", () => {
  it("reads the generated payload into display values", () => {
    const trends = normalizeHealthTrends(MOCK_TRENDS);

    expect(trends.generatedAt).toBe("2026-09-20T12:00:00.000Z");
    expect(trends.windowDays).toBe(60);
    expect(trends.acmmLevel.label).toBe("ACMM maturity level");
    expect(trends.acmmLevel.points).toHaveLength(3);
  });

  it("keeps an unmeasured day as an explicit hole rather than dropping it", () => {
    const { queueEfficiency } = normalizeHealthTrends(MOCK_TRENDS);

    expect(queueEfficiency.points).toEqual([
      { date: "2026-09-13", value: 0.923, note: null },
      { date: "2026-09-15", value: null, note: "query_error" },
      { date: "2026-09-16", value: 0.911, note: null },
    ]);
    expect(queueEfficiency.missing).toBe(1);
    expect(queueEfficiency.reported).toBe(2);
  });

  it("reports the oldest and newest measured values, skipping over holes", () => {
    const { queueEfficiency } = normalizeHealthTrends({
      ...MOCK_TRENDS,
      queueEfficiency: {
        label: "Queue efficiency composite",
        points: [
          { date: "2026-09-12", value: null, note: "query_error" },
          { date: "2026-09-13", value: 0.923, note: null },
          { date: "2026-09-16", value: 0.911, note: null },
          { date: "2026-09-17", value: null, note: "query_error" },
        ],
      },
    });

    expect(queueEfficiency.first).toEqual({ date: "2026-09-13", value: 0.923 });
    expect(queueEfficiency.latest).toEqual({ date: "2026-09-16", value: 0.911 });
  });

  it("degrades to empty series on a malformed payload instead of throwing", () => {
    for (const payload of [null, undefined, 42, "nope", {}, { acmmLevel: "nope" }]) {
      const trends = normalizeHealthTrends(payload);
      expect(trends.acmmLevel.points).toEqual([]);
      expect(trends.queueEfficiency.points).toEqual([]);
      expect(trends.generatedAt).toBeNull();
    }
  });

  it("drops a point whose date or value crossed the boundary malformed", () => {
    const { acmmLevel } = normalizeHealthTrends({
      acmmLevel: {
        points: [
          { date: 5, value: 5 },
          { value: 5 },
          { date: "2026-09-20", value: "five" },
          { date: "2026-09-21", value: 6 },
        ],
      },
    });

    expect(acmmLevel.points).toEqual([
      { date: "2026-09-20", value: null, note: null },
      { date: "2026-09-21", value: 6, note: null },
    ]);
  });

  it("falls back to a stable label when the payload omits one", () => {
    const trends = normalizeHealthTrends({ acmmLevel: { points: [] } });
    expect(trends.acmmLevel.label).toBe("ACMM maturity level");
    expect(trends.queueEfficiency.label).toBe("Queue efficiency composite");
  });
});

describe("describeTrendSeries", () => {
  const format = (value: number) => value.toFixed(2);

  it("states the span, the direction of travel, and the number of gaps", () => {
    const { queueEfficiency } = normalizeHealthTrends(MOCK_TRENDS);

    expect(describeTrendSeries(queueEfficiency, format)).toBe(
      "Queue efficiency composite over 3 days: 0.92 on 2026-09-13 to 0.91 on 2026-09-16. " +
        "2 days measured, 1 day with no measurement."
    );
  });

  it("pluralises a single measured day and multiple gaps", () => {
    const { acmmLevel } = normalizeHealthTrends({
      acmmLevel: {
        label: "ACMM maturity level",
        points: [
          { date: "2026-09-18", value: null, note: "no_level_recorded" },
          { date: "2026-09-19", value: null, note: "no_level_recorded" },
          { date: "2026-09-20", value: 5, note: null },
        ],
      },
    });

    expect(describeTrendSeries(acmmLevel, format)).toBe(
      "ACMM maturity level over 3 days: 5.00 on 2026-09-20 to 5.00 on 2026-09-20. " +
        "1 day measured, 2 days with no measurement."
    );
  });

  it("says so plainly when nothing has been measured at all", () => {
    const { acmmLevel } = normalizeHealthTrends({ acmmLevel: { points: [] } });
    expect(describeTrendSeries(acmmLevel, format)).toBe("ACMM maturity level: no history yet.");
  });
});
