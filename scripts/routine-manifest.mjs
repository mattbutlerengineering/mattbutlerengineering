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
      "Not a RemoteTrigger — runs in GitHub Actions (metrics-collectors.yml) because the domain-metrics and review-burden collectors need production egress and the gh CLI, neither available in a CCR session; already watched by scripts/scheduled-workflow-health.mjs.",
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
      "Shares a PR-title signature with mbe-midday — both routines' prompts (docs/routines/mbe-night.md:22, docs/routines/mbe-midday.md:22) instruct the same `chore(metrics): queue telemetry <date>` title, so one routine's PR marks BOTH alive and a dead one hides behind its twin. Verified on a real world containing only 2026-09-20's single queue-telemetry PR: the pre-fix manifest classified both `alive`. Same class as mbe-daily-issue below, so same verdict — fail closed until #5344/#5373's title-convention fix is applied to these two prompts.",
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
      "No enforced distinguishing PR/issue signature yet — its merged PRs are indistinguishable from ordinary implement-queue traffic, the exact gap #5344/#5373 fixed for mbe-weekly-improve. Needs the same title-convention fix before this routine can be verified.",
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
      "Shares a PR-title signature with mbe-night — both routines' prompts (docs/routines/mbe-night.md:22, docs/routines/mbe-midday.md:22) instruct the same `chore(metrics): queue telemetry <date>` title, so one routine's PR marks BOTH alive and a dead one hides behind its twin. Verified on a real world containing only 2026-09-20's single queue-telemetry PR: the pre-fix manifest classified both `alive`. Same class as mbe-daily-issue below, so same verdict — fail closed until #5344/#5373's title-convention fix is applied to these two prompts.",
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
      "No enforced PR title convention documented in docs/routines/mbe-monthly-meta-audit.md — needs the same signature fix mbe-weekly-improve got (#5344) before this routine can be verified.",
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
