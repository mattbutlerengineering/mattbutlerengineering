#!/usr/bin/env node

/**
 * PostToolUse hook: validates Rialto conventions in written/edited files.
 *
 * Checks for:
 * 1. Hardcoded color values (hex) instead of tokens
 * 2. Subpath imports from rialto (should use barrel)
 * 3. Physical directional CSS properties instead of logical
 * 4. Raw cubic-bezier in CSS instead of easing tokens
 * 5. Basic a11y: img without alt
 *
 * Warnings go to stderr (advisory, not blocking).
 * Early exits for non-Rialto files (< 10ms overhead).
 */

import { readFileSync } from "node:fs";

// Physical CSS properties → logical equivalents (hoisted for perf)
const PHYSICAL_PROPS = [
  { pattern: /\bmargin-left\b/, fix: "margin-inline-start" },
  { pattern: /\bmargin-right\b/, fix: "margin-inline-end" },
  { pattern: /\bpadding-left\b/, fix: "padding-inline-start" },
  { pattern: /\bpadding-right\b/, fix: "padding-inline-end" },
  { pattern: /\bborder-left\b/, fix: "border-inline-start" },
  { pattern: /\bborder-right\b/, fix: "border-inline-end" },
  { pattern: /\btext-align:\s*left\b/, fix: "text-align: start" },
  { pattern: /\btext-align:\s*right\b/, fix: "text-align: end" },
];

const filePath = process.argv[2];

// Early exit: no file path provided
if (!filePath) process.exit(0);

// Early exit: only check TSX/JSX/CSS files
if (!/\.(tsx?|jsx?|css)$/i.test(filePath)) process.exit(0);

let content;
try {
  content = readFileSync(filePath, "utf-8");
} catch {
  // File doesn't exist or can't be read — not our problem
  process.exit(0);
}

// Early exit: not a Rialto-related file
const isRialtoFile =
  content.includes("rialto") ||
  content.includes("--rialto-") ||
  content.includes("@mbe/rialto");

if (!isRialtoFile) process.exit(0);

// Pre-compute file type booleans (checked once, not per-line)
const isCss = filePath.endsWith(".css");
const isJsx = /\.(tsx|jsx)$/i.test(filePath);

const lines = content.split("\n");
const warnings = lines.flatMap((line, i) => {
  const lineNum = i + 1;
  const results = [];

  // Skip comments
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
    return results;
  }

  // Rule 1: Hardcoded hex colors (exclude token references and URLs)
  const hexMatch = line.match(/#[0-9a-fA-F]{3,8}\b/);
  if (hexMatch && !line.includes("var(--rialto-") && !line.includes("url(") && !line.includes("$id")) {
    results.push(`L${lineNum}: Hardcoded color "${hexMatch[0]}" — use a --rialto-* token instead`);
  }

  // Rule 2: Subpath imports from rialto
  const subpathMatch = line.match(/from\s+["']rialto\/(components|utils|hooks)\//);
  if (subpathMatch) {
    results.push(
      `L${lineNum}: Subpath import "rialto/${subpathMatch[1]}/..." — import from "rialto" barrel instead`
    );
  }

  // Rule 3: Physical directional CSS properties
  if (isCss) {
    for (const { pattern, fix } of PHYSICAL_PROPS) {
      if (pattern.test(line)) {
        results.push(`L${lineNum}: Physical property — use "${fix}" (logical) instead`);
      }
    }
  }

  // Rule 4: Raw cubic-bezier in CSS
  if (isCss && line.includes("cubic-bezier(") && !line.includes("var(--rialto-ease")) {
    results.push(`L${lineNum}: Raw cubic-bezier() — use var(--rialto-ease-*) token`);
  }

  // Rule 5: img without alt (basic a11y check in TSX/JSX)
  if (isJsx && /<img\b/.test(line) && !line.includes("alt=") && !line.includes("alt =")) {
    results.push(`L${lineNum}: <img> without alt attribute — add alt text for accessibility`);
  }

  return results;
});

// Output warnings to stderr
if (warnings.length > 0) {
  const header = `[rialto-plugin] ${warnings.length} warning${warnings.length > 1 ? "s" : ""} in ${filePath}:`;
  process.stderr.write(`${header}\n`);
  for (const w of warnings) {
    process.stderr.write(`  ${w}\n`);
  }
}

process.exit(0);
