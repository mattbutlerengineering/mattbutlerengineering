---
stage: idea
run: feature:armed-automerge-latency
date: 2026-10-15
assumptions:
  - "Evidence is adopted from issue #6651 verbatim, not re-measured: this environment has no GitHub credential (no gh, no API), so #6577's arming/merge timestamps, labels, and the non-strict branch-protection measurement are cited as the issue's own 2026-10-14 measurements."
  - "The open-PR pre-flight and the in-flight duplication check could not run (same credential gap). Recorded visibly per protocol; the issue's 'Parallel-safe: yes with parts 1–6' line and the conductor batch plan are the standing mitigation."
---

# Idea: an armed auto-merge that doesn't merge is a silent no-op

## Problem, from the sufferer's view

Matt — or the autonomous SDLC acting for him — arms GitHub auto-merge on a
Dependabot PR and walks away trusting it to land on green CI. PR #6577
(`dev-deps` group) was armed at 2026-10-13T22:10:19Z, eleven seconds after
opening, and merged at 2026-10-14T22:20:43Z — ~24 hours later. Nothing was
red, nothing asked for help; the PR just sat. An armed-but-held PR is
indistinguishable at a glance from one legitimately waiting on CI, so the
hold costs a full day before anyone notices it cost anything.

## Who has it, and how they cope today

Matt, the only human merge path in an otherwise autonomous SDLC. Coping is
the same batch hand-merging that part 7 (#6650, run
`feature:dependabot-auto-merge`) was built to retire — and it is not yet
known whether #6577's eventual merge was GitHub auto-merge finally
completing or a hand/routine merge papering over the hold. That distinction
is the first thing the diagnosis must settle.

## Why now

Part 8 of 8 of **sdlc-speed** (tracking #6637). Part 7 just widened the
armed population: official-action and `@types/*` bumps now arm themselves on
open. Every one of those inherits #6577's hold if it is systemic — "if
whatever held #6577 also holds part 7's newly auto-merged updates, part 7
delivers nothing" (issue #6651). Arming is not merging; part 7's value is
gated on this run's answer.

## Evidence the problem is real

One fully-timestamped case, from issue #6651's own 2026-10-14 measurement
(cited, not re-measured — see frontmatter): armed 2026-10-13T22:10:19Z,
merged 2026-10-14T22:20:43Z, labels `dependencies`, `tier:sensitive`,
`agent-authored`. The obvious innocent explanation is already excluded by
measurement: `main` is non-strict (`{"strict": false, "contexts":
["CI Gate"]}`), so being behind main cannot have blocked it. A single case,
labelled as such — but a 24 h hold on the exact PR class part 7 targets.

## The hunch (shape of a solution, not a design)

Diagnosis before mechanism. The repo already owns the classifier for this
(`scripts/ci-gate-status.mjs`: `green` / `failed` / `pending` /
`gate-missing` / `gate-unattributed`), and gotchas § CI already documents
four candidate mechanisms, each leaving a distinct timeline signature:

1. **`CI Gate` never attributed on the head SHA** (`gate-missing` /
   `gate-unattributed`, #3969/#4023) — auto-merge waits forever on a check
   that exists but isn't seen, or never ran.
2. **Run parked `action_required`** (#3684) — a visible pending run awaiting
   manual workflow approval; auto-merge waits on it.
3. **A workflow disarming or re-gating the PR** — `merge-queue.yml` on
   `tier:sensitive` (its `decideAutoMergeAction` is supposed to disable only
   on `needs-review`, #5983/#6199 — verify it behaved).
4. **No rescue path** — `automation-pr-rescue.yml` only sweeps `automation/*`
   branches carrying the `auto-merge` label; Dependabot branches are
   `dependabot/**` with no label, so a one-off delivery failure on them is
   permanent until a human notices.

Pull #6577's timeline, head-SHA check runs, and the `auto-merge.yml` /
`tier-classifier.yml` / `merge-queue.yml` run history; classify; then either
fix the one named cause (pure function + regression test, in whichever of
`auto-merge.yml` / `merge-queue.yml` / `merge-queue-eligibility.mjs` /
rescue scope the evidence indicts) or record the hold as intended in
`.claude/rules/gotchas.md`. Never by weakening what `tier:sensitive` means.

## Success, in one sentence

The next armed Dependabot auto-merge PR merges within one CI cycle of
`CI Gate` going green, and #6577's root cause is stated with evidence
(timeline events / run IDs) on issue #6651.

## Biggest unknowns / ways this dies

- **Who completed the merge** — if a human or the evening routine merged
  #6577, the 24 h is queue latency, not a GitHub hold, and the fix lives in
  a different place than any of the four hypotheses.
- **One-off vs systemic** — a transient event-delivery failure yields a
  gotchas entry plus the observation criterion, not a code fix; forcing a
  code fix onto a one-off would be machinery without a mechanism.
- **Credential gap** — all evidence-gathering needs GitHub API access this
  session lacks; the whole diagnosis lands in Implement-stage work orders
  for a credentialed session, and this run's artifacts must make those
  orders executable without re-deriving context.
