import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkThresholdTuning,
  checkInstructionEvolution,
  checkProcessMetrics,
  checkFpRate,
  META_CRITERIA,
} from "../meta-criteria.js";

function makeTmpDir() {
  return mkdtempSync(join(tmpdir(), "meta-test-"));
}

const recentDate = new Date().toISOString().split("T")[0];
const staleDate = "2024-01-01";

describe("checkThresholdTuning", () => {
  test("passes when threshold-changes.jsonl has recent entries", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "threshold-changes.jsonl"),
      `{"date":"${recentDate}","threshold":"acceptanceRateFloor","oldValue":0.85,"newValue":0.80}\n`
    );
    const result = checkThresholdTuning(dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when entries are stale (>30 days)", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "threshold-changes.jsonl"),
      `{"date":"${staleDate}","threshold":"acceptanceRateFloor"}\n`
    );
    const result = checkThresholdTuning(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when file missing", () => {
    const dir = makeTmpDir();
    const result = checkThresholdTuning(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("checkInstructionEvolution", () => {
  test("passes when instruction-changes.jsonl has recent entries", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "instruction-changes.jsonl"),
      `{"date":"${recentDate}","file":"gotchas.md","changeType":"append"}\n`
    );
    const result = checkInstructionEvolution(dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when file missing", () => {
    const dir = makeTmpDir();
    const result = checkInstructionEvolution(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("checkProcessMetrics", () => {
  test("passes when process-metrics.jsonl exists with recent entries", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "process-metrics.jsonl"),
      `{"timestamp":"${new Date().toISOString()}","fp_rate":15,"agent_success_rate":80}\n`
    );
    const result = checkProcessMetrics(dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when file exists but entries stale (>7 days)", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "process-metrics.jsonl"),
      `{"timestamp":"2024-01-01T00:00:00Z","fp_rate":15}\n`
    );
    const result = checkProcessMetrics(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when file missing", () => {
    const dir = makeTmpDir();
    const result = checkProcessMetrics(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("checkFpRate", () => {
  test("passes when latest FP rate < 30", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "process-metrics.jsonl"),
      `{"timestamp":"${new Date().toISOString()}","fp_rate":15}\n`
    );
    const result = checkFpRate(dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when latest FP rate >= 30", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "process-metrics.jsonl"),
      `{"timestamp":"${new Date().toISOString()}","fp_rate":35}\n`
    );
    const result = checkFpRate(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when FP rate is null", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "process-metrics.jsonl"),
      `{"timestamp":"${new Date().toISOString()}","fp_rate":null}\n`
    );
    const result = checkFpRate(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("fails when file missing", () => {
    const dir = makeTmpDir();
    const result = checkFpRate(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });
});

describe("META_CRITERIA", () => {
  test("exports 5 criteria", () => {
    assert.equal(META_CRITERIA.length, 5);
  });

  test("all criteria have required fields", () => {
    for (const c of META_CRITERIA) {
      assert.ok(c.id, `criterion missing id`);
      assert.ok(c.name, `${c.id} missing name`);
      assert.ok(c.description, `${c.id} missing description`);
      assert.equal(c.level, 6, `${c.id} should be level 6`);
      assert.ok(c.detection, `${c.id} missing detection`);
    }
  });
});
