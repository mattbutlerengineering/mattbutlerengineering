---
stage: idea
run: feature:tier-escalation-false-positives
date: 2026-10-14
assumptions:
  - "Run is autorun-driven from autorun-brief.md (issue #6655); every interview answer below is quoted or condensed from that issue, not from a live interview."
  - "The protocol's open-PRs-first pre-flight and work-already-in-flight guard could not run: no GitHub credential or listing tool in this session. Recorded as not-run. Duplication risk is low — the Conductor reserved this item its own branch and id block."
---

# Idea: Stop tier-classifier escalations from manufacturing human review

## Problem

From the merge queue's perspective: PRs that need no human sit blocked waiting
for one. `tier:standard|sensitive|critical` blocks auto-merge by design, but
two of the classifier's escalation rules promote PRs on signals that are not
about the change — total added lines including generated artifacts, and any
prose mention of secrets/credentials/leak/rotate/incident. Each false
escalation costs a human a review that defends nothing, and costs the queue
hours-to-days of latency.

## Who has it

Matt, as the only human reviewer this repo has — every false T3/T4 is his
queue time. Secondarily the automation itself: `merge-queue.yml` and
`/idea-to-prod:implement-queue` treat tier labels as holds, so worker PRs
stall behind escalations their diffs never earned. Coping today is manual:
Matt reads the PR, concludes the tier is noise, and merges anyway.

## Why now

Measured 2026-10-14: 3 of the 4 open PRs wait on a human because of tier, and
two of those escalations are classifier false positives (#6610, #6541). This
is part 10 of the SDLC-speed batch (#6637) — queue latency is the thing the
batch exists to cut, and tier noise is now one of its largest measured
sources.

## Evidence

- #6610: 2198 added lines = 1194 generated (`llms*.txt`) + 16 docs + 988
  code → size rule escalated T3→T4 ("escalate one tier: 2058 lines added").
  Excluding generated lines it stays T3. The classifier itself labels those
  same files "T1: auto-generated".
- #6591: 2776 added = 446 generated + 943 docs + 1387 code → T4 either way
  (legitimately >1000 code lines), but 1389 counted lines are not review
  surface.
- #6541: docs + one app file, escalated by the keyword rule on the
  descriptive sentence "…`E2E_AUTH0_*` credentials or CI/artifact access…".
- Precedent that the fix shape works: the bypass rule had exactly this
  mention-vs-request flaw and was fixed by requiring a request cue
  (#3919 → #3921), validated by replaying 300 PR bodies.

All measurements are from issue #6655 (filed 2026-10-14), not re-measured
here — this session cannot query GitHub.

## Solution hunch

Extract the two escalation decisions from the inline workflow script into a
pure, unit-tested module the workflow calls. Size: count only review-surface
additions (exclude what the classifier already calls generated). Keyword:
require an incident signal (title placement or an incident cue in the same
sentence), keeping the sensitive-path hard-set gate. Prove safety the way
#3921 did: replay old vs new over the last 300 PRs and pin every changed
verdict with a test.

## Success in one sentence

No PR is escalated a tier by generated lines or by a descriptive mention of a
security word, while every genuinely large or genuinely incident-signalling
PR keeps its escalation — demonstrated by the 300-PR replay and pinned tests.

## Unknowns & risks

- Replay needs GitHub API access (title, body, per-file additions for 300
  PRs); which environment runs it, and whether per-file additions are cheap
  to fetch at that volume, is Implement's problem to solve.
- The incident-cue vocabulary is a judgment call: too narrow and a real
  incident sails through un-escalated (the expensive direction); the title
  backstop and sensitive-path gate bound that risk but don't erase it.
- This edits `tier-classifier.yml`, itself T4 by its own path rules — the
  implementation PR needs Matt regardless; issue #6655 is deliberately not
  `ready` until he approves.
- `*.md` counting policy could surprise: excluding run artifacts means a
  docs-heavy PR reads smaller to the size rule than to a human scrolling it.
