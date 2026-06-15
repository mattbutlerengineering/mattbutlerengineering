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

  describe("compareWithBaseline", () => {
    test("returns no regressions when counts match baseline", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { magicTimeouts: 5, emptyCatch: 2, anyType: 10 };
      const baseline = {
        patterns: {
          magicTimeouts: { count: 5 },
          emptyCatch: { count: 2 },
          anyType: { count: 10 },
        },
      };
      const result = compareWithBaseline(current, baseline);
      expect(result.regressions).toHaveLength(0);
      expect(result.passed).toBe(true);
    });

    test("returns no regressions when counts decreased", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { magicTimeouts: 3, emptyCatch: 1 };
      const baseline = {
        patterns: {
          magicTimeouts: { count: 5 },
          emptyCatch: { count: 2 },
        },
      };
      const result = compareWithBaseline(current, baseline);
      expect(result.regressions).toHaveLength(0);
      expect(result.passed).toBe(true);
    });

    test("detects regression when count increased", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { magicTimeouts: 8, emptyCatch: 2 };
      const baseline = {
        patterns: {
          magicTimeouts: { count: 5 },
          emptyCatch: { count: 2 },
        },
      };
      const result = compareWithBaseline(current, baseline);
      expect(result.regressions).toHaveLength(1);
      expect(result.regressions[0].pattern).toBe("magicTimeouts");
      expect(result.regressions[0].current).toBe(8);
      expect(result.regressions[0].baseline).toBe(5);
      expect(result.passed).toBe(false);
    });

    test("handles new patterns not in baseline as regression if count > 0", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { newPattern: 3 };
      const baseline = { patterns: {} };
      const result = compareWithBaseline(current, baseline);
      expect(result.regressions).toHaveLength(1);
      expect(result.passed).toBe(false);
    });

    test("handles new patterns not in baseline as ok if count is 0", async () => {
      const { compareWithBaseline } = await import("../check-ai-antipatterns.mjs");
      const current = { newPattern: 0 };
      const baseline = { patterns: {} };
      const result = compareWithBaseline(current, baseline);
      expect(result.regressions).toHaveLength(0);
      expect(result.passed).toBe(true);
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
