#!/usr/bin/env node
/**
 * routine-manifest.mjs — machine-readable catalog of claude.ai RemoteTrigger
 * routines, paired with a detectable artifact signature (#5552).
 *
 * `scripts/scheduled-workflow-health.mjs` watches GitHub Actions scheduled
 * workflows for failing streaks. RemoteTriggers have no Actions presence at
 * all — that detector structurally cannot see them — so nothing watched the
 * `mbe-*` routine chain until a human read the weekly retro. It died silently
 * for 19 days once (2026-07-10 account migration) and went dark again for at
 * least a week (`mbe-weekly-improve`, Friday 2026-09-18) before a title
 * convention (#5344/#5373) made the second instance detectable at all.
 *
 * Each entry below either declares a `signature` (how to recognize this
 * routine's expected artifact) or an explicit reason it can't be verified
 * yet. `docs/scheduled-tasks.md`'s routine catalog table is the prose source
 * of truth for the routine list itself — `parseRoutineCatalog()` reads it so
 * a coverage test (`scripts/__tests__/routine-liveness.test.mjs`) can fail
 * when a new catalog row has no manifest entry, the same shape as
 * `scripts/regen-manifest.mjs`'s FAMILIES coverage test.
 *
 * Two distinct reasons a manifest entry can lack a `signature`:
 *   - `outOfScope: true`   — not a RemoteTrigger at all (runs in GitHub
 *     Actions instead) and already watched by scheduled-workflow-health.mjs.
 *     Never classified, never filed as a finding by this checker.
 *   - `unverifiable: true` — IS a RemoteTrigger routine, but its prompt
 *     documents no distinguishing PR/issue signature yet — the exact gap
 *     #5344/#5373 closed for `mbe-weekly-improve`. Classified as
 *     `unverifiable` and filed as a finding, per the issue's "fail closed on
 *     no signature defined" rule — silently passing it is how
 *     `mbe-weekly-improve` went two retros unverified.
 *
 * @module routine-manifest
 */

/** @typedef {{type: "pr-title", pattern: string, searchTerm: string}} PrTitleSignature */
/** @typedef {{type: "issue-label", label: string}} IssueLabelSignature */
/** @typedef {PrTitleSignature | IssueLabelSignature} RoutineSignature */

/**
 * @typedef {Object} RoutineManifestEntry
 * @property {string} name                repo-unique routine name, matches docs/scheduled-tasks.md's catalog
 * @property {string|null} triggerId      RemoteTrigger id, or null when out of scope
 * @property {number} periodDays          expected cadence in days (1 = daily, 7 = weekly)
 * @property {RoutineSignature} [signature]
 * @property {boolean} [outOfScope]
 * @property {string} [outOfScopeReason]
 * @property {boolean} [unverifiable]
 * @property {string} [unverifiableReason]
 */

