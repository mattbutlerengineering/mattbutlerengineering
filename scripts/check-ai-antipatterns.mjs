#!/usr/bin/env node

/**
 * AI Antipattern Ratchet
 *
 * Scans the codebase for AI-specific code smells and compares counts against
 * a committed baseline. Fails if any pattern's count increased (ratchet).
 *
 * Usage:
 *   node scripts/check-ai-antipatterns.mjs            # check against baseline
 *   node scripts/check-ai-antipatterns.mjs --update   # regenerate baselines
 */

import fs from "node:fs";
import path from "node:path";

const BASELINE_PATH = path.resolve(process.cwd(), "metrics/ai-antipattern-baselines.json");

/** Directories to skip during file scanning. */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "generated",
  ".git",
  "coverage",
  ".turbo",
  ".stryker-tmp",
]);

/** File extensions to scan. */
const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);

/**
 * Descriptions for each pattern — stored in the baseline JSON for humans.
 * @type {Record<string, string>}
 */
const PATTERN_DESCRIPTIONS = {
  magicTimeouts:
    "Magic numbers in setTimeout/setInterval (e.g. setTimeout(fn, 3000) without a named constant)",
  emptyCatch: "Empty catch blocks that swallow errors silently",
  noopTestAssertions: "Test functions containing no expect() calls",
  hardcodedRoutes: "Hardcoded /api/... route strings instead of route constants",
  anyType: "TypeScript `as any` casts or `: any` type annotations",
  consoleLogs: "console.log() calls in production (non-test) source files",
  unusedParams: "Function parameters that look unused (not prefixed with _)",
  mockShapeMismatch:
    "Test mocks using .mockResolvedValue({}) or .mockReturnValue({}) with empty objects (likely missing required fields)",
};

/**
 * Walk a directory tree, yielding absolute file paths that match SCAN_EXTENSIONS.
 * Skips SKIP_DIRS automatically.
 *
 * @param {string} dir - Absolute directory path to walk
 * @returns {string[]}
 */
function collectFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

/** Returns true if the file path looks like a test file. */
function isTestFile(filePath) {
  const base = path.basename(filePath);
  return (
    base.includes(".test.") ||
    base.includes(".spec.") ||
    filePath.includes("__tests__") ||
    filePath.includes("/__mocks__/")
  );
}

/**
 * Count occurrences of a regex across content lines.
 * @param {string} content
 * @param {RegExp} regex - must have global flag
 * @returns {number}
 */
