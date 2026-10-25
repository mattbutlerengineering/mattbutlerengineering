import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const RULES_DIR = ".claude/rules";

/**
 * Root CLAUDE.md and every `.claude/rules/*.md` without `paths:` frontmatter
 * load into every Claude Code session before any work starts. gotchas.md grew
 * 19 KB -> 113 KB in under three months because fix PRs appended incident
 * narratives to it; it was compressed back to ~20 KB with domain sections moved
 * to path-scoped siblings. These ceilings stop that from silently recurring.
 *
 * Raising a ceiling is allowed, but it should be a deliberate diff to this
 * file, not a side effect of an unrelated fix. Prefer compressing an entry or
 * moving it to a path-scoped sibling.
 */
const BUDGET_BYTES = {
  "CLAUDE.md": 9_000,
  ".claude/rules/gotchas.md": 22_000,
};

const hasPathsFrontmatter = (text) => /^---\r?\n(?:.*\r?\n)*?paths:/.test(text);

// Tracked files only: sibling tests briefly write untracked probe files into
// .claude/rules/ (check-prettier-claude-coverage), and CI sees only the index.
const alwaysLoadedRules = () =>
  execFileSync("git", ["ls-files", "--", `${RULES_DIR}/*.md`], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean)
    .filter((rel) => !hasPathsFrontmatter(readFileSync(resolve(ROOT, rel), "utf8")));

describe("always-loaded instruction budget", () => {
  it("every unscoped rules file has an explicit budget", () => {
    // A new always-loaded rules file must be budgeted on purpose, or given
    // `paths:` frontmatter so it loads only when matching files are read.
    const unbudgeted = alwaysLoadedRules().filter((rel) => !(rel in BUDGET_BYTES));
    expect(unbudgeted).toEqual([]);
  });

  it.each(Object.entries(BUDGET_BYTES))("%s stays within %i bytes", (rel, limit) => {
    const size = Buffer.byteLength(readFileSync(resolve(ROOT, rel), "utf8"));
    expect(size).toBeLessThanOrEqual(limit);
  });

  it("recognises path-scoped rules files", () => {
    expect(hasPathsFrontmatter('---\npaths:\n  - "a/**"\n---\n# x')).toBe(true);
    expect(hasPathsFrontmatter("# Known gotchas\n\npaths: not frontmatter")).toBe(false);
  });
});
