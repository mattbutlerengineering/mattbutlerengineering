---
stage: idea
run: feature:zone-batch-nonstrict-main
date: 2026-10-14
assumptions:
  - "Pre-flight 'Open pull requests first' and the in-flight duplication guard could not run: this environment carries no GitHub credential (no gh, no API). Recorded per protocol rather than silently skipped; the Conductor session owns the PR queue."
---

# Idea: same-zone batching when `main` is not strict

## Problem (sufferer's view)

An implement-queue session has 3 worker slots free and 14 `ready` issues
to drain — but 14 of them sit in the `apps/hospitality` zone
(localization issues #6612–#6630), so ADR-023's one-issue-per-zone rule
hands out **one** per batch. The operator (or Conductor) pays wall-clock
serialization for a hazard that no longer exists: the rule's whole
rationale is ADR-016's strict `main`, and `main` is measured non-strict.

## Who has it, coping today

`/idea-to-prod:implement-queue` sessions and the Conductor batches. They
cope by running more batches — each one claims a single issue from the
hot zone and idles the other slots.

## Why now

Issue #6640 (part 6 of 6, tracking #6637 "SDLC speed") filed it with a
fresh measurement, and the localization backlog makes the cost concrete
this week.

## Evidence (labelled)

- **Measured:** `gh api …/branches/main/protection/required_status_checks`
  → `{"strict": false, "contexts": ["CI Gate"]}` (2026-10-14 in the
  issue; same value recorded 2026-08-17 in gotchas § CI, which also
  warns this is repo _state_, not repo code — re-measure before relying
  on it, which is exactly what the proposed live probe does).
- **Measured (backlog shape):** 14 of 19 localization issues share the
  `apps/hospitality` zone (issue #6640).
- **Design-time record:** ADR-023's own Alternatives section rejected
  "make `main` non-strict" — the world made that choice anyway, so the
  batching rule is defending a gate that moved.

## Solution hunch (not a design)

Let `selectZoneSpreadBatch` accept `{ strictMain }` (default `true`,
today's behaviour). When `false`, admit same-zone issues whose expected
file sets are disjoint, keeping zone-spread as the tie-breaker and the
single-global-slot rule intact. The compose hook reads `strict` from the
branch-protection API each iteration and fails closed to
`strictMain: true` on any error. Record the policy as a new ADR amending
ADR-023 (never rewriting it).

## Success, one sentence

With `strictMain: false`, three same-zone issues with disjoint scopes
form one batch; with the default, every existing test's output is
unchanged.

## Biggest unknowns / ways this dies

- **Stale-base merges are real** — ADR-023 cited them as the reason to
  keep strict. But that exposure exists today for _any_ two PRs in
  flight regardless of batching; main's push CI plus `revert-watchdog`
  are the standing mitigation, and the ADR amendment must say so
  explicitly rather than pretend the risk is new or newly closed.
- **"Expected file sets" are estimates** from issue text. Overlap
  detection that under-approximates must defer (one-per-zone), never
  stack overlapping work — fail toward today's behaviour.
- **Matt's gate:** this amends active merge policy; the issue was
  deliberately filed without `ready`. The run stops at the blueprint
  gate (Decompose) for his decision.
