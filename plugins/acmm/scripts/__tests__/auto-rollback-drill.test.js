/**
 * Tests for the auto-rollback drill mechanism.
 *
 * Verifies:
 * 1. The workflow YAML has a workflow_dispatch trigger with a `drill` boolean input
 * 2. The drill job exists in the workflow
 * 3. A drill run (conclusion=success, triggered by workflow_dispatch) is treated as
 *    a valid "active" run by ACMM detection
 * 4. The workflow has a schedule trigger so the ACMM criterion stays active without
 *    requiring manual dispatch or a real regression
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { detect, isWorkflowActive } from "../detection.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-drill-"));
  return {
    root,
    file(rel, body = "") {
      const p = join(root, rel);
      mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
      writeFileSync(p, body);
    },
    dir(rel) {
      mkdirSync(join(root, rel), { recursive: true });
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

// Path to the actual workflow file in the repo
const REPO_ROOT = join(import.meta.url.replace("file://", ""), "../../../../..");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/auto-rollback.yml");

// ── workflow structure tests ──────────────────────────────────────────────────

test("auto-rollback.yml: workflow_dispatch trigger exists", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(content.includes("workflow_dispatch:"), "workflow_dispatch trigger must exist");
});

test("auto-rollback.yml: workflow_dispatch has drill boolean input", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(content.includes("drill:"), "workflow_dispatch must have a 'drill' input");
  assert.ok(content.includes("type: boolean"), "drill input must be boolean type");
});

test("auto-rollback.yml: drill job exists", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(
    content.includes("rollback-drill:") || content.includes("drill:"),
    "a drill job must exist in the workflow"
  );
});

test("auto-rollback.yml: drill job outputs DRILL PASSED", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(content.includes("DRILL PASSED"), "drill job must emit 'DRILL PASSED' output");
});

test("auto-rollback.yml: drill job creates and deletes a temporary branch", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(
    content.includes("drill/") || content.includes("drill-"),
    "drill job must create a temporary drill branch"
  );
  assert.ok(
    content.includes("git push --delete") || content.includes("git push origin --delete"),
    "drill job must delete the temporary branch after verification"
  );
});

// ── detection integration tests ───────────────────────────────────────────────

test("detect: active type — drill run (success from workflow_dispatch) counts as valid run", () => {
  const fx = fixture();
  fx.dir(".github/workflows");
  fx.file(".github/workflows/auto-rollback.yml", "on: workflow_dispatch");

  const criterion = {
    id: "acmm:auto-rollback",
    detection: {
      type: "active",
      pattern: ".github/workflows/auto-rollback.yml",
      maxAgeDays: 365,
    },
  };

  // A drill run triggered by workflow_dispatch with conclusion=success
  const drillRunOutput = JSON.stringify([
    {
      conclusion: "success",
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  const mockExecFileSync = () => drillRunOutput;
  assert.equal(
    detect(fx.root, criterion, { execFileSyncFn: mockExecFileSync }),
    true,
    "a successful drill run should satisfy active detection"
  );
  fx.cleanup();
});

test("isWorkflowActive: drill run within window counts as active", () => {
  const fx = fixture();
  const drillRunOutput = JSON.stringify([
    {
      conclusion: "success",
      updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  const mockExecFileSync = () => drillRunOutput;
  const result = isWorkflowActive(fx.root, "auto-rollback.yml", 365, {
    execFileSyncFn: mockExecFileSync,
  });

  assert.equal(result.active, true);
  assert.equal(result.conclusion, "success");
  fx.cleanup();
});

test("isWorkflowActive: skipped runs do NOT count as active", () => {
  const fx = fixture();
  const skippedRunOutput = JSON.stringify([
    {
      conclusion: "skipped",
      updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]);

  const mockExecFileSync = () => skippedRunOutput;
  const result = isWorkflowActive(fx.root, "auto-rollback.yml", 365, {
    execFileSyncFn: mockExecFileSync,
  });

  assert.equal(result.active, false);
  assert.ok(
    result.reason.includes("no successful runs"),
    `expected reason about no successful runs, got: ${result.reason}`
  );
  fx.cleanup();
});

test("auto-rollback.yml: schedule trigger exists for periodic drill runs", () => {
  const content = readFileSync(WORKFLOW_PATH, "utf-8");
  assert.ok(
    content.includes("schedule:"),
    "workflow must have a schedule trigger to keep ACMM criterion active without manual dispatch"
  );
  assert.ok(content.includes("cron:"), "schedule trigger must use cron expression");
});
