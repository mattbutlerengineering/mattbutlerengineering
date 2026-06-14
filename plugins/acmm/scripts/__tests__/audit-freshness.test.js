/**
 * Tests for the audit-freshness criterion.
 *
 * The criterion checks that the state file (.claude/acmm/state.json) is no
 * older than 7 days. It uses an injectable `now` seam for deterministic tests.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkAuditFreshness, AUDIT_FRESHNESS_CRITERION } from "../audit-freshness.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "acmm-freshness-"));
  const stateDir = join(root, ".claude", "acmm");
  mkdirSync(stateDir, { recursive: true });
  return {
    root,
    writeState(lastRun) {
      writeFileSync(
        join(stateDir, "state.json"),
        JSON.stringify({ lastRun, currentLevel: 6, checks: {}, history: [], issuesCreated: {} }),
        "utf-8"
      );
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

const NOW = new Date("2026-06-14T12:00:00.000Z");
const FRESH = new Date("2026-06-10T12:00:00.000Z").toISOString(); // 4 days ago
const EXACTLY_7_DAYS = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
const STALE = new Date("2026-05-27T12:00:00.000Z").toISOString(); // 18 days ago

// ── checkAuditFreshness ──────────────────────────────────────────────────────

test("checkAuditFreshness: state file 4 days old → passes", () => {
  const fx = fixture();
  fx.writeState(FRESH);
  const result = checkAuditFreshness(fx.root, { now: NOW });
  assert.equal(result.passed, true);
  assert.ok(result.evidence, "evidence should be non-empty");
  fx.cleanup();
});

test("checkAuditFreshness: state file exactly 7 days old → passes (boundary inclusive)", () => {
  const fx = fixture();
  fx.writeState(EXACTLY_7_DAYS);
  const result = checkAuditFreshness(fx.root, { now: NOW });
  assert.equal(result.passed, true);
  fx.cleanup();
});

test("checkAuditFreshness: state file 18 days old → fails", () => {
  const fx = fixture();
  fx.writeState(STALE);
  const result = checkAuditFreshness(fx.root, { now: NOW });
  assert.equal(result.passed, false);
  assert.ok(
    result.evidence.includes("18") || result.evidence.includes("day"),
    "evidence should mention age"
  );
  fx.cleanup();
});

test("checkAuditFreshness: no state file → fails", () => {
  const fx = fixture();
  // Don't write state file
  const result = checkAuditFreshness(fx.root, { now: NOW });
  assert.equal(result.passed, false);
  assert.ok(result.evidence, "evidence should explain why it failed");
  fx.cleanup();
});

test("checkAuditFreshness: empty lastRun → fails", () => {
  const fx = fixture();
  fx.writeState("");
  const result = checkAuditFreshness(fx.root, { now: NOW });
  assert.equal(result.passed, false);
  assert.ok(result.evidence, "evidence should explain why it failed");
  fx.cleanup();
});

test("checkAuditFreshness: uses default now when not injected", () => {
  const fx = fixture();
  // Write a timestamp from 1 day ago (should be fresh)
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
  fx.writeState(oneDayAgo);
  const result = checkAuditFreshness(fx.root);
  assert.equal(result.passed, true, "1-day-old state should pass freshness check");
  fx.cleanup();
});

// ── AUDIT_FRESHNESS_CRITERION shape ─────────────────────────────────────────

test("AUDIT_FRESHNESS_CRITERION: has required criterion fields", () => {
  assert.ok(typeof AUDIT_FRESHNESS_CRITERION.id === "string", "should have id");
  assert.ok(typeof AUDIT_FRESHNESS_CRITERION.name === "string", "should have name");
  assert.ok(typeof AUDIT_FRESHNESS_CRITERION.description === "string", "should have description");
  assert.ok(typeof AUDIT_FRESHNESS_CRITERION.check === "function", "should have check function");
  assert.ok(AUDIT_FRESHNESS_CRITERION.detection, "should have detection");
});

test("AUDIT_FRESHNESS_CRITERION: check function is checkAuditFreshness", () => {
  assert.equal(AUDIT_FRESHNESS_CRITERION.check, checkAuditFreshness);
});

test("AUDIT_FRESHNESS_CRITERION: detection type is active", () => {
  assert.equal(AUDIT_FRESHNESS_CRITERION.detection.type, "active");
});
