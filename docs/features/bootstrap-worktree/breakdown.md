---
stage: decompose
run: feature:bootstrap-worktree
date: 2026-10-14
assumptions:
  - "Cut taken as drafted with no live review (unattended autorun): one pure-core item first, then CLI, then hook, then docs, then the acceptance sweep — dependency-ordered vertical slices, the skill's recommended default."
  - "No tracker export: work items carry no (tracker: #N) refs, so no merge auto-closes #6634 (the batch's build steps own closing it). WO ids are from the item's reserved block; WO-11..WO-15 stay unused."
---

# Breakdown: bootstrap-worktree

Progress lives in the checkboxes — Implement checks items off as acceptance
criteria are met. Conventions for every item: TDD (failing test first); unit
tests live in `scripts/__tests__/bootstrap-worktree.test.mjs` and run via
`pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/bootstrap-worktree.test.mjs`;
gate per item: `bash scripts/conductor-gate.sh`.

## Milestone 1: pure core (SC-3)

- [x] **WO-6. `decideBootstrapSteps` + `distConsumedPackages`** — create
      `scripts/bootstrap-worktree.mjs` exporting both pure functions
      (architecture.md §1, node builtins only), with the test file written
      first and failing.
  - Accept: tests cover — missing node_modules → install step; stale lockfile
    (`lockNewer: true`) with node_modules present → install step; missing
    dists → build step naming exactly those packages; install ordered before
    build when both apply; nothing-to-do → `[]`; invalid input (non-boolean
    flag, non-array `missingDists`) throws. `distConsumedPackages` cases: a
    package with `main: "dist/index.js"` qualifies; `exports` with nested
    dist leaves qualifies; a package with only `src/` entrypoints does not;
    empty workspace → `[]`.
  - Blocked by: —

## Milestone 2: the command works end to end (SC-1, SC-2)

- [ ] **WO-7. Probes + CLI + `bootstrap:worktree` script** — fs probe layer
      (workspace globs, mtime staleness via `.modules.yaml` receipt, dist
      existence), `--check` mode, step execution via `execFileSync`
      (`pnpm install --frozen-lockfile`; `pnpm exec turbo run build` with one
      `--filter=<pkg>` per missing dist), and the root `package.json` script.
  - Accept: in this worktree (fresh, no node_modules):
    `pnpm bootstrap:worktree` runs install + builds, then
    `pnpm --dir apps/hospitality exec tsc --noEmit` exits 0 with no TS2307
    (SC-1); an immediate second run prints the no-op decision and finishes
    < 5 s wall-clock, spawning no pnpm/turbo (SC-2 — quote the `time`
    output); `node scripts/bootstrap-worktree.mjs --check` exits 0 both
    before and after.
  - Blocked by: WO-6

## Milestone 3: sessions discover it (SC-4)

- [ ] **WO-8. SessionStart hint hook** —
      `.claude/hooks/worktree-bootstrap-hint.sh` (linked-worktree test,
      `--check` probe, one-line hint, unconditional `exit 0`) wired in
      `.claude/settings.json` beside `session-log-rotate.sh` with the same
      command shape and a timeout.
  - Accept: run by hand — in this worktree pre-bootstrap it prints exactly
    one line naming `pnpm bootstrap:worktree`; post-bootstrap it prints
    nothing; in the main checkout it prints nothing; with the script deleted
    it still exits 0. `node scripts/check-hook-wiring.mjs` passes and
    `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/hook-input.test.mjs`
    stays green.
  - Blocked by: WO-7

## Milestone 4: docs follow the tool (R4)

- [ ] **WO-9. Re-point gotchas + worker step 0** — edit the
      `.claude/rules/gotchas.md` § Build / pnpm / turbo worktree-install
      bullet (and the pre-push/typecheck worktree bullet) and
      `.claude/agents/implement-queue-worker.md` step 0 to name
      `pnpm bootstrap:worktree` as the action, keeping each bullet's context
      and warnings intact.
  - Accept: both files name the command; no other prose claims removed;
    `grep -n "bootstrap:worktree" .claude/rules/gotchas.md .claude/agents/implement-queue-worker.md`
    shows the edits; prettier-clean (docs poison the next Build otherwise —
    gotchas § CI).
  - Blocked by: WO-7 (the command must exist before docs point at it)

## Milestone 5: acceptance sweep (SC-5)

- [ ] **WO-10. Gates + issue verification commands** — run the issue's
      verification block verbatim (`pnpm install --frozen-lockfile`; the
      vitest run of `bootstrap-worktree.test.mjs`;
      `node scripts/check-hook-wiring.mjs`) plus
      `bash scripts/conductor-gate.sh`, and record outputs in the run's
      `verification.md` when that stage runs.
  - Accept: all commands exit 0 (or any failure is quoted and fixed before
    check-off); breakdown checkboxes WO-6..WO-9 are all `[x]`.
  - Blocked by: WO-6, WO-7, WO-8, WO-9

## Notes

- WO-11..WO-15, PRD ids past PRD-1, and ADR 89-91 are unused — reserved block
  returns to the Conductor.
- The hook deliberately shares `--check` with the CLI so "needs bootstrap"
  has one definition (architecture.md Decisions).
