---
stage: idea
run: feature:ship-pr
date: 2026-10-14
assumptions:
  - "In-flight duplicate check could not run: this environment carries no
    GitHub credential (no gh, no PR list). Proceeding on the Conductor's
    claim of issue #6639; the issue was created by /decompose for the
    sdlc-speed feature and is tracked by #6637."
  - "Open-PR pre-flight could not run for the same reason; reported, not
    silently skipped."
---

# Idea: /ship-pr — carry any green PR through the worker→train boundary

## Problem

"My PR is green, but nothing moves it. `/implement-queue` would have
classified its CI, run the right specialist reviewers, scored it, and armed
auto-merge — but it only does that for its own PRs. Mine just sits there
until I remember it exists."

## Who has it

- **Matt (Owner)** — opens PRs by hand; today he re-checks them manually or
  merges on gut feel.
- **idea-to-prod Implement sessions** — open PRs as part of a run; today
  the run ends with an open PR and a note asking a human to merge.

Both cope by remembering, which is the failure mode being measured.

## Why now

Measured during the localization feature run: PR #6591 sat with `CI Gate`
green and nothing to carry it to merge. This is part 5 of 6 of the
SDLC-speed batch (tracking #6637) — the loop's other friction points are
being removed in sibling items, and this is the merge-side gap.

## Evidence

- PR #6591 (measured, cited in issue #6639): green `CI Gate`, no carrier.
- `auto-merge.yml` acts only on `auto-merge`-labelled automation PRs — by
  design, so hand-opened PRs are structurally excluded.
- The full boundary already exists and runs daily for queue PRs:
  `classifyCiGateStatus` (`scripts/ci-gate-status.mjs`), the agent-core
  freshness check, `reviewersForDiff` specialists, the `reviewer`
  subagent, then `gh pr merge --auto --squash --delete-branch`
  (`.claude/implement-queue.md`).

## Solution hunch

A project skill `/ship-pr <N>`: replay the exact boundary steps against an
arbitrary open PR, reusing the same scripts and profile sections — a
protocol document, not a second implementation.

## Success in one sentence

Any open PR can be carried from green CI to an armed merge with the same
gates as a queue PR, in one command.

## Unknowns & risks

- CCR sessions deny autonomous merges (`[Merge Without Review]`, #6125) —
  the skill must stop cleanly there, not retry.
- `gate-missing` / `gate-unattributed` CI states need the profile's exact
  recovery, or the skill silently diverges from the queue's behavior.
- Drift: the skill mirrors `.claude/implement-queue.md`; if the profile
  changes, a skill that restates it goes stale. (Mitigation lives in the
  design: reference, don't restate.)
