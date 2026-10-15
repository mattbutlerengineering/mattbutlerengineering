---
stage: prd
run: feature:ship-pr
date: 2026-10-14
ux: not-applicable
ux-reason: terminal-only project skill; no user-facing UI surface
assumptions:
  - "Brief answered all interview questions; no live user input. Scope,
    actors and criteria taken from issue #6639 verbatim where it speaks."
  - "Local sessions only: CCR/cloud sessions cannot merge ([Merge Without
    Review], gotchas § Claude Code Remote), so the skill targets local
    sessions and must stop cleanly, without retrying, if that denial fires."
---

# PRD: /ship-pr — one-command worker→train boundary for any open PR

## Problem statement

A PR opened by hand or by an idea-to-prod Implement session gets none of
the merge machinery `/implement-queue` gives its own PRs. It sits with
`CI Gate` green until a human remembers it (measured on PR #6591).

## Solution

A project skill `/ship-pr <N>` that replays the existing worker→train
boundary — CI classification, agent-core freshness, specialist reviewers,
the `reviewer` subagent, then auto-merge — against any open PR, reusing the
same scripts and profile sections. No second implementation of the gate.

## Actors

- **Owner (Matt)** — invokes `/ship-pr <N>` on a hand-opened PR.
- **Pipeline session** — a local Claude session finishing a run invokes it
  to carry the run's PR to merge under the standard gates.

## User stories

1. As the Owner, I want `/ship-pr <N>` to classify, review and arm merge on
   my PR exactly as the queue would, so that green PRs stop waiting on my
   memory.
2. As a pipeline session, I want one skill that ends a run with the PR
   gated and armed, so that runs don't end in "a human should merge this".
3. As the Owner, I want draft PRs refused unless I pass `--ready`, so that
   unfinished work is never armed by accident.

## Success criteria

- [ ] The skill references the existing functions/scripts by path and adds
      no new gate logic (`grep` the skill for `ci-gate-status.mjs`,
      `agent-core-build-freshness.mjs`, `reviewersForDiff`).
- [ ] Draft PRs are refused without `--ready`; with it, `gh pr ready <N>`
      runs first.
- [ ] Only a `green` CI classification proceeds; `gate-missing` dispatches
      `ci.yml` and re-polls per the profile; anything else stops with the
      classification named.
- [ ] A reviewer FLAG or a non-green classification never arms auto-merge.
- [ ] On PASS: `gh pr merge <N> --auto --squash --delete-branch`, or a
      direct merge when GitHub reports `CLEAN` and refuses `--auto`.
- [ ] One-screen summary printed: CI classification, reviewers run +
      verdicts, merge action taken.
- [ ] `node scripts/check-claude-md-table-drift.mjs` and
      `node scripts/check-skill-references.mjs` pass.
- [ ] Dry walk-through on #6591 recorded in the implementation PR.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass (affected packages).

## Out of scope

- Any new gate logic, scripts, or classifiers — reuse only.
- Changes to `auto-merge.yml`, `.claude/implement-queue.md`, or the gate
  scripts themselves.
- Cloud/CCR merge support (the environment denies autonomous merges).
- Auto-labelling, tier changes, or batch operation over multiple PRs.

## Open questions

- None blocking. Whether the skill should also surface the tier label it
  observed is a nice-to-have for the implementer's summary step.
