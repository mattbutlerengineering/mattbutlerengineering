import { describe, it, expect } from "vitest";
import { collectCcusageSensor } from "../collect-ccusage.mjs";

const TEST_NOW = new Date("2026-06-26T12:00:00Z");

/**
 * Build a ccusage daily JSON payload.
 * `daysAgo` is relative to TEST_NOW so entries are stable regardless of wall-clock date.
 */
function makeEntry(daysAgo, totalCost, opts = {}) {
  const d = new Date(TEST_NOW - daysAgo * 24 * 60 * 60 * 1000);
  const period = d.toISOString().slice(0, 10);
  return {
    period,
    agent: "all",
    totalCost,
    cacheReadTokens: opts.cacheReadTokens ?? 0,
    inputTokens: opts.inputTokens ?? 0,
    cacheCreationTokens: opts.cacheCreationTokens ?? 0,
    outputTokens: opts.outputTokens ?? 0,
    totalTokens: 0,
    modelsUsed: opts.modelsUsed ?? [],
    modelBreakdowns: opts.modelBreakdowns ?? [],
    metadata: { agents: ["claude"] },
  };
}

describe("collectCcusageSensor", () => {
  it("returns available:false when readCcusage returns null", () => {
    const result = collectCcusageSensor(() => null);
    expect(result.available).toBe(false);
  });

  it("returns available:false when readCcusage throws", () => {
    const result = collectCcusageSensor(() => {
      throw new Error("ccusage not found");
    });
    expect(result.available).toBe(false);
  });

  it("returns available:false when daily array is empty", () => {
    const result = collectCcusageSensor(() => ({ daily: [] }));
    expect(result.available).toBe(false);
  });

  it("returns available:false when JSON has no daily key", () => {
    const result = collectCcusageSensor(() => ({}));
    expect(result.available).toBe(false);
  });

  it("aggregates spend for today, 7d, and 30d windows", () => {
    const now = TEST_NOW;
    const entries = [
      makeEntry(0, 1.5), // today
      makeEntry(3, 2.0), // 3 days ago → within 7d + 30d
      makeEntry(8, 0.5), // 8 days ago → outside 7d, within 30d
      makeEntry(31, 9.9), // 31 days ago → outside 30d
    ];

    const result = collectCcusageSensor(() => ({ daily: entries }), now);

    expect(result.available).toBe(true);
    expect(result.spend_today_usd).toBeCloseTo(1.5, 2);
    expect(result.spend_7d_usd).toBeCloseTo(3.5, 2);
    expect(result.spend_30d_usd).toBeCloseTo(4.0, 2);
  });

  it("computes cache_hit_rate as cache_read / (cache_read + input + cache_creation)", () => {
    const now = TEST_NOW;
    const entries = [
      makeEntry(0, 1.0, {
        cacheReadTokens: 100,
        inputTokens: 50,
        cacheCreationTokens: 50,
      }),
    ];

    const result = collectCcusageSensor(() => ({ daily: entries }), now);

    expect(result.available).toBe(true);
    // 100 / (100 + 50 + 50) = 0.5
    expect(result.cache_hit_rate).toBeCloseTo(0.5, 4);
  });

  it("returns cache_hit_rate of 0 when all token counts are zero (divide-by-zero guard)", () => {
    const now = TEST_NOW;
    const result = collectCcusageSensor(() => ({ daily: [makeEntry(0, 0.1)] }), now);
    expect(result.available).toBe(true);
    expect(result.cache_hit_rate).toBe(0);
  });

  it("emits correct token totals from 30d entries", () => {
    const now = TEST_NOW;
    const entries = [
      makeEntry(0, 1.0, {
        cacheReadTokens: 1000,
        inputTokens: 200,
        cacheCreationTokens: 100,
        outputTokens: 300,
      }),
      makeEntry(20, 0.5, {
        cacheReadTokens: 500,
        inputTokens: 100,
        cacheCreationTokens: 50,
        outputTokens: 150,
      }),
      // outside 30d — should not be included
      makeEntry(35, 999, {
        cacheReadTokens: 99999,
        inputTokens: 99999,
        cacheCreationTokens: 99999,
        outputTokens: 99999,
      }),
    ];

    const result = collectCcusageSensor(() => ({ daily: entries }), now);

    expect(result.cache_read_tokens).toBe(1500);
    expect(result.output_tokens).toBe(450);
    expect(result.cache_creation_tokens).toBe(150);
  });

  it("builds by_model from modelBreakdowns within 30d window", () => {
    const now = TEST_NOW;
    const entries = [
      makeEntry(0, 1.0, {
        modelBreakdowns: [
          {
            modelName: "claude-sonnet-4-6",
            cost: 0.8,
            inputTokens: 100,
            outputTokens: 200,
            cacheReadTokens: 500,
            cacheCreationTokens: 50,
          },
          {
            modelName: "claude-haiku-4",
            cost: 0.2,
            inputTokens: 50,
            outputTokens: 100,
            cacheReadTokens: 200,
            cacheCreationTokens: 20,
          },
        ],
      }),
      makeEntry(5, 0.5, {
        modelBreakdowns: [
          {
            modelName: "claude-sonnet-4-6",
            cost: 0.5,
            inputTokens: 50,
            outputTokens: 100,
            cacheReadTokens: 250,
            cacheCreationTokens: 25,
          },
        ],
      }),
    ];

    const result = collectCcusageSensor(() => ({ daily: entries }), now);

    expect(result.available).toBe(true);
    expect(result.by_model["claude-sonnet-4-6"]).toBeDefined();
    expect(result.by_model["claude-sonnet-4-6"].cost).toBeCloseTo(1.3, 4);
    expect(result.by_model["claude-sonnet-4-6"].output_tokens).toBe(300);
    expect(result.by_model["claude-haiku-4"]).toBeDefined();
    expect(result.by_model["claude-haiku-4"].cost).toBeCloseTo(0.2, 4);
  });
});
