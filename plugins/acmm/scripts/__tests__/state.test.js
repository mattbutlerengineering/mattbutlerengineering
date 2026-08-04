/**
 * Tests for state.js's saveState() — specifically that the written
 * .claude/acmm/state.json is prettier-formatted, matching the repo's
 * `check:prettier` gate (see issue #3801).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prettier from "prettier";

import { saveState, loadState, STATE_PATH } from "../state.js";

function tmpDir() {
  const root = mkdtempSync(join(tmpdir(), "acmm-state-"));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("saveState: writes output matching prettier.format exactly", async () => {
  const fx = tmpDir();
  // A short array field: plain `JSON.stringify(state, null, 2)` leaves this
  // multi-line, but prettier's default JSON printer collapses it onto one
  // line — the exact drift class that broke PR #3800's `check:prettier`.
  const state = {
    lastRun: "2026-08-04T00:00:00.000Z",
    currentLevel: 3,
    checks: {},
    history: [],
    issuesCreated: {},
    behavioral: {
      flake: {
        rate_30d: 0,
        sample_size: 2,
        flaky_shas: ["abc123", "def456"],
        measured_at: "2026-08-04T00:00:00.000Z",
      },
    },
  };

  await saveState(fx.root, state);

  const written = readFileSync(join(fx.root, STATE_PATH), "utf-8");
  const config = await prettier.resolveConfig(join(fx.root, STATE_PATH));
  const expected = await prettier.format(written, { parser: "json", ...config });

  assert.equal(written, expected);
  fx.cleanup();
});

test("saveState: round-trips through loadState", async () => {
  const fx = tmpDir();
  const state = {
    lastRun: "2026-08-04T00:00:00.000Z",
    currentLevel: 5,
    checks: { "acmm:claude-md": { passed: true, evidence: "found" } },
    history: [],
    issuesCreated: {},
  };

  await saveState(fx.root, state);
  const loaded = loadState(fx.root);

  assert.equal(loaded.lastRun, state.lastRun);
  assert.equal(loaded.currentLevel, state.currentLevel);
  fx.cleanup();
});
