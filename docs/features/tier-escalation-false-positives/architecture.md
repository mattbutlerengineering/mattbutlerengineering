---
stage: architect
run: feature:tier-escalation-false-positives
date: 2026-10-14
ux: skipped — CI classifier workflow and a node module — no user-facing surface.
assumptions:
  - "Drafted from the brief and a direct read of .github/workflows/tier-classifier.yml (path rules, bodyProse stripping, #5956 hyphen guards, pathTier snapshot); no live trade-off interview. The 2–4 surfaced decisions below take the recommended option and are logged here instead of asked."
  - "No ADR: the escalation-policy change is a two-way door (plain revert restores old behaviour), so it fails the protocol's hard-to-reverse leg. docs/change-tiers.md plus this run's artifacts carry the policy record; if the T4 merge gate demands an ADR at merge time, reserved id ADR-110 (issue #6655 block) is the number to use — this repo's own sequence sits at ADR-026 and must not be forked casually."
  - "docs/standards.json absent in this repo — no standards slugs to cite."
---

# Architecture: Tier escalation as a pure, replayable module

## Approach

Mirror `scripts/merge-queue-eligibility.mjs`: the policy (two escalation
decisions) moves into a dependency-free ES module, `scripts/tier-escalation.mjs`,
and the workflow's inline node heredoc shrinks to an adapter that gathers
inputs (file list with additions, title, bodyProse, pathTier, current tier)
and applies the module's verdicts. Policy becomes testable and replayable
offline; the workflow keeps only transport. A replay subcommand in the same
file runs old-rule-vs-new-rule over recent PR history, because the module —
not a copy of it — is the thing that must be proven safe.

## Components

### `scripts/tier-escalation.mjs` (policy)

- Responsibility: every escalation verdict — what counts as review surface,
  when size bumps a tier, when a keyword mention is an incident signal.
  Pure functions, no I/O, no imports.
- Collaborators: called by the workflow adapter and by the replay CLI in the
  same file (two real adapters over one seam).

### Workflow adapter (`.github/workflows/tier-classifier.yml`)

- Responsibility: unchanged input gathering (files + per-file additions,
  title, body→bodyProse checklist stripping, pathTier, fork flag), dynamic
  `await import()` of the module, writing `tier/label/reasons` outputs.
  Holds no escalation logic after this change.
- Collaborators: the module; downstream label consumers are untouched.

### Replay CLI (`node scripts/tier-escalation.mjs replay --limit 300`)

- Responsibility: fetch the last N PRs (title, body, file list with
  additions) via the GitHub REST API, compute old-vs-new verdicts with both
  rule sets side by side, print a table of every PR whose tier changes, in
  both directions.
- Collaborators: GitHub REST (`gh api` or fetch with a token); the module's
  exported old/new rule functions.

## Data model

No storage. One shape crosses every interface:
`FileAddition = { path: string, additions: number }`. Replay rows:
`{ number, oldTier, newTier, reason }`, printed as a markdown table.

## Interfaces & contracts

### `countReviewSurfaceAdditions(files: FileAddition[]) → number`

- Input: changed files with per-file added-line counts.
- Output: sum of additions over files that are review surface. Excluded
  (exactly the classifier's own generated-T1 class): `**/llms.txt`,
  `**/llms-full.txt`, `pnpm-lock.yaml`, `**/registry.json`,
  `infrastructure/worker/dep-graph.json`,
  `docs/architecture/dependency-graph.md`, `**/generated*` path segments,
  plus `docs/features/**` and `docs/fixes/**` run-artifact markdown. All
  other `*.md` still counts.
- Failure modes: non-numeric/missing `additions` counts as 0 for that file,
  never NaN-poisons the sum.

### `decideSizeEscalation({ files, highestTier }) → { escalate, counted, reason }`

- Input: file additions + the tier before this rule.
- Output: `escalate: true` iff `counted > 1000 && highestTier < T4`; `reason`
  names the counted (not raw) line total.
- Failure modes: none beyond input defaulting above — pure.

### `decideKeywordEscalation({ title, bodyProse, pathTier }) → { action: 'none'|'bump'|'hardset-T4', reason }`

- Input: title; bodyProse (caller has already stripped checklists and the
  module re-masks code spans, keeping the #5956 hyphen guards verbatim);
  pathTier.
- Output: keyword + `pathTier >= T3` → `hardset-T4` (existing gate, kept
  verbatim). Else `bump` only when the keyword appears in the **title**, or
  in a body sentence (same `.split(/(?<=[.!?])\s+|\n/)` sentence-splitting as
  the bypass rule) that also matches an incident cue:
  `leaked|exposed|compromised|breached|revoked|rotat(e|ed|ing) (the|our|this|all|its)\b|incident (report|response|review)|security incident`.
  Bare descriptive mentions → `none`.
- Failure modes: empty/undefined title or body treated as `''` — never
  throws; a throw in the workflow would fail the step (see below).

### Workflow seam (process boundary)

- Input/Output: adapter imports via
  `await import(pathToFileURL('scripts/tier-escalation.mjs'))` and maps
  verdicts onto the existing `highest`/`reasons` variables.
- Failure modes: import or verdict error fails the step → no `tier:*` label
  → `merge-queue-eligibility.mjs` already fails closed ("awaiting tier
  classification"), so breakage can never under-review a PR. Fail-closed
  direction verified against #5983's fix.

### Replay seam (network boundary)

- Input: `--limit N` (default 300). Output: markdown table of changed
  verdicts; exits 0 with an explicit "0 changed" line when none change.
- Failure modes: missing credential/network → non-zero exit with a message;
  never an empty table that reads as a clean replay (the repo's
  silent-skip gotcha class).

## Stack & dependencies

- Plain node ESM, zero deps — matches `merge-queue-eligibility.mjs` and the
  `scripts/vitest.config.mjs` test harness (60s timeout already configured).
- Vitest for `scripts/__tests__/tier-escalation.test.mjs`.

## Decisions & alternatives

- **Exclusion list lives in the module** over deriving it from the workflow's
  rule table at runtime — the YAML rule table isn't importable; a shared
  test asserting the two lists agree is cheaper than parsing YAML in CI.
- **Exclude `docs/features/**`/`docs/fixes/**` md, keep other md counting**
  over excluding all markdown — run artifacts are pipeline exhaust at
  review time, but README/change-tiers/docs edits are exactly what humans
  must review (#6591's 943 doc lines keep counting; it stays T4 on code
  alone regardless).
- **Incident cue + title backstop** over dropping the keyword rule — a real
  "we leaked the Stripe key and must rotate it" must still hard-escalate;
  over cue-less `bump` — that is today's false-positive engine (#6541).
  Same discriminator shape as BYPASS_PHRASE/REQUEST_CUE (#3919→#3921).
- **Replay as a manual, credentialed CLI gate** over a CI job — needs 300
  PRs × per-file additions from the API; run once per rule change, table
  pasted into the PR, changed cases pinned as tests (which _do_ run in CI
  forever).
- **Behaviour-change acceptance comes from the rule comparison (replay),
  not just the three motivating PRs** — per this skill's own rule for
  replacing one rule with another.

## ADRs

none — no decision met the ADR bar (see frontmatter assumption; reserved
ADR-110 is earmarked if the T4 merge gate requires one at merge time).
