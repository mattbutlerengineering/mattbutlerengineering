import { test, expect, describe, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("check-ai-antipatterns", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-antipatterns-"));
    // Create a src directory by default
    fs.mkdirSync(path.join(tmpDir, "src"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── scanForPattern ──────────────────────────────────────────────────────────

  describe("scanForPattern", () => {
    test("detects magic numbers in setTimeout", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "setTimeout(fn, 3000);\n");
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "magicTimeouts");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("does not flag named constant timeouts", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        "const DELAY = 3000;\nsetTimeout(fn, DELAY);\n"
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "magicTimeouts");
      expect(count).toBe(0);
    });

    test("detects empty catch blocks", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        "try { doSomething(); } catch (e) {}\n"
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "emptyCatch");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("does not flag non-empty catch blocks", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        "try { doSomething(); } catch (e) { console.error(e); }\n"
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "emptyCatch");
      expect(count).toBe(0);
    });

    test("detects any type casts", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "index.ts"), "const x = value as any;\n");
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "anyType");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("detects console.log in production code (non-test files)", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "service.ts"), 'console.log("debug info");\n');
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "consoleLogs");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("does not flag console.log in test files", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "service.test.ts"), 'console.log("debug info");\n');
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "consoleLogs");
      expect(count).toBe(0);
    });

    test("detects hardcoded API route strings", async () => {
      fs.writeFileSync(path.join(tmpDir, "src", "client.ts"), 'fetch("/api/v1/users");\n');
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "hardcodedRoutes");
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("does not flag a node:test file whose blocks assert via assert.equal()", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "add.test.js"),
        [
          'import { test } from "node:test";',
          'import assert from "node:assert/strict";',
          'test("adds numbers", () => {',
          "  assert.equal(1 + 1, 2);",
          "});",
          "",
        ].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "noopTestAssertions");
      expect(count).toBe(0);
    });

    test("flags a test block with neither expect() nor any assertion", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "widget.test.tsx"),
        ['test("renders without crashing", () => {', "  render(<Widget />);", "});", ""].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "noopTestAssertions");
      expect(count).toBe(1);
    });

    test("skips node_modules, dist, and generated directories", async () => {
      fs.mkdirSync(path.join(tmpDir, "node_modules", "pkg"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "node_modules", "pkg", "index.ts"),
        "setTimeout(fn, 3000);\n"
      );
      fs.mkdirSync(path.join(tmpDir, "dist"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "dist", "index.js"), "setTimeout(fn, 3000);\n");
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      const count = scanForPattern(tmpDir, "magicTimeouts");
      expect(count).toBe(0);
    });
  });

  // ── blockHasAssertion ──────────────────────────────────────────────────────
  // Pure fixture-string tests for the classification noopTestAssertions relies
  // on — no filesystem, no shelling out to the whole check (issue #4197).

  describe("blockHasAssertion", () => {
    test("recognizes vitest expect()", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      expect(blockHasAssertion('"does a thing", () => { expect(1).toBe(1); }')).toBe(true);
    });

    test("recognizes a node:test block using assert.equal(...)", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      const block = '"adds numbers", () => { assert.equal(1 + 1, 2); }';
      expect(blockHasAssertion(block)).toBe(true);
    });

    test("recognizes bare assert(...)", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      expect(blockHasAssertion('"truthy check", () => { assert(result); }')).toBe(true);
    });

    test("recognizes the node:test TestContext form t.assert.ok(...)", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      const block = '"context assert", (t) => { t.assert.ok(result); }';
      expect(blockHasAssertion(block)).toBe(true);
    });

    test("does not recognize a block with neither expect() nor any assertion", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      const block = '"renders without crashing", () => { render(<Widget />); }';
      expect(blockHasAssertion(block)).toBe(false);
    });

    test("does not recognize a custom throw-based helper (documented limitation)", async () => {
      const { blockHasAssertion } = await import("../check-ai-antipatterns.mjs");
      const block = '"schemas match", () => { assertKeysMatch("User", zodKeys, jsonKeys); }';
      expect(blockHasAssertion(block)).toBe(false);
    });
  });

  // ── scanAll ─────────────────────────────────────────────────────────────────

  describe("scanAll", () => {
    test("returns counts for all patterns", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "index.ts"),
        ["setTimeout(fn, 3000);", "try { x(); } catch (e) {}", "const y = val as any;"].join("\n") +
          "\n"
      );
      const { scanAll } = await import("../check-ai-antipatterns.mjs");
      const counts = scanAll(tmpDir);
      expect(counts).toHaveProperty("magicTimeouts");
      expect(counts).toHaveProperty("emptyCatch");
      expect(counts).toHaveProperty("anyType");
      expect(counts.magicTimeouts).toBeGreaterThanOrEqual(1);
      expect(counts.emptyCatch).toBeGreaterThanOrEqual(1);
      expect(counts.anyType).toBeGreaterThanOrEqual(1);
    });
  });

  // ── compareWithBaseline ──────────────────────────────────────────────────────
  // Adapter-specific assertions only — compareWithBaseline delegates to the
  // shared `lib/ratchet.mjs` compare() core, whose comparator edge cases
  // (thresholds, direction, missing-baseline handling) are covered in
  // ratchet.test.mjs. These confirm the pattern→baseline.count extraction
  // and the { pattern, current, baseline } shape this file's CLI relies on.

  describe("compareWithBaseline", () => {
    test("returns no regressions when counts match or decreased vs baseline", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const baseline = { patterns: { magicTimeouts: { count: 5 }, emptyCatch: { count: 2 } } };

      expect(compareWithBaseline({ magicTimeouts: 5, emptyCatch: 2 }, baseline).passed).toBe(true);
      expect(compareWithBaseline({ magicTimeouts: 3, emptyCatch: 1 }, baseline).passed).toBe(true);
    });

    test("detects a regression when count increased, mapped to pattern/current/baseline", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { magicTimeouts: 8, emptyCatch: 2 };
      const baseline = { patterns: { magicTimeouts: { count: 5 }, emptyCatch: { count: 2 } } };

      const result = compareWithBaseline(current, baseline);
      expect(result.passed).toBe(false);
      expect(result.regressions).toEqual([{ pattern: "magicTimeouts", current: 8, baseline: 5 }]);
    });

    test("treats a pattern absent from the baseline as a baseline count of 0", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const baseline = { patterns: {} };

      expect(compareWithBaseline({ newPattern: 3 }, baseline).passed).toBe(false);
      expect(compareWithBaseline({ newPattern: 0 }, baseline).passed).toBe(true);
    });
  });

  // ── buildBaseline ────────────────────────────────────────────────────────────

  describe("buildBaseline", () => {
    test("builds baseline with descriptions for all patterns", async () => {
      const { buildBaseline } = await import("../check-ai-antipatterns.mjs");
      const counts = { magicTimeouts: 5, emptyCatch: 2 };
      const result = buildBaseline(counts);
      expect(result).toHaveProperty("generatedAt");
      expect(result).toHaveProperty("patterns");
      expect(result.patterns.magicTimeouts).toMatchObject({
        count: 5,
        description: expect.any(String),
      });
      expect(result.patterns.emptyCatch).toMatchObject({
        count: 2,
        description: expect.any(String),
      });
    });
  });
});
