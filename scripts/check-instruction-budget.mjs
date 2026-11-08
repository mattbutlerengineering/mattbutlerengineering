#!/usr/bin/env node

/**
 * Byte budget for the instruction files every Claude Code session loads
 * (root CLAUDE.md and the unscoped `.claude/rules/*.md`). Single source of
 * truth for the limits: the vitest guard (`__tests__/instruction-budget.test.mjs`)
 * and the docs-only CI lane both import / run this module.
 *
 * Why a standalone script (#8396): both budgeted files are markdown, so the
 * only PR shape that can breach a budget is a markdown-only PR -- exactly the
 * shape whose `has_code=false` skips the Test job. The `docs-format` job runs
 * this check so that lane covers it. Pure file read, no build output needed.
 *
 * Raising a ceiling is allowed, but it should be a deliberate diff here, not a
 * side effect of an unrelated fix. Prefer compressing an entry or moving it to
 * a path-scoped sibling.
 *
 * Usage: node scripts/check-instruction-budget.mjs
 * Exit code: 0 within budget, 1 otherwise
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runCheck } from "./lib/fitness-check.mjs";

const DEFAULT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RULES_DIR = ".claude/rules";

export const BUDGET_BYTES = {
  "CLAUDE.md": 9_000,
  ".claude/rules/gotchas.md": 22_000,
};

export const hasPathsFrontmatter = (text) => /^---\r?\n(?:.*\r?\n)*?paths:/.test(text);

// Tracked files only: sibling tests briefly write untracked probe files into
// .claude/rules/ (check-prettier-claude-coverage), and CI sees only the index.
export const alwaysLoadedRules = (root = DEFAULT_ROOT) =>
  execFileSync("git", ["ls-files", "--", `${RULES_DIR}/*.md`], { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((rel) => !hasPathsFrontmatter(readFileSync(join(root, rel), "utf8")));

/** Pure check -- returns one human-readable line per violation; [] means within budget. */
export function findBudgetViolations(root = DEFAULT_ROOT) {
  const findings = [];
  // A new always-loaded rules file must be budgeted on purpose, or given
  // `paths:` frontmatter so it loads only when matching files are read.
  for (const rel of alwaysLoadedRules(root)) {
    if (!(rel in BUDGET_BYTES)) findings.push(`${rel}: always-loaded but has no budget`);
  }
  for (const [rel, limit] of Object.entries(BUDGET_BYTES)) {
    try {
      const size = Buffer.byteLength(readFileSync(join(root, rel), "utf8"));
      if (size > limit)
        findings.push(`${rel}: ${size} bytes, ${size - limit} over the ${limit} budget`);
    } catch {
      findings.push(`${rel}: budgeted file is unreadable or missing`);
    }
  }
  return findings;
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-instruction-budget.mjs");

if (isMain) {
  process.exit(
    runCheck({
      name: "Instruction budget",
      findings: findBudgetViolations(),
      formatFinding: (line) => `  ${line}`,
      passMessage: "PASS: CLAUDE.md and .claude/rules/gotchas.md are within their byte budgets.",
      failMessage:
        "FAIL: always-loaded instruction files exceed their budget. Compress an entry or move it to a path-scoped gotchas-*.md sibling; do not raise the ceiling:",
    })
  );
}
