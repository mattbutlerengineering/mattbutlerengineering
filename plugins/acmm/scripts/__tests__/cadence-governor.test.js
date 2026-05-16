import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  determineMode,
  shouldExecute,
  loadState,
  saveState,
  buildNextState,
  buildFallbackState,
} from "../cadence-governor.js";

// ── determineMode ───────────────────────────────────────────────

test("determineMode: >10 ready → SURGE", () => {
  assert.equal(determineMode(11), "SURGE");
  assert.equal(determineMode(50), "SURGE");
});

test("determineMode: 5-10 ready → BUSY", () => {
  assert.equal(determineMode(5), "BUSY");
  assert.equal(determineMode(10), "BUSY");
});

test("determineMode: 2-4 ready → QUIET", () => {
  assert.equal(determineMode(2), "QUIET");
  assert.equal(determineMode(4), "QUIET");
});

test("determineMode: 0-1 ready → IDLE", () => {
  assert.equal(determineMode(0), "IDLE");
  assert.equal(determineMode(1), "IDLE");
});

// ── shouldExecute ───────────────────────────────────────────────

test("shouldExecute: SURGE always executes", () => {
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min ago
  assert.equal(shouldExecute("SURGE", recent), true);
  assert.equal(shouldExecute("SURGE", null), true);
});

test("shouldExecute: BUSY always executes", () => {
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("BUSY", recent), true);
  assert.equal(shouldExecute("BUSY", null), true);
});

test("shouldExecute: QUIET skips if last execution < 60 min ago", () => {
  const now = Date.now();
  const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("QUIET", thirtyMinAgo, now), false);
});

test("shouldExecute: QUIET executes if last execution >= 60 min ago", () => {
  const now = Date.now();
  const ninetyMinAgo = new Date(now - 90 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("QUIET", ninetyMinAgo, now), true);
});

test("shouldExecute: QUIET executes if last execution exactly 60 min ago", () => {
  const now = Date.now();
  const sixtyMinAgo = new Date(now - 60 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("QUIET", sixtyMinAgo, now), true);
});

test("shouldExecute: IDLE never executes", () => {
  assert.equal(shouldExecute("IDLE", null), false);
  const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("IDLE", recent), false);
  const ancient = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(shouldExecute("IDLE", ancient), false);
});

test("shouldExecute: null lastExecution → executes (for non-IDLE modes)", () => {
  assert.equal(shouldExecute("SURGE", null), true);
  assert.equal(shouldExecute("BUSY", null), true);
  assert.equal(shouldExecute("QUIET", null), true);
});

test("shouldExecute: unknown mode → defaults to execute", () => {
  assert.equal(shouldExecute("UNKNOWN", null), true);
});

// ── loadState / saveState ───────────────────────────────────────

function tmpDir() {
  const root = mkdtempSync(join(tmpdir(), "acmm-governor-"));
  return {
    root,
    statePath: join(root, ".claude", "governor-state.json"),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("loadState: missing file → default state", () => {
  const fx = tmpDir();
  const state = loadState(fx.statePath);
  assert.equal(state.mode, null);
  assert.equal(state.readyCount, 0);
  assert.deepEqual(state.history, []);
  assert.equal(state.shouldExecute, true);
  fx.cleanup();
});

test("saveState: creates directories and writes valid JSON", () => {
  const fx = tmpDir();
  const state = { mode: "BUSY", readyCount: 7, history: [] };
  saveState(state, fx.statePath);
  const raw = readFileSync(fx.statePath, "utf-8");
  const parsed = JSON.parse(raw);
  assert.equal(parsed.mode, "BUSY");
  assert.equal(parsed.readyCount, 7);
  fx.cleanup();
});

test("loadState: round-trips with saveState", () => {
  const fx = tmpDir();
  const original = {
    mode: "QUIET",
    readyCount: 3,
    lastCheck: "2026-05-02T17:00:00.000Z",
    lastExecution: "2026-05-02T15:00:00.000Z",
    shouldExecute: true,
    history: [
      {
        date: "2026-05-02T17:00:00.000Z",
        mode: "QUIET",
        readyCount: 3,
        executed: true,
      },
    ],
  };
  saveState(original, fx.statePath);
  const loaded = loadState(fx.statePath);
  assert.deepEqual(loaded, original);
  fx.cleanup();
});

// ── buildNextState ──────────────────────────────────────────────

test("buildNextState: computes mode and shouldExecute correctly", () => {
  const now = Date.parse("2026-05-02T18:00:00.000Z");
  const previousState = {
    mode: null,
    readyCount: 0,
    lastCheck: null,
    lastExecution: null,
    shouldExecute: true,
    history: [],
  };

  const result = buildNextState({ readyCount: 7, previousState, now });
  assert.equal(result.mode, "BUSY");
  assert.equal(result.shouldExecute, true);
  assert.equal(result.readyCount, 7);
  assert.equal(result.lastCheck, "2026-05-02T18:00:00.000Z");
  assert.equal(result.lastExecution, null);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].mode, "BUSY");
  assert.equal(result.history[0].executed, true);
});

