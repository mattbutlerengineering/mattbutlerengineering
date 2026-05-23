import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  computeAdjustments,
  applyAdjustments,
  loadThresholdHistory,
  isWithinWeeklyLimit,
  HARD_FLOORS,
} from "../threshold-tuner.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "tuner-test-"));
}

describe("computeAdjustments", () => {
  it("loosens threshold by 5% when FP rate > 30%", () => {
    const metrics = { fp_rate: 35, agent_success_rate: 70 };
    const current = { acceptanceRateFloor: 0.85 };
    const result = computeAdjustments(metrics, current, []);
    const adj = result.find((a) => a.threshold === "acceptanceRateFloor");
    expect(adj).toBeTruthy();
    expect(adj.direction).toBe("loosen");
    expect(adj.newValue).toBeLessThan(current.acceptanceRateFloor);
  });

  it("tightens threshold by 5% when effectiveness < 50%", () => {
    const metrics = { fp_rate: 15, agent_success_rate: 40 };
    const current = { acceptanceRateFloor: 0.85 };
    const result = computeAdjustments(metrics, current, []);
    const adj = result.find((a) => a.threshold === "acceptanceRateFloor");
    expect(adj).toBeTruthy();
    expect(adj.direction).toBe("tighten");
    expect(adj.newValue).toBeGreaterThan(current.acceptanceRateFloor);
  });

  it("tightens by 3% when FP < 10% and effectiveness > 80%", () => {
    const metrics = { fp_rate: 5, agent_success_rate: 90 };
    const current = { acceptanceRateFloor: 0.85 };
    const result = computeAdjustments(metrics, current, []);
    const adj = result.find((a) => a.threshold === "acceptanceRateFloor");
    expect(adj).toBeTruthy();
    expect(adj.direction).toBe("tighten");
    expect(adj.newValue - current.acceptanceRateFloor).toBeCloseTo(0.03, 2);
  });

  it("returns empty when metrics in normal range", () => {
    const metrics = { fp_rate: 20, agent_success_rate: 65 };
    const current = { acceptanceRateFloor: 0.85 };
    const result = computeAdjustments(metrics, current, []);
    expect(result.length).toBe(0);
  });

  it("returns empty when metrics are null", () => {
    const metrics = { fp_rate: null, agent_success_rate: null };
    const current = { acceptanceRateFloor: 0.85 };
    const result = computeAdjustments(metrics, current, []);
    expect(result.length).toBe(0);
  });
});

describe("guard rails", () => {
  it("never drops below hard floor", () => {
    const metrics = { fp_rate: 50, agent_success_rate: 70 };
    const current = { acceptanceRateFloor: HARD_FLOORS.acceptanceRateFloor + 0.01 };
    const result = computeAdjustments(metrics, current, []);
    const adj = result.find((a) => a.threshold === "acceptanceRateFloor");
    if (adj) {
      expect(adj.newValue).toBeGreaterThanOrEqual(HARD_FLOORS.acceptanceRateFloor);
    }
  });

  it("never exceeds ceiling", () => {
    const metrics = { fp_rate: 5, agent_success_rate: 95 };
    const current = { acceptanceRateFloor: 0.98 };
    const result = computeAdjustments(metrics, current, []);
    const adj = result.find((a) => a.threshold === "acceptanceRateFloor");
    if (adj) {
      expect(adj.newValue).toBeLessThanOrEqual(1.0);
    }
  });

  it("enforces max 10% weekly change", () => {
    const recentChanges = [
      {
        date: new Date().toISOString().split("T")[0],
        threshold: "acceptanceRateFloor",
        oldValue: 0.85,
        newValue: 0.77,
      },
    ];
    const result = isWithinWeeklyLimit("acceptanceRateFloor", 0.77, 0.7, recentChanges);
    expect(result).toBe(false);
  });

  it("allows change within 10% weekly limit", () => {
    const result = isWithinWeeklyLimit("acceptanceRateFloor", 0.85, 0.8, []);
    expect(result).toBe(true);
  });
});

describe("applyAdjustments", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes adjusted threshold to tuning config", () => {
    const configPath = join(dir, "auto-qa-tuning.json");
    const changesPath = join(dir, "threshold-changes.jsonl");
    const config = {
      version: 1,
      thresholds: { acceptanceRateFloor: 0.85 },
      history: [],
    };
    writeFileSync(configPath, JSON.stringify(config));

    const adjustments = [
      {
        threshold: "acceptanceRateFloor",
        oldValue: 0.85,
        newValue: 0.8,
        direction: "loosen",
        trigger: "fp_rate > 30%",
        evidence: "FP rate: 35%",
      },
    ];

    applyAdjustments(adjustments, configPath, changesPath);

    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.thresholds.acceptanceRateFloor).toBe(0.8);
    expect(updated.history.length).toBe(1);
    expect(updated.history[0].trigger).toBe("threshold-auto-tuner");
  });

  it("appends to threshold-changes.jsonl", () => {
    const configPath = join(dir, "auto-qa-tuning.json");
    const changesPath = join(dir, "threshold-changes.jsonl");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, thresholds: { acceptanceRateFloor: 0.85 }, history: [] })
    );

    const adjustments = [
      {
        threshold: "acceptanceRateFloor",
        oldValue: 0.85,
        newValue: 0.8,
        direction: "loosen",
        trigger: "fp_rate > 30%",
        evidence: "FP rate: 35%",
      },
    ];

    applyAdjustments(adjustments, configPath, changesPath);

    const lines = readFileSync(changesPath, "utf-8").trim().split("\n");
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.threshold).toBe("acceptanceRateFloor");
    expect(entry.oldValue).toBe(0.85);
    expect(entry.newValue).toBe(0.8);
  });

  it("does nothing when adjustments array is empty", () => {
    const configPath = join(dir, "auto-qa-tuning.json");
    const changesPath = join(dir, "threshold-changes.jsonl");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, thresholds: { acceptanceRateFloor: 0.85 }, history: [] })
    );

    applyAdjustments([], configPath, changesPath);

    const updated = JSON.parse(readFileSync(configPath, "utf-8"));
    expect(updated.thresholds.acceptanceRateFloor).toBe(0.85);
    expect(updated.history.length).toBe(0);
  });
});

describe("loadThresholdHistory", () => {
  it("returns empty array when file doesn't exist", () => {
    const result = loadThresholdHistory("/nonexistent/path.jsonl");
    expect(result).toEqual([]);
  });

  it("parses JSONL entries", () => {
    const dir = makeTmpDir();
    const path = join(dir, "changes.jsonl");
    writeFileSync(
      path,
      '{"date":"2026-05-22","threshold":"acceptanceRateFloor","oldValue":0.85,"newValue":0.80}\n'
    );
    const result = loadThresholdHistory(path);
    expect(result.length).toBe(1);
    expect(result[0].threshold).toBe("acceptanceRateFloor");
    rmSync(dir, { recursive: true });
  });
});
