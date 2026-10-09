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
 * #5748's "known limitation" question — should mbe-night/mbe-midday/
 * mbe-daily-issue also log a line on a no-op (empty-backlog) fire, the way
 * mbe-weekly-improve step 5 does, so a healthy no-op run doesn't read as
 * `dark` — is deliberately left unresolved here rather than decided by
 * editing the three live RemoteTrigger prompts in this PR. That edit is a
 * separate, riskier change (it touches production automation prompts, not
 * this file) and isn't needed to flip the one signature #5748 could
 * actually confirm (mbe-monthly-meta-audit, via PR #5950); mbe-night and
 * mbe-midday stay paused and `unverifiable` regardless. Tracked as its own
 * follow-up rather than bundled into this mechanical flip.
 *
 * @module routine-manifest
 */

/**
 * @typedef {{type: "pr-title", pattern: string, searchTerm: string, observe?: "latest-matching-commit"}} PrTitleSignature
 * `observe: "latest-matching-commit"` (opt-in) dates a matching PR by its newest
 * commit whose headline matches `pattern` instead of `mergedAt ?? createdAt` —
 * for a routine that commits to one long-lived PR on every fire.
 */
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
 * @property {string} [activatedAt]       ISO date the RemoteTrigger was created; until it is
 *                                        2 x periodDays old, a routine with no matching artifact
 *                                        is `pending`, not `dark` (routine-liveness.mjs)
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
    //
    // #5603: the daily checker flagged this routine `dark`. The signature
    // below was never the problem — it has been a real, matching pr-title
    // signature since this manifest's inception (#5557), and has repeatedly
    // been observed producing real PRs (e.g. #5718's "chore(metrics):
    // optimize-implement-queue 2026-09-24"). The actual cause was a genuine
    // one-day operational skip: `.claude/improvement-loop/log.md` has no
    // 2026-09-26 entry, so the most recent matching artifact aged past this
    // `periodDays: 1` routine's 2-day dark threshold. No manifest change was
    // needed — this comment (and the pinning tests in
    // scripts/__tests__/routine-liveness.test.mjs) exist so a future reader
    // doesn't re-diagnose this as the "no signature declared" gap #5344/#5373
    // closed for other routines; that gap does not apply here.
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
    // Confirmed live 2026-09-25 by #5763, titled "… (mbe-daily-issue #5759)"
    // (#5748). The routine closes an existing issue rather than filing one,
    // so the PR it opens is its own artifact, marked by a title suffix.
    signature: {
      type: "pr-title",
      pattern: String.raw`\(mbe-daily-issue #\d+\)`,
      searchTerm: "mbe-daily-issue",
    },
  },
  {
    name: "mbe-morning",
    triggerId: "trig_01QYoHCMjUgJybAoXUvjjrWX",
    periodDays: 1,
    // #5955: this used to declare the same `chore(acmm): daily audit <date>`
    // pr-title signature mbe-morning's own ACMM-audit prompt step produced.
    // #5857 ("one canonical daily audit") made `acmm-regression.yml` — a
    // GitHub Actions workflow, independently watched by
    // scripts/scheduled-workflow-health.mjs — the sole producer of that
    // exact title via a long-lived reused branch/PR (`automation/
    // acmm-regression`), whose `createdAt` freezes at first open while its
    // title/commits keep moving forward on every later fire. Two problems,
    // either one enough to retire the signature: (1) mbe-morning's own copy
    // of the step ran a stale path (`scripts/acmm/audit.js`; real location
    // is `plugins/acmm/scripts/audit.js`) and, even fixed, would collide
    // under the identical title with acmm-regression.yml's PR — #5857's own
    // body flagged this duplication for "whoever next edits the live
    // routine" to resolve; (2) even papering over the staleness (e.g. via
    // `observe: "latest-matching-commit"`) would misattribute
    // acmm-regression.yml's liveness to mbe-morning, which is the wrong
    // routine. docs/routines/mbe-morning.md's ACMM step is retired here as
    // the actual fix; `/ideate` is this routine's only remaining
    // responsibility, and its own output (ideation-batch/feature-proposal
    // issues) is gated on batch completion — often nothing for weeks at a
    // time — so no reliable `periodDays: 1` artifact exists for it yet. A
    // human who wants mbe-morning tracked daily again needs to give
    // `/ideate` (or this routine) a heartbeat artifact that fires every run,
    // not just when there's ideation work to do — out of scope for this fix.
    unverifiable: true,
    unverifiableReason:
      "mbe-morning's ACMM-audit step (and the chore(acmm): daily audit PR title it used to be detected by) was retired in #5955 — acmm-regression.yml now owns that artifact exclusively, and is tracked independently by scripts/scheduled-workflow-health.mjs. mbe-morning's remaining /ideate step produces no artifact on most runs (gated on ideation-batch completion), so no reliable periodDays: 1 signature exists for it yet.",
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
    // Confirmed live 2026-10-01 by PR #5950, titled "chore(meta): monthly
    // meta-audit 2026-10-01 — guard unreachable mbe CLI commands" (#5748).
    // The PR is the signature target rather than the `ready` issues this
    // routine also files: those are conditional ("for the rest") and carry
    // no distinct label.
    signature: {
      type: "pr-title",
      pattern: String.raw`chore\(meta\): monthly meta-audit \d{4}-\d{2}-\d{2}`,
      searchTerm: "monthly meta-audit",
    },
  },
  {
    name: "mbe-ui-quality",
    // RemoteTrigger created 2026-09-30 by the ui-quality-loop Ship stage;
    // routine-liveness.mjs's `activatedAt` grace keeps the first two days
    // `pending` instead of `dark`.
    triggerId: "trig_01DYzgRBp66dxwQ828y9x1jV",
    activatedAt: "2026-09-30",
    periodDays: 1,
    // docs/routines/mbe-ui-quality.md step (7) commits `chore(ui-quality):
    // ledger <date>` onto the `ui-quality/ledger` branch on every fire, no-op
    // fires included, and opens the PR only when none is open — so the PR
    // stays open across fires and is dated by its newest matching commit
    // (`observe`), not its first day's createdAt. Pinned by
    // scripts/__tests__/ui-quality-routine-prompt.test.mjs.
    signature: {
      type: "pr-title",
      pattern: String.raw`chore\(ui-quality\): ledger \d{4}-\d{2}-\d{2}`,
      searchTerm: "ui-quality",
      observe: "latest-matching-commit",
    },
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