test("buildNextState: QUIET with recent execution → skip", () => {
  const now = Date.parse("2026-05-02T18:00:00.000Z");
  const previousState = {
    mode: "QUIET",
    readyCount: 3,
    lastCheck: "2026-05-02T17:30:00.000Z",
    lastExecution: "2026-05-02T17:30:00.000Z", // 30 min ago
    shouldExecute: true,
    history: [],
  };

  const result = buildNextState({ readyCount: 3, previousState, now });
  assert.equal(result.mode, "QUIET");
  assert.equal(result.shouldExecute, false);
});

test("buildNextState: caps history at MAX_HISTORY (100)", () => {
  const now = Date.parse("2026-05-02T18:00:00.000Z");
  const longHistory = Array.from({ length: 150 }, (_, i) => ({
    date: new Date(now - (150 - i) * 60 * 1000).toISOString(),
    mode: "BUSY",
    readyCount: 7,
    executed: true,
  }));
  const previousState = {
    mode: "BUSY",
    readyCount: 7,
    lastCheck: null,
    lastExecution: null,
    shouldExecute: true,
    history: longHistory,
  };

  const result = buildNextState({ readyCount: 7, previousState, now });
  assert.equal(result.history.length, 100);
});

// ── buildFallbackState ──────────────────────────────────────────

test("buildFallbackState: writes history entry with gh-unavailable reason", () => {
  const now = Date.parse("2026-05-16T10:00:00.000Z");
  const previousState = {
    mode: "BUSY",
    readyCount: 5,
    lastCheck: "2026-05-16T09:00:00.000Z",
    lastExecution: "2026-05-16T09:00:00.000Z",
    shouldExecute: true,
    history: [],
  };

  const result = buildFallbackState(previousState, now);
  assert.equal(result.lastCheck, "2026-05-16T10:00:00.000Z");
  assert.equal(result.shouldExecute, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].reason, "gh-unavailable");
  assert.equal(result.history[0].readyCount, null);
  assert.equal(result.history[0].executed, true);
  assert.equal(result.history[0].mode, "BUSY");
});

test("buildFallbackState: mode defaults to UNKNOWN when no prior mode", () => {
  const now = Date.parse("2026-05-16T10:00:00.000Z");
  const previousState = {
    mode: null,
    readyCount: 0,
    lastCheck: null,
    lastExecution: null,
    shouldExecute: true,
    history: [],
  };

  const result = buildFallbackState(previousState, now);
  assert.equal(result.history[0].mode, "UNKNOWN");
});

test("buildFallbackState: preserves lastExecution, caps history at 100", () => {
  const now = Date.parse("2026-05-16T10:00:00.000Z");
  const longHistory = Array.from({ length: 150 }, (_, i) => ({
    date: new Date(now - (150 - i) * 60 * 1000).toISOString(),
    mode: "BUSY",
    readyCount: 5,
    executed: true,
  }));
  const previousState = {
    mode: "BUSY",
    readyCount: 5,
    lastCheck: null,
    lastExecution: "2026-05-16T08:00:00.000Z",
    shouldExecute: true,
    history: longHistory,
  };

  const result = buildFallbackState(previousState, now);
  assert.equal(result.history.length, 100);
  assert.equal(result.lastExecution, "2026-05-16T08:00:00.000Z");
});

test("buildNextState: IDLE → skip even with no prior execution", () => {
  const now = Date.parse("2026-05-02T18:00:00.000Z");
  const previousState = {
    mode: null,
    readyCount: 0,
    lastCheck: null,
    lastExecution: null,
    shouldExecute: true,
    history: [],
  };

  const result = buildNextState({ readyCount: 0, previousState, now });
  assert.equal(result.mode, "IDLE");
  assert.equal(result.shouldExecute, false);
});
