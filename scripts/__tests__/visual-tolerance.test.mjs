import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readToleranceDirectives } from "../visual-tolerance.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const FIXTURES = resolve(__dirname, "fixtures");

const CONFIG_SOURCE = readFileSync(
  resolve(FIXTURES, "playwright-config-commented-ratio.txt"),
  "utf8"
);
const LIVE_CONFIG = readFileSync(resolve(ROOT, "apps/rialto-web/playwright.config.ts"), "utf8");
const MODULE_SOURCE = readFileSync(resolve(ROOT, "scripts/visual-tolerance.mjs"), "utf8");
const REPORT_SOURCE = readFileSync(resolve(ROOT, "scripts/visual-diff-report.mjs"), "utf8");

describe("readToleranceDirectives — the three directives and their occurrence counts", () => {
  it("reads the live budget out of the real config, ignoring the commented-out ratio", () => {
    // The same load-bearing case visual-diff-report.test.mjs asserts through
    // parseMaxDiffPixels, stated here at the layer that actually does the
    // lexing: a comment-blind reader sees a ratio that is not configured.
    expect(CONFIG_SOURCE).toContain("// maxDiffPixelRatio");
    expect(readToleranceDirectives(CONFIG_SOURCE)).toEqual({
      threshold: null,
      maxDiffPixelRatio: null,
      maxDiffPixels: 300,
      occurrences: { threshold: 0, maxDiffPixelRatio: 0, maxDiffPixels: 1 },
    });
  });

  it("reports the live config as it stands today — one threshold, one budget, no ratio", () => {
    // Re-pinned, not deleted. This used to assert the defect — `threshold`
    // absent, inherited from Playwright's 0.2 by omission — which stopped
    // being true the moment the measured pair was written into the config.
    // The sweep point is still worth a test; it now pins the fixed shape.
    //
    // Deliberately shape, never value: naming the numbers here would make this
    // a second drift guard that has to be hand-edited on the very PR that
    // legitimately re-tunes them. Value drift is
    // scripts/__tests__/visual-tolerance-guard.test.mjs's job, and it checks
    // the config against its own provenance line rather than against a copy
    // held out here.
    const directives = readToleranceDirectives(LIVE_CONFIG);
    expect(directives.occurrences.threshold).toBe(1);
    expect(Number.isFinite(directives.threshold)).toBe(true);
    expect(directives.occurrences.maxDiffPixels).toBe(1);
    expect(Number.isFinite(directives.maxDiffPixels)).toBe(true);

    // The comment-blindness trap, against the real file: the config mentions a
    // ratio in prose and configures none.
    expect(LIVE_CONFIG).toContain("maxDiffPixelRatio");
    expect(directives.occurrences.maxDiffPixelRatio).toBe(0);
    expect(directives.maxDiffPixelRatio).toBeNull();
  });

  it("reads a fractional threshold as a number", () => {
    const directives = readToleranceDirectives(
      "expect: { toHaveScreenshot: { threshold: 0.02 } },"
    );
    expect(directives.threshold).toBe(0.02);
    expect(directives.occurrences.threshold).toBe(1);
  });

  it("reads a live maxDiffPixelRatio as a number", () => {
    const directives = readToleranceDirectives("maxDiffPixelRatio: 0.01,");
    expect(directives.maxDiffPixelRatio).toBe(0.01);
    expect(directives.occurrences.maxDiffPixelRatio).toBe(1);
  });

  it("reads a numeric separator", () => {
    expect(readToleranceDirectives("maxDiffPixels: 1_000,").maxDiffPixels).toBe(1000);
  });

  it("does not mistake maxDiffPixelRatio for maxDiffPixels", () => {
    const directives = readToleranceDirectives("maxDiffPixelRatio: 0.01, maxDiffPixels: 42,");
    expect(directives.maxDiffPixels).toBe(42);
    expect(directives.maxDiffPixelRatio).toBe(0.01);
    expect(directives.occurrences).toEqual({
      threshold: 0,
      maxDiffPixelRatio: 1,
      maxDiffPixels: 1,
    });
  });

  it("distinguishes absent (0) from ambiguous (>1)", () => {
    const absent = readToleranceDirectives("export default defineConfig({ testDir: './e2e' });");
    expect(absent.occurrences.maxDiffPixels).toBe(0);
    expect(absent.maxDiffPixels).toBeNull();

    const ambiguous = readToleranceDirectives(`
      expect: { toHaveScreenshot: { maxDiffPixels: 300 } },
      projects: [{ name: "wide", expect: { toHaveScreenshot: { maxDiffPixels: 900 } } }],
    `);
    expect(ambiguous.occurrences.maxDiffPixels).toBe(2);
    expect(ambiguous.maxDiffPixels).toBeNull();
  });

  it("distinguishes absent from present-but-unreadable — an identifier where a literal was expected", () => {
    const directives = readToleranceDirectives("threshold: THRESHOLD, maxDiffPixels: 300,");
    expect(directives.occurrences.threshold).toBe(1);
    expect(directives.threshold).toBeNull();
    // The readable neighbour is unaffected: unreadability is per key.
    expect(directives.maxDiffPixels).toBe(300);
  });

  it("treats an expression as unreadable rather than reading its first literal", () => {
    // `0.1 * 2` must NOT come back as 0.1 — a wrong number is worse than none.
    const directives = readToleranceDirectives("threshold: 0.1 * 2,");
    expect(directives.occurrences.threshold).toBe(1);
    expect(directives.threshold).toBeNull();
  });

  it("ignores a block-commented directive", () => {
    const directives = readToleranceDirectives("/* maxDiffPixels: 900 */ maxDiffPixels: 12,");
    expect(directives.maxDiffPixels).toBe(12);
    expect(directives.occurrences.maxDiffPixels).toBe(1);
  });

  it("does not let a URL containing // swallow a following directive", () => {
    const source = `
      use: { baseURL: "http://localhost:5173/rialto/" },
      expect: { toHaveScreenshot: { maxDiffPixels: 300 } },
    `;
    expect(readToleranceDirectives(source).maxDiffPixels).toBe(300);
  });

  it("is template-literal aware — a // inside a backtick string starts no comment", () => {
    const source = "const u = `http://x`; maxDiffPixels: 300,";
    expect(readToleranceDirectives(source).maxDiffPixels).toBe(300);
  });

  it("is single-quote aware", () => {
    const source = "const u = 'http://x'; maxDiffPixels: 300,";
    expect(readToleranceDirectives(source).maxDiffPixels).toBe(300);
  });

  it("survives an escaped quote inside a string", () => {
    const source = 'const u = "a\\"// b"; maxDiffPixels: 300,';
    expect(readToleranceDirectives(source).maxDiffPixels).toBe(300);
  });
});

