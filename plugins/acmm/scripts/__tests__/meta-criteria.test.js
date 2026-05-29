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
  checkProductImprovements,
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

// Helpers for making call-sequence-aware mocks (issue call first, pr call second)
function makeSequenceMock(...responses) {
  let call = 0;
  return () => {
    const r = responses[call] ?? responses[responses.length - 1];
    call++;
    return typeof r === "function" ? r() : r;
  };
}

describe("checkProductImprovements", () => {
  test("passes when gh returns 1 closed improvement-labeled issue within 30 days", () => {
    const dir = makeTmpDir();
    const recentClosedAt = new Date().toISOString();
    // issue call → 1 recent item; pr call → empty
    const fakeExecFileSync = makeSequenceMock(
      JSON.stringify([{ number: 42, closedAt: recentClosedAt }]),
      JSON.stringify([])
    );
    const result = checkProductImprovements(dir, { execFileSyncFn: fakeExecFileSync });
    assert.equal(result.passed, true);
    assert.ok(
      result.evidence.includes("1"),
      `evidence should mention count, got: ${result.evidence}`
    );
    rmSync(dir, { recursive: true });
  });

  test("fails when no improvement-labeled issues or PRs found", () => {
    const dir = makeTmpDir();
    const fakeExecFileSync = makeSequenceMock(JSON.stringify([]), JSON.stringify([]));
    const result = checkProductImprovements(dir, { execFileSyncFn: fakeExecFileSync });
    assert.equal(result.passed, false);
    assert.ok(
      result.evidence.includes("no improvement-labeled"),
      `expected 'no improvement-labeled' in evidence, got: ${result.evidence}`
    );
    rmSync(dir, { recursive: true });
  });

  test("fails when all closed issues are older than 30 days", () => {
    const dir = makeTmpDir();
    const oldClosedAt = "2020-01-01T00:00:00Z";
    // both issue and pr queries return stale items
    const fakeExecFileSync = makeSequenceMock(
      JSON.stringify([{ number: 1, closedAt: oldClosedAt }]),
      JSON.stringify([{ number: 2, closedAt: oldClosedAt }])
    );
    const result = checkProductImprovements(dir, { execFileSyncFn: fakeExecFileSync });
    assert.equal(result.passed, false);
    assert.ok(
      result.evidence.includes("none in last 30 days"),
      `expected 'none in last 30 days' in evidence, got: ${result.evidence}`
    );
    rmSync(dir, { recursive: true });
  });

  test("gracefully degrades when gh CLI is unavailable", () => {
    const dir = makeTmpDir();
    const fakeExecFileSync = () => {
      throw new Error("gh: command not found");
    };
    const result = checkProductImprovements(dir, { execFileSyncFn: fakeExecFileSync });
    assert.equal(result.passed, false);
    assert.ok(
      result.evidence.includes("gh CLI unavailable") || result.evidence.includes("unavailable"),
      `expected degraded evidence, got: ${result.evidence}`
    );
    rmSync(dir, { recursive: true });
  });

  test("passes when multiple improvement PRs closed recently (issue empty, pr has 3)", () => {
    const dir = makeTmpDir();
    const recentClosedAt = new Date().toISOString();
    // issue call → empty; pr call → 3 recent items
    const fakeExecFileSync = makeSequenceMock(
      JSON.stringify([]),
      JSON.stringify([
        { number: 1, closedAt: recentClosedAt },
        { number: 2, closedAt: recentClosedAt },
        { number: 3, closedAt: recentClosedAt },
      ])
    );
    const result = checkProductImprovements(dir, { execFileSyncFn: fakeExecFileSync });
    assert.equal(result.passed, true);
    assert.ok(
      result.evidence.includes("3"),
      `evidence should mention count of 3, got: ${result.evidence}`
    );
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

  test("meta:product-improvements criterion has a check function", () => {
    const criterion = META_CRITERIA.find((c) => c.id === "meta:product-improvements");
    assert.ok(criterion, "meta:product-improvements criterion should exist");
    assert.equal(typeof criterion.check, "function", "check should be a function");
  });
});
