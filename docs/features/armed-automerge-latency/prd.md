---
stage: prd
run: feature:armed-automerge-latency
date: 2026-10-15
prd-id: 5
ux: not-applicable
ux-reason: "CI/merge automation with no user-facing surface — the outputs are evidence on an issue, at most one workflow/script fix, and possibly a gotchas entry"
assumptions:
  - "prd-id 5 is taken from this conductor item's reserved id block (prd 5, adr 101-103, wo 46-55)."
  - "'One CI cycle' in the acceptance criterion is read as: the PR merges without any human action after the CI Gate run on its final head SHA concludes green — no fixed wall-clock bound, since CI duration varies with cache state (gotchas § CI, lockfile cold-cache entry)."
---

# PRD 5: armed Dependabot auto-merges complete on green CI

## Problem statement

GitHub auto-merge was armed on Dependabot PR #6577 eleven seconds after it
opened (2026-10-13T22:10:19Z), yet the PR merged ~24 hours later
(2026-10-14T22:20:43Z) — on a repo whose `main` is non-strict
(`{"strict": false, "contexts": ["CI Gate"]}`, measured 2026-10-14), so
being behind main is excluded as the cause. Part 7 (#6650) just made arming
the default for official-action and `@types/*` bumps; if the hold is
systemic, every one of those PRs inherits it and part 7 delivers nothing.
Nobody knows yet what held #6577 — or even whether GitHub auto-merge, a
routine, or Matt completed the eventual merge.

## Goals

1. Name #6577's hold with evidence (timeline events, run IDs), not
   hypothesis.
2. Make armed Dependabot auto-merges complete once `CI Gate` is green on
   the head SHA — or, if the hold turns out to be intended behavior,
   document it so the next reader doesn't re-diagnose it.

## Requirements

- **R1 — Root cause with evidence.** The hold is classified from #6577's
  timeline (`issues/6577/timeline`), the check runs on its head SHA, and
  the `auto-merge.yml` / `tier-classifier.yml` / `merge-queue.yml` run
  history, using the repo's own rollup vocabulary
  (`scripts/ci-gate-status.mjs`: `green`/`failed`/`pending`/`gate-missing`/
  `gate-unattributed`, plus the `action_required` park). The evidence must
  state **who performed the merge** (GitHub auto-merge vs. a routine vs. a
  human) — the mechanism differs entirely between those readings.
- **R2 — Fix or document, decided by the evidence.** If a repo-owned
  mechanism caused the hold, fix that one mechanism; any logic change is a
  pure function + unit test (the `scripts/merge-queue-eligibility.mjs`
  pattern). If the hold is intended or GitHub-side one-off, record it in
  `.claude/rules/gotchas.md` § CI instead — with the discriminating
  signature a future reader can match against. Exactly one of the two
  outcomes ships; "neither" is a failed run.
- **R3 — Review gates unweakened.** `tier:sensitive` and `needs-review`
  keep exactly their documented meanings; no change may widen what merges
  without review. A fix that works by lowering a gate is out of scope.
- **R4 — Finding recorded on issue #6651** (issue AC), stating the root
  cause and linking the evidence.
- **R5 — Observation criterion armed.** The breakdown's final item defines
  how the fix is confirmed in the wild: the next armed Dependabot
  auto-merge PR merges within one CI cycle of `CI Gate` going green on its
  head SHA, and its PR number is noted on #6651.

## Non-goals

- Changing tier policy, reviewer requirements, or merge-train behavior.
- Touching part 7's policy module, `dependabot.yml` groups, or its
  workflow's decide step.
- Rescuing non-Dependabot stuck-PR classes (`automation/*` already has
  `automation-pr-rescue.yml`); extending rescue scope is in scope **only**
  if the evidence names "no rescue path" as the mechanism that let a
  one-off hold persist.

## Success criteria

1. Issue #6651 carries a root-cause statement citing timeline events and
   run IDs (R1, R4).
2. Either a merged fix with a regression test, or a gotchas entry with the
   discriminating signature (R2) — and gates pass (`pnpm lint && pnpm
typecheck && pnpm test` on affected packages).
3. A subsequent armed Dependabot PR observed merging within one CI cycle of
   green `CI Gate`, PR number noted (R5).

## Constraints

- Evidence before mechanism: no fix lands before R1 is satisfied.
- Diagnosis requires GitHub API access; this planning session has none, so
  all R1 work executes in a credentialed Implement session.
