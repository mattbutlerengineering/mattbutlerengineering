---
stage: idea
run: feature:bootstrap-worktree
date: 2026-10-14
assumptions:
  - "Autorun-driven from issue #6634's brief; stages run inline rather than one subagent per stage (this Worker's tool policy has no Agent tool), with the artifacts as the only inter-stage state."
  - "The protocol's work-in-flight and open-PR pre-flights could not run: no GitHub credential and gh is forbidden in this Worker. Recorded, not skipped silently; the Conductor session owns batch-level duplication and PR drain."
---

# Idea: bootstrap a fresh worktree in one command

## Problem

A fresh `git worktree` of this monorepo is unusable until two undocumented-in-code
steps run: `pnpm install --frozen-lockfile`, then a turbo build of the workspace
packages that apps consume via `dist/`. Until both happen, `tsc` in
`apps/hospitality` fails with `TS2307: Cannot find module
'@mattbutlerengineering/rialto'` on every page — a failure that looks like a
code defect, not an environment gap.

## Who has it, and how they cope today

Every worktree-spawned agent (conductor Workers, implement-queue workers) and
Matt when opening a worktree by hand. Coping is all prose: gotchas.md's
"#1 recurring agent failure" bullets, agent prompts that prepend the install
step, and `implement-queue-worker`'s step 0. Nothing makes the fix executable
or automatic, so every new session rediscovers it.

## Why now

Measured, not anecdotal: during the localization run (2026-10-13/14, PR #6591)
a fresh worktree failed typecheck on every page _after_ `pnpm install`, until
deps were built via turbo — the second half of the fix is the part the prose
coping strategies mostly omit. Issue #6634 names this as part 2 of 4 of the
sdlc-speed feature.

## Evidence the problem is real

- gotchas.md § Build / pnpm / turbo: missing `pnpm install` in worktrees is
  "the #1 recurring CI failure pattern across agent sessions"; missing
  typecheck is #2.
- Same section: missing `packages/agent-core/dist` makes `mbe pack`/regen
  fail (`ERR_MODULE_NOT_FOUND`) — loudly or _silently_ depending on path —
  which is this exact class (unbuilt workspace `dist/`) biting a different
  consumer.
- PR #6591's run log (the measurement that seeded #6634).

## Rough shape of a solution (hunch, not design)

One idempotent command — `pnpm bootstrap:worktree` — that decides what a
worktree needs (install missing/stale? which `dist/`-consumed packages are
unbuilt?) via a pure, unit-tested function and then runs only those steps; a
SessionStart hook that prints a one-line hint naming the command when the
session starts in a worktree that needs it (never running the install itself,
always exiting 0); gotchas.md and the worker agent's step 0 re-pointed at the
command.

## Success statement

In a fresh worktree, `pnpm bootstrap:worktree` then
`pnpm --dir apps/hospitality exec tsc --noEmit` passes with no TS2307, and a
second run with nothing to do finishes in under 5 seconds.

## Biggest unknowns / ways this dies

- Deriving the dist-consumed package list wrongly: a miss leaves TS2307 alive;
  over-inclusion makes the no-op path slow and erodes trust in the command.
- mtime-based staleness (node_modules vs `pnpm-lock.yaml`) misfiring on fresh
  clones or after checkout operations that touch mtimes.
- The hook colliding with the hook guards (`scripts/__tests__/hook-input.test.mjs`,
  `scripts/check-hook-wiring.mjs`) or exceeding SessionStart timeout budgets.
