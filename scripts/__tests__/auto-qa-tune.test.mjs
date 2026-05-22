import { describe, it, expect } from "vitest";
import { computeAcceptanceRates, tiersBelowFloor, adjustThresholds } from "../auto-qa-tune.mjs";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ENTRY_NO_CATEGORIES = {
  date: "2026-05-02",
  window_days: 30,
  total_ai_prs: 40,
  merged: 40,
  rejected: 0,
  acceptance_rate: 1,
};

const ENTRY_WITH_CATEGORIES = {
  date: "2026-05-02",
  window_days: 30,
  total_ai_prs: 20,
  acceptance_rate: 0.75,
  by_category: {
    "tier:trivial": { total: 10, merged: 9 }, // 0.90 — above 0.85 floor
    "tier:standard": { total: 10, merged: 7 }, // 0.70 — below 0.85 floor
  },
};

const SEED_TUNING = {
  version: 1,
  lastTunedAt: "2026-04-25",
  thresholds: {
    acceptanceRateFloor: 0.85,
    maxBudgetUSD: 1.5,
    maxRetries: 2,
    stuckTurnsThreshold: 8,
  },
  rules: {
    "tier:trivial": {
      maxBudgetUSDOverride: 0.5,
    },
    "tier:critical": {
      requireSpecialistReview: true,
    },
  },
  history: [
    {
      date: "2026-04-25",
      trigger: "seed",
      note: "Initial values.",
    },
  ],
};

// ---------------------------------------------------------------------------
// computeAcceptanceRates
// ---------------------------------------------------------------------------

describe("computeAcceptanceRates", () => {
  it("returns overall rate from top-level field when no by_category", () => {
    const { overall, byCategory } = computeAcceptanceRates(ENTRY_NO_CATEGORIES);
    expect(overall).toBe(1);
    expect(byCategory).toEqual({});
  });

  it("computes per-category rates correctly", () => {
    const { overall, byCategory } = computeAcceptanceRates(ENTRY_WITH_CATEGORIES);
    expect(overall).toBe(0.75);
    expect(byCategory["tier:trivial"]).toBeCloseTo(0.9);
    expect(byCategory["tier:standard"]).toBeCloseTo(0.7);
  });

  it("skips categories with zero total to avoid division by zero", () => {
    const entry = {
      acceptance_rate: 0.8,
      by_category: {
        "tier:empty": { total: 0, merged: 0 },
      },
    };
    const { byCategory } = computeAcceptanceRates(entry);
    expect(byCategory["tier:empty"]).toBeUndefined();
  });

  it("defaults overall to 1 when acceptance_rate field is absent", () => {
    const { overall } = computeAcceptanceRates({});
    expect(overall).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// tiersBelowFloor
// ---------------------------------------------------------------------------

describe("tiersBelowFloor", () => {
  it("returns tiers whose rate is strictly below the floor", () => {
    const rates = {
      "tier:trivial": 0.9,
      "tier:standard": 0.7,
      "tier:critical": 0.85,
    };
    const below = tiersBelowFloor(rates, 0.85);
    expect(below).toContain("tier:standard");
    expect(below).not.toContain("tier:trivial");
    // tier:critical is exactly at the floor — not below
    expect(below).not.toContain("tier:critical");
  });

  it("returns empty array when all tiers are at or above floor", () => {
    const rates = { "tier:trivial": 0.95, "tier:critical": 0.88 };
    expect(tiersBelowFloor(rates, 0.85)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// adjustThresholds — no changes needed
// ---------------------------------------------------------------------------

describe("adjustThresholds — no tiers below floor", () => {
  it("does not mutate the input object", () => {
    const original = JSON.parse(JSON.stringify(SEED_TUNING));
    adjustThresholds(SEED_TUNING, [], "2026-05-02");
    expect(SEED_TUNING).toEqual(original);
  });

  it("appends a history entry explaining no change was needed", () => {
    const result = adjustThresholds(SEED_TUNING, [], "2026-05-02");
    const last = result.history[result.history.length - 1];
    expect(last.trigger).toBe("auto-tune");
    expect(last.note).toMatch(/above acceptance floor/i);
  });

  it("updates lastTunedAt", () => {
    const result = adjustThresholds(SEED_TUNING, [], "2026-05-02");
    expect(result.lastTunedAt).toBe("2026-05-02");
  });

  it("preserves all other thresholds unchanged", () => {
    const result = adjustThresholds(SEED_TUNING, [], "2026-05-02");
    expect(result.thresholds).toEqual(SEED_TUNING.thresholds);
  });
});

// ---------------------------------------------------------------------------
// adjustThresholds — tiers below floor
// ---------------------------------------------------------------------------

describe("adjustThresholds — tiers below floor", () => {
  it("halves maxBudgetUSDOverride for the failing tier", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:trivial"], "2026-05-02");
    expect(result.rules["tier:trivial"].maxBudgetUSDOverride).toBeCloseTo(0.25);
  });

  it("falls back to global maxBudgetUSD when tier has no override", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:critical"], "2026-05-02");
    // tier:critical had no maxBudgetUSDOverride → falls back to 1.5 → halved to 0.75
    expect(result.rules["tier:critical"].maxBudgetUSDOverride).toBeCloseTo(0.75);
  });

  it("preserves existing tier properties not related to budget", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:critical"], "2026-05-02");
    expect(result.rules["tier:critical"].requireSpecialistReview).toBe(true);
  });

  it("does not modify tiers that are above the floor", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:trivial"], "2026-05-02");
    // tier:critical should remain untouched
    expect(result.rules["tier:critical"]).toEqual(SEED_TUNING.rules["tier:critical"]);
  });

  it("includes a human-readable rationale in the history entry", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:trivial"], "2026-05-02");
    const last = result.history[result.history.length - 1];
    expect(last.trigger).toBe("auto-tune");
    expect(last.note).toMatch(/tier:trivial/);
    expect(last.note).toMatch(/0\.5/); // previous value
    expect(last.note).toMatch(/0\.25/); // new value
  });

  it("history note names both previous and new value for each changed tier", () => {
    const result = adjustThresholds(SEED_TUNING, ["tier:trivial", "tier:critical"], "2026-05-03");
    const last = result.history[result.history.length - 1];
    expect(last.note).toMatch(/tier:trivial/);
    expect(last.note).toMatch(/tier:critical/);
  });

  it("does not mutate the input rules object", () => {
    const originalRules = JSON.parse(JSON.stringify(SEED_TUNING.rules));
    adjustThresholds(SEED_TUNING, ["tier:trivial"], "2026-05-02");
    expect(SEED_TUNING.rules).toEqual(originalRules);
  });
});
