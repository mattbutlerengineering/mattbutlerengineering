---
stage: prd
run: feature:bootstrap-worktree
date: 2026-10-14
prd: PRD-1
ux: not-applicable
ux-reason: developer/agent tooling only — a CLI command, a one-line hook hint, and doc edits; no user-facing screens or flows
assumptions:
  - "Scope, file list and acceptance criteria taken verbatim from issue #6634 (the brief's interview source); no live Owner to re-confirm them."
  - "The <5s no-op budget is read as wall-clock on this repo's dev hardware and CI runners, measured by the unit test's caller or by hand — no perf harness is built for it."
---

# PRD-1: `pnpm bootstrap:worktree`

One idempotent command that takes a fresh (or stale) git worktree of this
monorepo to a state where typecheck, tests and builds can run — plus a
SessionStart hint so sessions discover it, and docs that point at it instead
of describing the steps in prose.

## Requirements

**R1 — the command.** `pnpm bootstrap:worktree` (root `package.json` script →
`scripts/bootstrap-worktree.mjs`) idempotently:

- runs `pnpm install --frozen-lockfile` when `node_modules` is missing **or**
  older than `pnpm-lock.yaml`;
- then builds, via turbo, the workspace packages that apps consume through
  `dist/` artifacts — the list is **derived** from the workspace (never a
  hardcoded rialto-only list) — when any such `dist/` is missing.

**R2 — pure core.** The what-to-do decision is a pure function,
`decideBootstrapSteps({ hasNodeModules, lockNewer, missingDists })`, returning
the ordered step list; the CLI is a thin wrapper (pattern:
`scripts/reap-worktrees.mjs`'s `decideWorktreeReap`). The script runs on node
builtins only, so it works in a worktree _before_ any install.

**R3 — the hint hook.** `.claude/hooks/worktree-bootstrap-hint.sh`, wired in
`.claude/settings.json` under SessionStart beside `session-log-rotate.sh`:
when the project dir is a linked worktree that needs bootstrap, print exactly
one line naming `pnpm bootstrap:worktree`. It never runs the install itself
(hook timeout) and exits 0 in every case, including failure of its own
detection.

**R4 — docs follow the tool.** The worktree bullets in
`.claude/rules/gotchas.md` and step 0 of
`.claude/agents/implement-queue-worker.md` name `pnpm bootstrap:worktree` as
the way to do what they currently describe as manual steps (the prose context
stays; the instruction becomes the command).

## Out of scope

Auto-running installs from the hook; turbo/pnpm config changes; worktree
reaping; CI workflow changes; the other three sdlc-speed parts.

## Success criteria

- **SC-1** — in a fresh worktree: `pnpm bootstrap:worktree` then
  `pnpm --dir apps/hospitality exec tsc --noEmit` passes with no TS2307.
- **SC-2** — a second `pnpm bootstrap:worktree` with nothing to do finishes
  in < 5 s.
- **SC-3** — unit tests cover `decideBootstrapSteps` for: missing
  node_modules, stale lockfile, missing dists, and nothing-to-do.
- **SC-4** — the hint prints only in a worktree that needs it; the hook exits
  0 in all cases; `scripts/__tests__/hook-input.test.mjs` and
  `node scripts/check-hook-wiring.mjs` stay green.
- **SC-5** — gates pass on affected packages: `pnpm lint && pnpm typecheck &&
pnpm test`, plus the issue's verification commands
  (`pnpm exec vitest run --config scripts/vitest.config.mjs
scripts/__tests__/bootstrap-worktree.test.mjs`).