describe("readToleranceDirectives — says less rather than guessing", () => {
  const ALL_NULL = {
    threshold: null,
    maxDiffPixelRatio: null,
    maxDiffPixels: null,
    occurrences: { threshold: 0, maxDiffPixelRatio: 0, maxDiffPixels: 0 },
  };

  it("returns all-null with zero occurrences for a non-string", () => {
    expect(readToleranceDirectives(null)).toEqual(ALL_NULL);
    expect(readToleranceDirectives(undefined)).toEqual(ALL_NULL);
    expect(readToleranceDirectives(42)).toEqual(ALL_NULL);
    expect(readToleranceDirectives({})).toEqual(ALL_NULL);
  });

  it("returns all-null with zero occurrences for an empty string", () => {
    expect(readToleranceDirectives("")).toEqual(ALL_NULL);
  });

  it("returns all-null with zero occurrences for an unterminated string literal", () => {
    // The lexer cannot tell code from string past that point, so every answer
    // it could give is a guess.
    expect(readToleranceDirectives('const s = "unterminated; maxDiffPixels: 300,')).toEqual(
      ALL_NULL
    );
  });

  it("never throws", () => {
    for (const input of ["", null, undefined, 42, "/*", "`", "maxDiffPixels:", "'"]) {
      expect(() => readToleranceDirectives(input)).not.toThrow();
    }
  });
});

describe("the module is pure and owns the lexer alone", () => {
  it("imports nothing — in particular no node:fs", () => {
    expect(MODULE_SOURCE).not.toMatch(/^\s*import\s/m);
    expect(MODULE_SOURCE).not.toContain("node:fs");
  });

  it("visual-diff-report.mjs no longer defines its own stripComments", () => {
    // Two copies of "how do you strip a comment from this file" is the shape
    // where one gets fixed and the other does not.
    expect(REPORT_SOURCE).not.toMatch(/function\s+stripComments\b/);
  });

  it("visual-diff-report.mjs's parseMaxDiffPixels delegates to this module", () => {
    expect(REPORT_SOURCE).toContain("visual-tolerance.mjs");
    expect(REPORT_SOURCE).toContain("readToleranceDirectives");
  });
});
