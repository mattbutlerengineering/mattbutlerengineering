import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseThresholdChangesFromHistory,
  deduplicateEntries,
  collectThresholdChanges,
} from "../collect-threshold-changes.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "threshold-collector-test-"));
}

describe("parseThresholdChangesFromHistory", () => {
  it("extracts threshold change entries from auto-qa-tuning history", () => {
    const history = [
      {
        date: "2026-05-22",
        trigger: "threshold-auto-tuner",
        adjustments: [
          "acceptanceRateFloor: 0.85 → 0.80 (loosen, fp_rate > 30%)",
          "maxBudgetUSD: 1.5 → 1.2 (tighten, effectiveness < 50%)",
        ],
        note: "Auto-tuned 2 threshold(s) from process metrics.",
      },
      {
        date: "2026-05-10",
        trigger: "threshold-auto-tuner",
        adjustments: ["stuckTurnsThreshold: 8 → 9 (relax, good performance)"],
        note: "Auto-tuned 1 threshold(s).",
      },
    ];

    const result = parseThresholdChangesFromHistory(history);
    expect(result.length).toBe(3);
    expect(result[0]).toMatchObject({
      date: "2026-05-22",
      criterion: "acceptanceRateFloor",
      old_value: 0.85,
      new_value: 0.8,
      reason: "fp_rate > 30%",
    });
    expect(result[1]).toMatchObject({
      date: "2026-05-22",
      criterion: "maxBudgetUSD",
      old_value: 1.5,
      new_value: 1.2,
      reason: "effectiveness < 50%",
    });
    expect(result[2]).toMatchObject({
      date: "2026-05-10",
      criterion: "stuckTurnsThreshold",
      old_value: 8,
      new_value: 9,
      // format is (direction, trigger) — direction "relax" is stripped, reason is the trigger
      reason: "good performance",
    });
  });

  it("returns empty array for empty history", () => {
    expect(parseThresholdChangesFromHistory([])).toEqual([]);
  });

  it("skips history entries that are not from threshold-auto-tuner", () => {
    const history = [
      {
        date: "2026-04-25",
        trigger: "seed",
        note: "Initial values.",
      },
      {
        date: "2026-05-10",
        trigger: "auto-qa-tune",
        adjustments: ["stuckTurnsThreshold: 8 → 9 (relax, good performance)"],
        note: "auto-qa-tune adjustment",
      },
    ];

    const result = parseThresholdChangesFromHistory(history);
    expect(result.length).toBe(1);
    expect(result[0].criterion).toBe("stuckTurnsThreshold");
  });

  it("emits a fallback summary entry for free-form adjustment strings", () => {
    const history = [
      {
        date: "2026-05-22",
        trigger: "threshold-auto-tuner",
        adjustments: ["Acceptance rate 100% is excellent. Stuck-turns relaxed from 8 to 9."],
        note: "test",
      },
    ];

    const result = parseThresholdChangesFromHistory(history);
    // Free-form strings produce one summary entry per block (no criterion/old_value/new_value)
    expect(result.length).toBe(1);
    expect(result[0].date).toBe("2026-05-22");
    expect(result[0].reason).toContain("Stuck-turns relaxed");
    expect(result[0].criterion).toBeUndefined();
  });
});

describe("deduplicateEntries", () => {
  it("removes entries that already exist in the file", () => {
    const existing = [
      { date: "2026-05-22", criterion: "acceptanceRateFloor", old_value: 0.85, new_value: 0.8 },
    ];
    const newEntries = [
      { date: "2026-05-22", criterion: "acceptanceRateFloor", old_value: 0.85, new_value: 0.8 },
      { date: "2026-05-10", criterion: "stuckTurnsThreshold", old_value: 8, new_value: 9 },
    ];

    const result = deduplicateEntries(newEntries, existing);
    expect(result.length).toBe(1);
    expect(result[0].criterion).toBe("stuckTurnsThreshold");
  });

  it("returns all entries when existing is empty", () => {
    const entries = [
      { date: "2026-05-22", criterion: "acceptanceRateFloor", old_value: 0.85, new_value: 0.8 },
    ];
    expect(deduplicateEntries(entries, [])).toEqual(entries);
  });
});

describe("collectThresholdChanges", () => {
  let dir;

  beforeEach(() => {
    dir = makeTmpDir();
    mkdirSync(join(dir, ".github"), { recursive: true });
    mkdirSync(join(dir, "metrics"), { recursive: true });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("writes new threshold change entries to JSONL file", () => {
    const config = {
      version: 1,
      thresholds: { acceptanceRateFloor: 0.8 },
      history: [
        {
          date: "2026-05-22",
          trigger: "threshold-auto-tuner",
          adjustments: ["acceptanceRateFloor: 0.85 → 0.80 (loosen, fp_rate > 30%)"],
          note: "Auto-tuned.",
        },
      ],
    };
    writeFileSync(join(dir, ".github", "auto-qa-tuning.json"), JSON.stringify(config));

    const changesPath = join(dir, "metrics", "threshold-changes.jsonl");
    collectThresholdChanges(dir, changesPath);

    expect(existsSync(changesPath)).toBe(true);
    const lines = readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(1);
    const entry = JSON.parse(lines[0]);
    expect(entry.criterion).toBe("acceptanceRateFloor");
    expect(entry.old_value).toBe(0.85);
    expect(entry.new_value).toBe(0.8);
    expect(entry.reason).toBe("fp_rate > 30%");
  });

  it("does not duplicate entries already in JSONL", () => {
    const config = {
      version: 1,
      thresholds: { acceptanceRateFloor: 0.8 },
      history: [
        {
          date: "2026-05-22",
          trigger: "threshold-auto-tuner",
          adjustments: ["acceptanceRateFloor: 0.85 → 0.80 (loosen, fp_rate > 30%)"],
          note: "Auto-tuned.",
        },
      ],
    };
    writeFileSync(join(dir, ".github", "auto-qa-tuning.json"), JSON.stringify(config));

    const changesPath = join(dir, "metrics", "threshold-changes.jsonl");
    // Pre-populate with same entry
    writeFileSync(
      changesPath,
      JSON.stringify({
        date: "2026-05-22",
        criterion: "acceptanceRateFloor",
        old_value: 0.85,
        new_value: 0.8,
        reason: "fp_rate > 30%",
      }) + "\n"
    );

    collectThresholdChanges(dir, changesPath);

    const lines = readFileSync(changesPath, "utf-8")
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.length).toBe(1); // Still just 1 line
  });

  it("returns 0 when no auto-qa-tuning.json exists", () => {
    const changesPath = join(dir, "metrics", "threshold-changes.jsonl");
    const count = collectThresholdChanges(dir, changesPath);
    expect(count).toBe(0);
    expect(existsSync(changesPath)).toBe(false);
  });

  it("returns count of new entries appended", () => {
    const config = {
      version: 1,
      thresholds: {},
      history: [
        {
          date: "2026-05-22",
          trigger: "threshold-auto-tuner",
          adjustments: [
            "acceptanceRateFloor: 0.85 → 0.80 (loosen, fp_rate > 30%)",
            "maxBudgetUSD: 1.5 → 1.2 (tighten, effectiveness < 50%)",
          ],
          note: "Auto-tuned.",
        },
      ],
    };
    writeFileSync(join(dir, ".github", "auto-qa-tuning.json"), JSON.stringify(config));

    const changesPath = join(dir, "metrics", "threshold-changes.jsonl");
    const count = collectThresholdChanges(dir, changesPath);
    expect(count).toBe(2);
  });
});
