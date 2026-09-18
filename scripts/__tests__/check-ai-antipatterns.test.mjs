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

  // ── splitTestBlocks ─────────────────────────────────────────────────────────
  // The other half of noopTestAssertions: which text counts as "one test
  // block" at all. A declaration this never splits on is structurally exempt
  // from the assertion check — it can never be flagged, however empty it is.
  // Pure fixture-string tests, same rationale as blockHasAssertion above.

  describe("splitTestBlocks", () => {
    test("splits on a plain it(...) declaration", async () => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      const src = ['it("a", () => {});', 'it("b", () => {});'].join("\n");
      expect(splitTestBlocks(src)).toHaveLength(2);
    });

    test("splits on it.each(table)(...) — the curried parameterized form", async () => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      const src = 'it.each([[1], [2]])("case %i", (n) => {});';
      expect(splitTestBlocks(src)).toHaveLength(1);
    });

    test("splits on the it.each`table` tagged-template form", async () => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      const src = ["it.each`", "  a", "  ${1}", '`("case $a", ({ a }) => {});'].join("\n");
      expect(splitTestBlocks(src)).toHaveLength(1);
    });

    test.each([
      ["it.skip", 'it.skip("a", () => {});'],
      ["it.only", 'it.only("a", () => {});'],
      ["it.todo", 'it.todo("a", () => {});'],
      ["it.fails", 'it.fails("a", () => {});'],
      ["it.concurrent", 'it.concurrent("a", () => {});'],
      ["it.sequential", 'it.sequential("a", () => {});'],
      ["it.for", 'it.for([1, 2])("a", (n) => {});'],
      ["test.skip", 'test.skip("a", () => {});'],
      ["test.only", 'test.only("a", () => {});'],
      ["test.concurrent", 'test.concurrent("a", () => {});'],
      ["chained it.skip.each", 'it.skip.each([[1]])("a", (n) => {});'],
    ])("splits on %s — a real test declaration", async (_label, src) => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      expect(splitTestBlocks(src)).toHaveLength(1);
    });

    test.each([
      ["describe", 'describe("group", () => {});'],
      ["test.describe", 'test.describe("group", () => {});'],
      ["describe.each", 'describe.each([[1]])("group", (n) => {});'],
      ["test.beforeEach", "test.beforeEach(async ({ page }) => {});"],
      ["test.afterAll", "test.afterAll(() => {});"],
      ["test.step", 'test.step("does a thing", () => {});'],
      ["test.use", 'test.use({ locale: "en" });'],
      ["test.setTimeout", "test.setTimeout(60000);"],
    ])("does not split on %s — a container, hook or config call", async (_label, src) => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      expect(splitTestBlocks(src)).toHaveLength(0);
    });

    test("does not split on a substring match such as submitTest(", async () => {
      const { splitTestBlocks } = await import("../check-ai-antipatterns.mjs");
      expect(splitTestBlocks('submitTest("a");\nawaitIt("b");')).toHaveLength(0);
    });
  });

  // ── noopTestAssertions: modifier blind spot (#5462) ──────────────────────────
  // Before this fix the block splitter matched only a bare `it(` / `test(`, so
  // every `it.each` / `it.skip` / `test.only` declaration in the repo (123 of
  // them) was structurally invisible to the ratchet: an assertion-free
  // parameterized test could be added and the count would not move.

  describe("noopTestAssertions — parameterized and modified declarations", () => {
    test("flags an it.each block that asserts nothing", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "each.test.js"),
        ['it.each([[1], [2]])("case %i", (n) => {', "  render(n);", "});", ""].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      expect(scanForPattern(tmpDir, "noopTestAssertions")).toBe(1);
    });

    test("does not flag an it.each block that does assert", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "each.test.js"),
        ['it.each([[1], [2]])("case %i", (n) => {', "  expect(n).toBeTruthy();", "});", ""].join(
          "\n"
        )
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      expect(scanForPattern(tmpDir, "noopTestAssertions")).toBe(0);
    });

    test("flags an assertion-free test.only block", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "only.test.js"),
        ['test.only("renders", () => {', "  render(<Widget />);", "});", ""].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      expect(scanForPattern(tmpDir, "noopTestAssertions")).toBe(1);
    });

    test("an assertion inside a following it.each no longer masks a bare it() above it", async () => {
      // The splitter's segments run to the NEXT declaration. While `it.each`
      // was not a split point, its body was absorbed into the preceding
      // segment, so its expect() made the assertion-free it() above read as
      // asserting.
      fs.writeFileSync(
        path.join(tmpDir, "src", "mask.test.js"),
        [
          'it("renders without crashing", () => {',
          "  render(<Widget />);",
          "});",
          "",
          'it.each([[1]])("case %i", (n) => {',
          "  expect(n).toBe(1);",
          "});",
          "",
        ].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      expect(scanForPattern(tmpDir, "noopTestAssertions")).toBe(1);
    });

    test("a Playwright describe container with hooks contributes no findings", async () => {
      fs.writeFileSync(
        path.join(tmpDir, "src", "e2e.spec.ts"),
        [
          'test.describe("suite", () => {',
          "  test.beforeEach(async ({ page }) => {",
          '    await page.goto("/");',
          "  });",
          "",
          '  test("loads", async ({ page }) => {',
          '    await expect(page).toHaveTitle("x");',
          "  });",
          "});",
          "",
        ].join("\n")
      );
      const { scanForPattern } = await import("../check-ai-antipatterns.mjs");
      expect(scanForPattern(tmpDir, "noopTestAssertions")).toBe(0);
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
