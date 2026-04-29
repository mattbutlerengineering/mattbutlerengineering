/**
 * Inject / update a shields.io badge for the ACMM level between
 * `<!-- acmm:begin -->` and `<!-- acmm:end -->` fences in README.md.
 *
 * The badge is idempotent — running the injector on an already-up-to-date README
 * produces no diff.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BEGIN = "<!-- acmm:begin -->";
const END = "<!-- acmm:end -->";

/** L1 red → L6 gold, matches rialto --rialto-accent (#d4a030). */
function colorFor(level) {
  switch (level) {
    case 6: return "d4a030";
    case 5: return "c4952c";
    case 4: return "a07230";
    case 3: return "7a5a36";
    case 2: return "8b6914";
    case 1: return "a14444";
    default: return "888888";
  }
}

/**
 * @param {number} level 0..6
 * @returns {string} The markdown badge snippet (image only, no fences).
 */
function badgeMarkdown(level) {
  const label = level === 0 ? "ACMM-not%20scored" : `ACMM-Level%20${level}`;
  const color = colorFor(level);
  return `![ACMM Level ${level}](https://img.shields.io/badge/${label}-${color}?style=flat-square)`;
}

/**
 * Rewrite the badge in README.md in-place. Returns one of:
 * - `"updated"`  — README was modified
 * - `"no-change"` — badge already matched target
 * - `"no-fence"`  — README has no begin/end fence (user needs to insert placeholders)
 * - `"no-readme"` — README missing
 *
 * @param {string} cwd
 * @param {number} level
 */
export function updateBadge(cwd, level) {
  const readmePath = join(cwd, "README.md");
  if (!existsSync(readmePath)) return "no-readme";

  const original = readFileSync(readmePath, "utf-8");
  const beginIdx = original.indexOf(BEGIN);
  const endIdx = original.indexOf(END);
  if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) return "no-fence";

  const before = original.slice(0, beginIdx + BEGIN.length);
  const after = original.slice(endIdx);
  const updated = before + badgeMarkdown(level) + after;

  if (updated === original) return "no-change";
  writeFileSync(readmePath, updated, "utf-8");
  return "updated";
}