function countMatches(content, regex) {
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/** Pattern scanner implementations, keyed by pattern name. */
const SCANNERS = {
  magicTimeouts(files) {
    // setTimeout or setInterval with a literal number (not a variable/constant)
    const RE = /\b(?:setTimeout|setInterval)\s*\([^,)]+,\s*\d+\s*\)/g;
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },

  emptyCatch(files) {
    // catch (e) {} or catch {} with optional whitespace/newline inside
    const RE = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/g;
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },

  noopTestAssertions(files) {
    // Test files with it/test functions that contain no expect() call
    let total = 0;
    const testFiles = files.filter(isTestFile);
    for (const f of testFiles) {
      const content = fs.readFileSync(f, "utf-8");
      // Find it()/test() blocks — heuristic: match top-level test blocks
      const testBlocks = content.split(/(?:^|\n)\s*(?:it|test)\s*\(/);
      // First segment is before any test block
      for (let i = 1; i < testBlocks.length; i++) {
        const block = testBlocks[i];
        // Grab up to the next test block start or end of file
        if (!block.includes("expect(")) {
          total++;
        }
      }
    }
    return total;
  },

  hardcodedRoutes(files) {
    // String literals starting with /api/ (route paths hardcoded in non-route-definition files)
    const RE = /["'`]\/api\/[^"'`\s]+["'`]/g;
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },

  anyType(files) {
    // TypeScript `as any` casts or `: any` annotations (but not `// any`)
    const RE = /(?:as\s+any\b|:\s*any\b)/g;
    let total = 0;
    for (const f of files) {
      if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },

  consoleLogs(files) {
    const RE = /\bconsole\.log\s*\(/g;
    let total = 0;
    for (const f of files) {
      if (isTestFile(f)) continue;
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },

  unusedParams(files) {
    // Function params that appear exactly once in the function signature
    // and are not prefixed with _ (heuristic: single-character non-underscore params
    // that don't appear in the function body).
    // Simplified: count arrow/regular functions with params named exactly like single chars
    // that have no usage — too complex for regex, so we count a safer proxy:
    // Parameters named `e`, `err`, `event`, `req`, `res`, `next` that appear only in signature
    // This is intentionally conservative to avoid false positives.
    const RE =
      /(?:function\s+\w*\s*\(|(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\()[^)]*\b([a-z])\b[^)]*\)/g;
    let total = 0;
    for (const f of files) {
      const content = fs.readFileSync(f, "utf-8");
      let match;
      RE.lastIndex = 0;
      while ((match = RE.exec(content)) !== null) {
        const param = match[1];
        // If the param appears only once total in the file, it's likely unused
        const paramRe = new RegExp(`\\b${param}\\b`, "g");
        const occurrences = countMatches(content, paramRe);
        if (occurrences === 1) {
          total++;
        }
      }
    }
    return total;
  },

  mockShapeMismatch(files) {
    // Test mocks using .mockResolvedValue({}) or .mockReturnValue({}) with empty objects
    const RE = /\.(?:mockResolvedValue|mockReturnValue)\s*\(\s*\{\s*\}\s*\)/g;
    let total = 0;
    for (const f of files.filter(isTestFile)) {
      const content = fs.readFileSync(f, "utf-8");
      total += countMatches(content, RE);
    }
    return total;
  },
};

/**
 * Scan for a single named pattern across the codebase root.
 *
 * @param {string} root - Absolute path to codebase root
 * @param {string} patternName - Key in SCANNERS
 * @returns {number} violation count
 */
export function scanForPattern(root, patternName) {
  const scanner = SCANNERS[patternName];
  if (!scanner) throw new Error(`Unknown pattern: ${patternName}`);
  const files = collectFiles(root);
  return scanner(files);
}

/**
 * Scan all patterns and return counts object.
 *
 * @param {string} root - Absolute path to codebase root
 * @returns {Record<string, number>}
 */
export function scanAll(root) {
  const files = collectFiles(root);
  const counts = {};
  for (const name of Object.keys(SCANNERS)) {
    counts[name] = SCANNERS[name](files);
  }
  return counts;
}

/**
 * Compare current violation counts against a baseline object.
 *
 * @param {Record<string, number>} current
 * @param {{ patterns: Record<string, { count: number }> }} baseline
 * @returns {{ passed: boolean; regressions: Array<{ pattern: string; current: number; baseline: number }> }}
 */
export function compareWithBaseline(current, baseline) {
  const regressions = [];
  for (const [pattern, count] of Object.entries(current)) {
    const baselineEntry = baseline.patterns[pattern];
    const baselineCount = baselineEntry ? baselineEntry.count : 0;
    if (count > baselineCount) {
      regressions.push({ pattern, current: count, baseline: baselineCount });
    }
  }
  return { passed: regressions.length === 0, regressions };
}

/**
 * Build a baseline object from current counts, adding descriptions.
 *
 * @param {Record<string, number>} counts
 * @returns {{ generatedAt: string; patterns: Record<string, { count: number; description: string }> }}
 */
export function buildBaseline(counts) {
  const patterns = {};
  for (const [name, count] of Object.entries(counts)) {
    patterns[name] = {
      count,
      description: PATTERN_DESCRIPTIONS[name] ?? `Pattern: ${name}`,
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    patterns,
  };
}

// ── CLI entry point ────────────────────────────────────────────────────────────

const isMain = process.argv[1] && process.argv[1].endsWith("check-ai-antipatterns.mjs");

if (isMain) {
  const UPDATE = process.argv.includes("--update");
  const root = process.cwd();

  console.log("Scanning codebase for AI antipatterns...");
  const counts = scanAll(root);

  if (UPDATE) {
    const baseline = buildBaseline(counts);
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`\nBaseline updated: ${BASELINE_PATH}`);
    for (const [name, data] of Object.entries(baseline.patterns)) {
      console.log(`  ${name}: ${data.count}`);
    }
    process.exit(0);
  }

  // Compare mode
  if (!fs.existsSync(BASELINE_PATH)) {
    console.error(`ERROR: Baseline not found at ${BASELINE_PATH}`);
    console.error("Run with --update to generate baselines.");
    process.exit(1);
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
  const { passed, regressions } = compareWithBaseline(counts, baseline);

  // Print per-pattern report
  console.log("\nPattern results:");
  for (const [name, count] of Object.entries(counts)) {
    const baseCount = baseline.patterns[name]?.count ?? 0;
    const delta = count - baseCount;
    const status = delta > 0 ? "FAIL" : delta < 0 ? "IMPROVED" : "OK";
    console.log(`  ${status.padEnd(8)} ${name}: ${count} (baseline: ${baseCount})`);
  }

  if (!passed) {
    console.error(`\nREGRESSION: ${regressions.length} pattern(s) increased:`);
    for (const r of regressions) {
      console.error(`  ${r.pattern}: ${r.baseline} → ${r.current} (+${r.current - r.baseline})`);
    }
    console.error(
      "\nFix the violations above, or run with --update to commit new baselines after intentional cleanup."
    );
    process.exit(1);
  }

  console.log("\nAll patterns within baseline. No regressions detected.");
}
