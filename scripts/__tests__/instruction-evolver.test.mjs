import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  detectPatterns,
  classifyRisk,
  formatGotchaEntry,
  logInstructionChange,
  loadJsonl,
} from "../instruction-evolver.mjs";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "evolver-test-"));
}

describe("detectPatterns", () => {
  it("detects recurring failure pattern (3+ occurrences)", () => {
    const metrics = [
      { timestamp: "2026-05-20T10:00:00Z", fp_rate: 35, agent_success_rate: 60 },
      { timestamp: "2026-05-21T10:00:00Z", fp_rate: 38, agent_success_rate: 55 },
      { timestamp: "2026-05-22T10:00:00Z", fp_rate: 40, agent_success_rate: 50 },
    ];
    const thresholdChanges = [];
    const patterns = detectPatterns(metrics, thresholdChanges);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].type).toBe("recurring-high-fp");
  });

  it("detects recurring threshold adjustments in same direction", () => {
    const metrics = [];
    const thresholdChanges = [
      { date: "2026-05-20", threshold: "acceptanceRateFloor", direction: "loosen" },
      { date: "2026-05-21", threshold: "acceptanceRateFloor", direction: "loosen" },
      { date: "2026-05-22", threshold: "acceptanceRateFloor", direction: "loosen" },
    ];
    const patterns = detectPatterns(metrics, thresholdChanges);
    const p = patterns.find((p) => p.type === "recurring-threshold-drift");
    expect(p).toBeTruthy();
    expect(p.detail).toContain("acceptanceRateFloor");
  });

  it("returns empty for insufficient data", () => {
    const patterns = detectPatterns([], []);
    expect(patterns).toEqual([]);
  });

  it("returns empty when no pattern reaches 3 occurrences", () => {
    const metrics = [
      { timestamp: "2026-05-20T10:00:00Z", fp_rate: 35, agent_success_rate: 60 },
      { timestamp: "2026-05-21T10:00:00Z", fp_rate: 10, agent_success_rate: 90 },
    ];
    const patterns = detectPatterns(metrics, []);
    const recurring = patterns.filter((p) => p.type === "recurring-high-fp");
    expect(recurring.length).toBe(0);
  });
});

describe("classifyRisk", () => {
  it("classifies gotcha additions as low risk", () => {
    expect(classifyRisk("gotcha")).toBe("low");
  });

  it("classifies threshold notes as low risk", () => {
    expect(classifyRisk("threshold-note")).toBe("low");
  });

  it("classifies skill changes as high risk", () => {
    expect(classifyRisk("skill-workflow")).toBe("high");
  });

  it("classifies CLAUDE.md policy changes as high risk", () => {
    expect(classifyRisk("policy")).toBe("high");
  });
});

describe("formatGotchaEntry", () => {
  it("formats a gotcha with title and description", () => {
    const entry = formatGotchaEntry(
      "FP rate stays high",
      "Threshold loosening 3x in a row suggests detection rules are too aggressive, not thresholds"
    );
    expect(entry).toContain("FP rate stays high");
    expect(entry).toContain("detection rules");
    expect(entry.startsWith("- **")).toBe(true);
  });
});

describe("logInstructionChange", () => {
  it("appends to instruction-changes.jsonl", () => {
    const dir = makeTmpDir();
    const logPath = join(dir, "instruction-changes.jsonl");

    logInstructionChange(logPath, {
      file: ".claude/rules/gotchas.md",
      changeType: "append",
      pattern: "recurring-high-fp",
      evidence: "FP rate > 30% for 3 consecutive runs",
    });

    const content = readFileSync(logPath, "utf-8").trim();
    const entry = JSON.parse(content);
    expect(entry.file).toBe(".claude/rules/gotchas.md");
    expect(entry.changeType).toBe("append");
    expect(entry.date).toBeTruthy();
    rmSync(dir, { recursive: true });
  });
});

describe("loadJsonl", () => {
  it("returns empty array for nonexistent file", () => {
    expect(loadJsonl("/nonexistent/file.jsonl")).toEqual([]);
  });

  it("parses valid JSONL", () => {
    const dir = makeTmpDir();
    const path = join(dir, "test.jsonl");
    writeFileSync(path, '{"a":1}\n{"b":2}\n');
    const result = loadJsonl(path);
    expect(result.length).toBe(2);
    expect(result[0].a).toBe(1);
    rmSync(dir, { recursive: true });
  });

  it("skips malformed lines", () => {
    const dir = makeTmpDir();
    const path = join(dir, "test.jsonl");
    writeFileSync(path, '{"a":1}\nnot json\n{"b":2}\n');
    const result = loadJsonl(path);
    expect(result.length).toBe(2);
    rmSync(dir, { recursive: true });
  });
});
