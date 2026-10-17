---
run: feature:ship-pr
date: 2026-10-14
---

# Autorun brief: /ship-pr skill

Collected from GitHub issue #6639 (part 5 of 6 of "SDLC speed", tracking
#6637), driven by the Conductor batch item on branch
`conductor/b20261014c-6639`. The issue is the Owner's input; this brief
restates it for the stage interviews.

## Feature description (what and why)

A project skill `/ship-pr <N>` that runs the existing implement-queue
worker→train boundary for **any** open PR, reusing the same scripts and
hooks — no second implementation of the gate. Measured during the
localization feature run (PR #6591): `/implement-queue` gives its own PRs
the full boundary (CI classification, agent-core freshness, specialist
reviewers, the `reviewer` subagent, auto-merge), while a PR opened by hand
or by an idea-to-prod Implement session gets none of it and sits green
until a human remembers.

## Run scale and slug

Feature run, slug `ship-pr`, artifacts under `docs/features/ship-pr/`.

## Idea-stage inputs

- **Problem (sufferer's view):** "My PR is green and reviewed-in-spirit,
  but nothing carries it to merge unless I remember to."
- **Who / coping today:** Matt and pipeline Implement sessions; they cope
  by manually re-checking PRs or leaning on `/implement-queue`'s boundary,
  which only serves its own PRs.
- **Why now:** measured friction from PR #6591; part of the active
  SDLC-speed batch (#6637).
- **Evidence:** #6591 sat with `CI Gate` green and no carrier (measured,
  recorded in the issue). `auto-merge.yml` only acts on `auto-merge`-labelled
  automation PRs.
- **Solution hunch:** one skill invocation that replays the exact
  worker→train boundary steps against an arbitrary PR number.
- **Success in one sentence:** any open PR can be carried from green CI to
  an armed merge with the same gates as a queue PR, in one command.
- **Unknowns / ways this dies:** CCR sessions' `[Merge Without Review]`
  permission denial; `gate-unattributed` CI states; drift between the skill
  text and the profile it mirrors.

## Scope boundaries

In: `.claude/skills/ship-pr/SKILL.md`; a CLAUDE.md § Skills table row.
Out: any new gate logic; changes to `auto-merge.yml`, the queue profile,
or the scripts themselves; cloud/CCR support beyond honoring the known
denial behavior.

## Success criteria (from the issue's acceptance criteria)

1. Skill references existing scripts by path; adds no new gate logic.
2. Draft PRs refused without `--ready`.
3. A reviewer FLAG or non-green CI classification never arms auto-merge.
4. `check-claude-md-table-drift.mjs` and `check-skill-references.mjs` pass.
5. Dry walk-through on #6591 recorded in the PR.
6. `pnpm lint && pnpm typecheck && pnpm test` (affected) pass.

## Constraints / already decided

Boundary steps follow `.claude/implement-queue.md` § ci-status, § fast-path,
§ reviewers, § merge-command. Skill shape follows
`.claude/skills/local-ci-precheck/SKILL.md`. Reserved id block for this
item: prd 2, adr 92–94, wo 16–25 — no ids outside it.

## Tracker

Yes — issue #6639 seeds the run; breakdown work items carry their issue
reference in the protocol's `(tracker: #N)` form. No other tracker
interaction from this run (this environment has no GitHub credential).

## User-facing surface

No — terminal-only project skill for the Owner/agent; `ux: not-applicable`.

## Release authorization

None needed: `stop-after: decompose` ends the run at the blueprint gate.
No release action of any kind is authorized.

## Resume 2026-10-16 — Owner extended the run past decompose

The Owner re-invoked autorun in a live session on 2026-10-16 and chose
this run, to resume at Review and continue through Ship. That answer
replaces the original `stop-after: decompose` line (removed from the
frontmatter). It is a live Owner answer, not an assumption.

Facts measured at resume:

- The skill is on `main`: `.claude/skills/ship-pr/SKILL.md`, landed by
  #6667 (conductor batch b20261014c) and #6675 (run gates and dry
  walk-through), later touched by #6794. `breakdown.md` is 4/4 checked
  and `verification.md` exists.
- No `review.md` or `release.md` exists.
- The remaining stages run in the worktree
  `/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/ship-pr-close`
  on branch `docs/ship-pr-close`, cut from `origin/main`.

**Release authorization (updated).** The change already merged, so
there is nothing left to release. Ship records the release that already
happened: which PRs landed the skill, their CI Gate result on the merge
SHAs, and how to roll back. It executes no new release action: no
deploy, merge, tag or publish.

**Review scope.** Review the skill as it stands on `main` (the #6667 and
#6675 squashes, plus #6794's change to `qualifiesForLowRiskFastPath`
that the skill relies on), against `prd.md`'s success criteria and the
queue profile `.claude/implement-queue.md` whose hooks the skill reuses.