/** @type {RoutineManifestEntry[]} */
export const ROUTINE_MANIFEST = [
  {
    name: "mbe-deep-audit",
    triggerId: null,
    periodDays: 7,
    outOfScope: true,
    outOfScopeReason:
      "Disabled RemoteTrigger — runs in GitHub Actions (audit-sweep.yml) instead, already watched by scripts/scheduled-workflow-health.mjs.",
  },
  {
    name: "drift-fix",
    triggerId: null,
    periodDays: 1,
    outOfScope: true,
    outOfScopeReason:
      "Not a RemoteTrigger — runs in GitHub Actions (drift-fix.yml), already watched by scripts/scheduled-workflow-health.mjs.",
  },
  {
    name: "metrics-collectors",
    triggerId: null,
    periodDays: 1,
    outOfScope: true,
    outOfScopeReason:
      "Not a RemoteTrigger — runs in GitHub Actions (metrics-collectors.yml) because the review-burden collector needs the gh CLI, not available in a CCR session; already watched by scripts/scheduled-workflow-health.mjs.",
  },
  {
    name: "mbe-evening",
    triggerId: "trig_01PHwfbFQcFveYajVPaTrbZk",
    periodDays: 1,
    // Step 1's "queue telemetry" PR title is shared with mbe-midday/mbe-night
    // (all three run the same /implement-queue step); step 3's
    // "optimize-implement-queue" PR is the one title unique to mbe-evening.
    signature: {
      type: "pr-title",
      pattern: String.raw`chore\(metrics\): optimize-implement-queue \d{4}-\d{2}-\d{2}`,
      searchTerm: "optimize-implement-queue",
    },
  },
  {
    name: "mbe-night",
    triggerId: "trig_01E6UxiwdsWcjBNwRGZSjmSV",
    periodDays: 1,
    unverifiable: true,
    unverifiableReason:
      'docs/routines/mbe-night.md:22 now specifies a distinct `chore(metrics): night queue telemetry <date>` PR title (#5604/#5608 fix), but the live RemoteTrigger prompt at claude.ai has not been updated to match yet — until it is, this routine still emits the old shared `chore(metrics): queue telemetry <date>` title, and searching for the new signature here would find zero matches and misclassify a live routine as `dark`. Flip to a real signature (`searchTerm: "night queue telemetry"`) in a follow-up PR once a PR with the new title is observed, proving the live trigger was updated.',
  },
  {
    name: "mbe-auditor",
    triggerId: "trig_019cUkf16QbqTL7RrVXXqXsw",
    periodDays: 1,
    signature: { type: "issue-label", label: "audit" },
  },
  {
    name: "mbe-daily-issue",
    triggerId: "trig_01Df3XFeJnGYeH33NeqE1Mp3",
    periodDays: 1,
    unverifiable: true,
    unverifiableReason:
      'docs/routines/mbe-daily-issue.md:41 now requires every PR this routine opens to end with the suffix `(mbe-daily-issue #<ISSUE>)` (#5605 fix), but the live RemoteTrigger prompt at claude.ai has not been updated to match yet — until it is, this routine still opens PRs indistinguishable from ordinary implement-queue traffic, and searching for the new signature here would find zero matches and misclassify a live routine as `dark`, strictly worse than this honest `unverifiable`. An `issue-label` signature is not an alternative: this routine CLOSES an existing issue rather than filing one, so liveness would key off the createdAt of that issue — the date it was filed, not the date the routine ran. Flip to a real signature (`searchTerm: "mbe-daily-issue"`, matching the suffix) in a follow-up PR once a PR carrying the new suffix is observed, proving the live trigger was updated.',
  },
  {
    name: "mbe-morning",
    triggerId: "trig_01QYoHCMjUgJybAoXUvjjrWX",
    periodDays: 1,
    signature: {
      type: "pr-title",
      pattern: String.raw`chore\(acmm\): daily audit \d{4}-\d{2}-\d{2}`,
      searchTerm: "daily audit",
    },
  },
  {
    name: "mbe-learning-loop",
    triggerId: "trig_018hcYeu5uCXgiddRwqaeYwd",
    periodDays: 1,
    signature: {
      type: "pr-title",
      pattern: String.raw`chore\(metrics\): learning-loop \d{4}-\d{2}-\d{2}`,
      searchTerm: "learning-loop",
    },
  },
  {
    name: "mbe-midday",
    triggerId: "trig_0118ZgGfEndrMqQSuTQNXQwT",
    periodDays: 1,
    unverifiable: true,
    unverifiableReason:
      'docs/routines/mbe-midday.md:22 now specifies a distinct `chore(metrics): midday queue telemetry <date>` PR title (#5604/#5608 fix), but the live RemoteTrigger prompt at claude.ai has not been updated to match yet — until it is, this routine still emits the old shared `chore(metrics): queue telemetry <date>` title, and searching for the new signature here would find zero matches and misclassify a live routine as `dark`. Flip to a real signature (`searchTerm: "midday queue telemetry"`) in a follow-up PR once a PR with the new title is observed, proving the live trigger was updated.',
  },
  {
    name: "mbe-weekly-improve",
    triggerId: "trig_01G12wULcCweXSb2jmVkChPW",
    periodDays: 7,
    signature: {
      type: "pr-title",
      pattern: String.raw`weekly improve \d{4}-\d{2}-\d{2}`,
      searchTerm: "weekly improve",
    },
  },
  {
    name: "mbe-doc-rot",
    triggerId: "trig_0176gF6ty4Jg8oyyXYApKWyi",
    periodDays: 7,
    signature: {
      type: "pr-title",
      pattern: String.raw`docs: weekly rot sweep \d{4}-\d{2}-\d{2}`,
      searchTerm: "weekly rot sweep",
    },
  },
  {
    name: "mbe-weekly-retro",
    triggerId: "trig_01VczFFpZUHi1vTdrfTauMkh",
    periodDays: 7,
    signature: {
      type: "pr-title",
      pattern: String.raw`docs: weekly process retro \d{4}-\d{2}-\d{2}`,
      searchTerm: "weekly process retro",
    },
  },
  {
    name: "mbe-monthly-meta-audit",
    triggerId: "trig_01SoWm7jxBGnJHxiyTMEKX1i",
    periodDays: 31,
    unverifiable: true,
    unverifiableReason:
      'docs/routines/mbe-monthly-meta-audit.md:25 now specifies a distinct `chore(meta): monthly meta-audit <YYYY-MM-DD>` PR title (#5612 fix), but the live RemoteTrigger prompt at claude.ai has not been updated to match yet — until it is, this routine opens its PR under no enforced convention, and searching for the new signature here would find zero matches and misclassify a live routine as `dark`, strictly worse than this honest `unverifiable`. The PR is the signature target rather than the `ready` issues this routine also files: those are conditional ("for the rest") and carry no distinct label. Flip to a real signature (`searchTerm: "monthly meta-audit"`) in a follow-up PR once a PR carrying the new title is observed, proving the live trigger was updated.',
  },
];

const CATALOG_ROW_PATTERN = /^\|\s*`([a-z0-9-]+)`/;
const TRIGGER_CELL_PATTERN = /`([a-zA-Z0-9_]+)`/;

/**
 * Pure: extracts `{name, triggerId}` for every row of `docs/scheduled-tasks.md`'s
 * "## Routine catalog" markdown table. `triggerId` is `null` for rows whose
 * Trigger ID cell has no backtick-quoted value (disabled / runs in GitHub
 * Actions, e.g. `— (disabled; runs in GH Actions)`).
 *
 * @param {string} markdown full contents of docs/scheduled-tasks.md
 * @returns {Array<{name: string, triggerId: string|null}>}
 */
export function parseRoutineCatalog(markdown) {
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex((line) => /^\|\s*Routine\s*\|/.test(line));
  if (headerIndex === -1) return [];

  const rows = [];
  // headerIndex + 1 is the `| --- | --- |` separator row; data starts after it.
  for (let i = headerIndex + 2; i < lines.length; i++) {
    const line = lines[i];
    const match = CATALOG_ROW_PATTERN.exec(line);
    if (!match) break; // table ended (first line back at column 0 without a name cell)

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    const triggerMatch = TRIGGER_CELL_PATTERN.exec(cells[1] ?? "");
    rows.push({ name: match[1], triggerId: triggerMatch ? triggerMatch[1] : null });
  }

  return rows;
}
