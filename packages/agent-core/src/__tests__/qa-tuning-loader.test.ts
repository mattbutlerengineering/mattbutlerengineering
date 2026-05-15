import { describe, it, expect } from "vitest";
import { parseThresholds, applyTuningDefaults, QaTuningConfigSchema } from "../qa-tuning-loader.js";
import type { QaTuningThresholds } from "../qa-tuning-loader.js";

// ── parseThresholds ─────────────────────────────────────────────────

describe("parseThresholds", () => {
  const validConfig = {
    version: 1,
    lastTunedAt: "2026-05-01",
    thresholds: {
      acceptanceRateFloor: 0.85,
      maxBudgetUSD: 1.5,
      maxRetries: 2,
      stuckTurnsThreshold: 8,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.3,
    },
  };

  it("extracts thresholds from a valid config", () => {
    const result = parseThresholds(validConfig);
    expect(result).toEqual({
      acceptanceRateFloor: 0.85,
      maxBudgetUSD: 1.5,
      maxRetries: 2,
      stuckTurnsThreshold: 8,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.3,
    });
  });

  it("returns null for null input", () => {
    expect(parseThresholds(null)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(parseThresholds("string")).toBeNull();
    expect(parseThresholds(42)).toBeNull();
  });

  it("returns null when thresholds key is missing", () => {
    expect(parseThresholds({ version: 1 })).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    const { stuckTurnsThreshold: _, ...incomplete } = validConfig.thresholds;
    expect(parseThresholds({ thresholds: incomplete })).toBeNull();
  });

  it("returns null when a field has wrong type", () => {
    const bad = {
      thresholds: { ...validConfig.thresholds, maxBudgetUSD: "not-a-number" },
    };
    expect(parseThresholds(bad)).toBeNull();
  });

  it("ignores extra $comment fields", () => {
    const withComments = {
      ...validConfig,
      thresholds: {
        ...validConfig.thresholds,
        "maxBudgetUSD.$comment": "some explanation",
      },
    };
    const result = parseThresholds(withComments);
    expect(result).not.toBeNull();
    expect(result?.maxBudgetUSD).toBe(1.5);
  });
});

// ── applyTuningDefaults ─────────────────────────────────────────────

describe("applyTuningDefaults", () => {
  const tuning: QaTuningThresholds = {
    acceptanceRateFloor: 0.85,
    maxBudgetUSD: 1.0,
    maxRetries: 2,
    stuckTurnsThreshold: 6,
    meanCloseHoursTarget: 24,
    agentMergeShareTarget: 0.3,
  };

  const HARD_CODED_DEFAULT = 1.0;

  it("applies tuning budget when session uses hard-coded default", () => {
    const result = applyTuningDefaults({ maxBudgetUsd: 1.0 }, tuning, HARD_CODED_DEFAULT);
    expect(result.maxBudgetUsd).toBe(1.0); // tuning also says 1.0
  });

  it("uses tuned budget when tuning differs from hard-coded default", () => {
    const lowerTuning = { ...tuning, maxBudgetUSD: 0.75 };
    const result = applyTuningDefaults({ maxBudgetUsd: 1.0 }, lowerTuning, HARD_CODED_DEFAULT);
    expect(result.maxBudgetUsd).toBe(0.75);
  });

  it("preserves explicit CLI budget over tuning", () => {
    const result = applyTuningDefaults({ maxBudgetUsd: 2.5 }, tuning, HARD_CODED_DEFAULT);
    expect(result.maxBudgetUsd).toBe(2.5);
  });

  it("applies stuck threshold when no explicit config provided", () => {
    const result = applyTuningDefaults({ maxBudgetUsd: 1.0 }, tuning, HARD_CODED_DEFAULT);
    expect(result.stuckDetectorConfig).toEqual({
      zeroProgressThreshold: 6,
    });
  });

  it("preserves explicit stuck threshold over tuning", () => {
    const result = applyTuningDefaults(
      {
        maxBudgetUsd: 1.0,
        stuckDetectorConfig: { zeroProgressThreshold: 10 },
      },
      tuning,
      HARD_CODED_DEFAULT
    );
    expect(result.stuckDetectorConfig).toEqual({
      zeroProgressThreshold: 10,
    });
  });

  it("does not mutate the input session defaults", () => {
    const original = { maxBudgetUsd: 1.0 };
    const frozen = Object.freeze(original);
    // Should not throw — no mutation
    const result = applyTuningDefaults(frozen, tuning, HARD_CODED_DEFAULT);
    expect(result.maxBudgetUsd).toBe(1.0);
    expect(original.maxBudgetUsd).toBe(1.0);
  });
});

// ── QaTuningConfigSchema ───────────────────────────────────────────

describe("QaTuningConfigSchema", () => {
  const validRaw = {
    version: 1,
    lastTunedAt: "2026-05-01",
    thresholds: {
      acceptanceRateFloor: 0.85,
      maxBudgetUSD: 1.5,
      maxRetries: 2,
      stuckTurnsThreshold: 8,
      meanCloseHoursTarget: 24,
      agentMergeShareTarget: 0.3,
    },
  };

  it("accepts a valid config", () => {
    const result = QaTuningConfigSchema.safeParse(validRaw);
    expect(result.success).toBe(true);
  });

  it("accepts config with extra passthrough keys", () => {
    const withExtras = {
      ...validRaw,
      $schema: "https://example.com",
      $comment: "test",
      rules: { "tier:trivial": { maxBudgetUSDOverride: 0.5 } },
      history: [{ date: "2026-04-25", trigger: "seed" }],
      thresholds: {
        ...validRaw.thresholds,
        "maxBudgetUSD.$comment": "explanation",
      },
    };
    const result = QaTuningConfigSchema.safeParse(withExtras);
    expect(result.success).toBe(true);
  });

  it("rejects config with wrong threshold type", () => {
    const bad = {
      ...validRaw,
      thresholds: { ...validRaw.thresholds, maxBudgetUSD: "not-a-number" },
    };
    const result = QaTuningConfigSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects config missing version", () => {
    const { version: _, ...noVersion } = validRaw;
    const result = QaTuningConfigSchema.safeParse(noVersion);
    expect(result.success).toBe(false);
  });

  it("rejects config missing lastTunedAt", () => {
    const { lastTunedAt: _, ...noDate } = validRaw;
    const result = QaTuningConfigSchema.safeParse(noDate);
    expect(result.success).toBe(false);
  });

  it("rejects config with missing threshold field", () => {
    const { stuckTurnsThreshold: _, ...partial } = validRaw.thresholds;
    const result = QaTuningConfigSchema.safeParse({
      ...validRaw,
      thresholds: partial,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(QaTuningConfigSchema.safeParse(null).success).toBe(false);
    expect(QaTuningConfigSchema.safeParse("string").success).toBe(false);
    expect(QaTuningConfigSchema.safeParse(42).success).toBe(false);
  });
});
