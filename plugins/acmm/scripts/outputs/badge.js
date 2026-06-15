/**
 * Inject / update a shields.io badge for the ACMM level between
 * `<!-- acmm:begin -->` and `<!-- acmm:end -->` fences in README.md.
 *
 * The badge is idempotent — running the injector on an already-up-to-date README
 * produces no diff.
 *
 * Freshness: when `state.lastRun` is older than STALE_THRESHOLD_DAYS (7 days), the
 * badge is rendered in grey with the audit date instead of the level color, making
 * stale audits visually distinct.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BEGIN = "<!-- acmm:begin -->";
const END = "<!-- acmm:end -->";
const BADGE_RE =
  /\[!\[ACMM Level \d+\]\(https:\/\/img\.shields\.io\/badge\/[^)]+\)\]\(docs\/acmm\.md\)/;

const STALE_THRESHOLD_DAYS = 7;
const STALE_COLOR = "9e9e9e";

/** L1 red → L6 gold, matches rialto --rialto-accent (#d4a030). */
function colorFor(level) {
  switch (level) {
    case 6:
      return "d4a030";
    case 5:
      return "c4952c";
    case 4:
      return "a07230";
    case 3:
      return "7a5a36";
    case 2:
      return "8b6914";
    case 1:
      return "a14444";
    default:
      return "888888";
  }
}

/**
 * @param {number} level 0..6
 * @returns {string} The markdown badge snippet (image only, no fences).
 */
export function badgeMarkdown(level) {
  const label = level === 0 ? "ACMM-not%20scored" : `ACMM-Level%20${level}`;
  const color = colorFor(level);
  return `[![ACMM Level ${level}](https://img.shields.io/badge/${label}-${color}?style=flat-square)](docs/acmm.md)`;
}

/**
 * Stale variant: grey badge showing the (outdated) audit date.
 *
 * @param {number} level 0..6
 * @param {string} auditDate ISO date string (YYYY-MM-DD) of the last run
 * @returns {string} The markdown badge snippet (image only, no fences).
 */
export function staleBadgeMarkdown(level, auditDate) {
  const levelStr = level === 0 ? "0" : String(level);
  const label = `ACMM-Level%20${levelStr}%20%28stale%20${auditDate}%29`;
  return `[![ACMM Level ${levelStr} (stale ${auditDate})](https://img.shields.io/badge/${label}-${STALE_COLOR}?style=flat-square)](docs/acmm.md)`;
}

/**
 * Determine which badge markdown to use based on state freshness.
 *
 * @param {number} level
 * @param {{ lastRun?: string } | undefined} state
 * @param {Date} now
 * @returns {string}
 */
function chooseBadge(level, state, now) {
  const lastRun = state?.lastRun;
  if (!lastRun) {
    return staleBadgeMarkdown(level, "unknown");
  }
  const lastRunDate = new Date(lastRun);
  const ageMs = now.getTime() - lastRunDate.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays > STALE_THRESHOLD_DAYS) {
    const auditDate = lastRun.slice(0, 10);
    return staleBadgeMarkdown(level, auditDate);
  }
  return badgeMarkdown(level);
}

/**
 * Rewrite the badge in README.md in-place. Returns one of:
 * - `"updated"`   — README was modified
 * - `"no-change"` — badge already matched target
 * - `"no-fence"`  — README has no begin/end fence (user needs to insert placeholders)
 * - `"no-readme"` — README missing
 *
 * @param {string} cwd
 * @param {number} level
 * @param {{ lastRun?: string } | undefined} [state] - ACMM state (for freshness check)
 * @param {Date} [now] - injectable clock seam for testing
 */
export function updateBadge(cwd, level, state, now = new Date()) {
  const readmePath = join(cwd, "README.md");
  if (!existsSync(readmePath)) return "no-readme";

  const original = readFileSync(readmePath, "utf-8");
  const target = chooseBadge(level, state, now);

  // Try fenced approach first (<!-- acmm:begin/end -->), fall back to regex
  const beginIdx = original.indexOf(BEGIN);
  const endIdx = original.indexOf(END);
  if (beginIdx >= 0 && endIdx > beginIdx) {
    const before = original.slice(0, beginIdx + BEGIN.length);
    const after = original.slice(endIdx);
    const updated = before + target + after;
    if (updated === original) return "no-change";
    writeFileSync(readmePath, updated, "utf-8");
    return "updated";
  }

  // Fence-free: find existing badge by regex and replace in-place
  if (!BADGE_RE.test(original)) return "no-fence";
  const updated = original.replace(BADGE_RE, target);
  if (updated === original) return "no-change";
  writeFileSync(readmePath, updated, "utf-8");
  return "updated";
}
