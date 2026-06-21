/**
 * Hook seam test for the antipattern ratchet pre-push gate.
 *
 * Verifies that `node scripts/check-ai-antipatterns.mjs` exits non-zero when
 * a ratchet increase is detected, and exits 0 when the count is at/under
 * baseline — matching the behaviour wired into .husky/pre-push.
 *
 * Uses a temp directory with a fixture baseline so the real codebase baseline
 * is never mutated.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = resolve(
  fileURLToPath(import.meta.url),
  "..",
  "..",
  "check-ai-antipatterns.mjs"
);

function makeBaseline(patterns) {
  return {
    generatedAt: new Date().toISOString(),
    patterns: Object.fromEntries(
      Object.entries(patterns).map(([k, count]) => [k, { count, description: k }])
    ),
  };
}

describe("antipattern ratchet pre-push gate (hook seam)", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "antipattern-hook-test-"));
    // Create a src dir with no antipatterns so all scanned counts are 0
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "metrics"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), "export const x = 1;\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it("exits 0 when current counts are at or under baseline", () => {
    // Baseline counts of 0 match the empty src/ scan — no regression
    const baseline = makeBaseline({
      magicTimeouts: 0,
      emptyCatch: 0,
      noopTestAssertions: 0,
      hardcodedRoutes: 0,
      anyType: 0,
      consoleLogs: 0,
      unusedParams: 0,
      mockShapeMismatch: 0,
    });
    writeFileSync(join(dir, "metrics", "ai-antipattern-baselines.json"), JSON.stringify(baseline));

    const result = spawnSync("node", [SCRIPT_PATH], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
  });

  it("exits non-zero when a pattern count increased above baseline", () => {
    // Baseline claims 0 anyType, but src/ has one `as any` cast → regression
    writeFileSync(join(dir, "src", "index.ts"), "const x = val as any;\n");

    const baseline = makeBaseline({
      magicTimeouts: 0,
      emptyCatch: 0,
      noopTestAssertions: 0,
      hardcodedRoutes: 0,
      anyType: 0, // baseline says 0, scan will find 1 → ratchet triggers
      consoleLogs: 0,
      unusedParams: 0,
      mockShapeMismatch: 0,
    });
    writeFileSync(join(dir, "metrics", "ai-antipattern-baselines.json"), JSON.stringify(baseline));

    const result = spawnSync("node", [SCRIPT_PATH], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 15000,
    });

    expect(result.status).not.toBe(0);
  });

  it("exits 0 when counts decreased below baseline (improvement allowed)", () => {
    // Baseline says 5 anyType but src has 0 — improvement, not regression
    const baseline = makeBaseline({
      magicTimeouts: 0,
      emptyCatch: 0,
      noopTestAssertions: 0,
      hardcodedRoutes: 0,
      anyType: 5,
      consoleLogs: 0,
      unusedParams: 0,
      mockShapeMismatch: 0,
    });
    writeFileSync(join(dir, "metrics", "ai-antipattern-baselines.json"), JSON.stringify(baseline));

    const result = spawnSync("node", [SCRIPT_PATH], {
      cwd: dir,
      encoding: "utf-8",
      timeout: 15000,
    });

    expect(result.status).toBe(0);
  });
});
