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

describe("checkProductImprovements", () => {
  test("passes when improvement-activity.jsonl has recent closed issue", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "improvement-activity.jsonl"),
      `{"number":100,"title":"Fix login flow","closedAt":"${new Date().toISOString()}","url":"https://github.com/x/y/issues/100","type":"issue"}\n`
    );
    const result = checkProductImprovements(dir);
    assert.equal(result.passed, true);
    assert.ok(
      result.evidence.includes("1 improvement"),
      `expected count in evidence, got: ${result.evidence}`
    );
    rmSync(dir, { recursive: true });
  });

  test("passes when file has recent merged PR entry", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "improvement-activity.jsonl"),
      `{"number":200,"title":"Add activity audit","mergedAt":"${new Date().toISOString()}","url":"https://github.com/x/y/pull/200","type":"pr"}\n`
    );
    const result = checkProductImprovements(dir);
    assert.equal(result.passed, true);
    rmSync(dir, { recursive: true });
  });

  test("fails when file exists but all entries are stale (>30 days)", () => {
    const dir = makeTmpDir();
    const metricsDir = join(dir, "metrics");
    mkdirSync(metricsDir, { recursive: true });
    writeFileSync(
      join(metricsDir, "improvement-activity.jsonl"),
      `{"number":50,"title":"Old fix","closedAt":"${staleDate}","url":"https://github.com/x/y/issues/50","type":"issue"}\n`
    );
    const result = checkProductImprovements(dir);
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("falls back to gh CLI when metrics file absent — passes when gh returns recent items", () => {
    const dir = makeTmpDir();
    const recentTs = new Date().toISOString();
    const mockExecFileSync = (_cmd, args) => {
      if (args.includes("issue")) {
        return JSON.stringify([
          {
            number: 10,
            title: "Improve onboarding",
            closedAt: recentTs,
            url: "https://g/issues/10",
          },
        ]);
      }
      return JSON.stringify([]);
    };
    const result = checkProductImprovements(dir, { execFileSyncFn: mockExecFileSync });
    assert.equal(result.passed, true);
    assert.ok(result.evidence.includes("1 improvement"), `evidence: ${result.evidence}`);
    rmSync(dir, { recursive: true });
  });

  test("falls back to gh CLI — fails when all items are stale", () => {
    const dir = makeTmpDir();
    const oldTs = "2024-01-15T00:00:00Z";
    const mockExecFileSync = (_cmd, args) => {
      if (args.includes("issue")) {
        return JSON.stringify([
          { number: 10, title: "Old improvement", closedAt: oldTs, url: "https://g/issues/10" },
        ]);
      }
      return JSON.stringify([]);
    };
    const result = checkProductImprovements(dir, { execFileSyncFn: mockExecFileSync });
    assert.equal(result.passed, false);
    assert.ok(result.evidence.includes("none closed"), `evidence: ${result.evidence}`);
    rmSync(dir, { recursive: true });
  });

  test("falls back to gh CLI — fails when gh returns no items", () => {
    const dir = makeTmpDir();
    const mockExecFileSync = () => JSON.stringify([]);
    const result = checkProductImprovements(dir, { execFileSyncFn: mockExecFileSync });
    assert.equal(result.passed, false);
    rmSync(dir, { recursive: true });
  });

  test("falls back to gh CLI — fails gracefully when gh unavailable", () => {
    const dir = makeTmpDir();
    const mockExecFileSync = () => {
      throw new Error("gh not found");
    };
    const result = checkProductImprovements(dir, { execFileSyncFn: mockExecFileSync });
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

  test("meta:product-improvements has a non-null check function", () => {
    const criterion = META_CRITERIA.find((c) => c.id === "meta:product-improvements");
    assert.ok(criterion, "meta:product-improvements criterion must exist");
    assert.equal(typeof criterion.check, "function", "check must be a function, not null");
  });

  test("meta:product-improvements detection uses file-based pattern", () => {
    const criterion = META_CRITERIA.find((c) => c.id === "meta:product-improvements");
    assert.ok(
      typeof criterion.detection.pattern === "string" &&
        criterion.detection.pattern.includes("improvement"),
      `detection.pattern should reference improvement metrics, got: ${criterion.detection.pattern}`
    );
  });
});
