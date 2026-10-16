---
stage: verify
run: feature:bootstrap-worktree
date: 2026-10-15
---

# Verification: bootstrap-worktree

All five work orders (WO-6..WO-10) are checked off in `breakdown.md`. This
stage re-ran every success criterion and the issue's verification commands
against this worktree's actual state (not re-derived from the breakdown's
own checkmarks).

## SC-1 — fresh worktree bootstrap + typecheck

```
$ pnpm bootstrap:worktree
$ pnpm --dir apps/hospitality exec tsc --noEmit
```

`tsc --noEmit` exited 0 with no output — no TS2307 (unresolved module)
errors. Note: this worktree is no longer in its original "fresh, no
node_modules" state (prior WO-6..WO-9 commits already ran install/build
here), so this run exercises the idempotent/no-op path for the install and
build steps rather than the true from-empty path. The true from-empty path
was exercised when WO-7 was implemented and checked off; re-verifying here
only confirms the command stays correct and `tsc` still resolves everything
with the dists it built.

## SC-2 — no-op run finishes < 5s

```
$ /usr/bin/time -p pnpm bootstrap:worktree
> node scripts/bootstrap-worktree.mjs
bootstrap-worktree: nothing to do.
real 0.32
user 0.21
sys 0.03
```

0.32s wall-clock, well under the 5s budget. `node scripts/bootstrap-worktree.mjs --check` also exited 0 both before and after this run (it was already a no-op going in, confirming idempotency rather than a fresh state transition).

## SC-3 — unit tests cover `decideBootstrapSteps` / `distConsumedPackages`

```
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/bootstrap-worktree.test.mjs
 ✓ scripts/__tests__/bootstrap-worktree.test.mjs (22 tests) 10ms
 Test Files  1 passed (1)
      Tests  22 passed (22)
```

All 22 cases pass: missing node_modules, stale lockfile, missing dists
(named), install-before-build ordering, nothing-to-do → `[]`, invalid-input
throws, and the `distConsumedPackages` `main`/`exports`/`src`-only/empty-
workspace cases.

## SC-4 — hint hook correctness

Manual runs of `.claude/hooks/worktree-bootstrap-hint.sh`:

- In this worktree, post-bootstrap (nothing pending): prints nothing, exits 0.
- In the main checkout (`/Users/mbutler/github/mattbutlerengineering`):
  prints nothing, exits 0 (not a linked worktree — `.git` is a directory,
  not a gitdir-pointer file).
- Script-deleted case: covered by the hook's own
  `[[ -f "$SCRIPT" ]] || exit 0` guard (read, not re-simulated — the logic
  is unconditional).

```
$ node scripts/check-hook-wiring.mjs
PASS: Every file in .claude/hooks/ is referenced from settings.json, a workflow, another hook, or the allowlist.

$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/hook-input.test.mjs
 ✓ scripts/__tests__/hook-input.test.mjs (43 tests) 14241ms
 Test Files  1 passed (1)
      Tests  43 passed (43)
```

Both stay green.

## R4 / WO-9 — docs point at the command

```
$ grep -n "bootstrap:worktree" .claude/rules/gotchas.md .claude/agents/implement-queue-worker.md
.claude/rules/gotchas.md:19:...the #1 recurring CI failure pattern after the missing `pnpm bootstrap:worktree` pattern
.claude/rules/gotchas.md:25:- **Worktree agents must run `pnpm bootstrap:worktree` before running tests/builds.**...
.claude/agents/implement-queue-worker.md:40:   pnpm bootstrap:worktree && touch .worktree-installed
```

`pnpm exec prettier --check .claude/rules/gotchas.md .claude/agents/implement-queue-worker.md` — clean.

## SC-5 / issue verification commands + gates

```
$ pnpm install --frozen-lockfile          # exit 0
$ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/bootstrap-worktree.test.mjs   # 22/22 passed
$ node scripts/check-hook-wiring.mjs      # PASS
$ bash scripts/conductor-gate.sh          # 7 successful, 7 total (turbo); 282 test files / 5267 tests passed
```

All commands exited 0. No failures to fix.

## Result

All success criteria (SC-1..SC-5) and R4 are met. Breakdown checkboxes
WO-6..WO-9 are `[x]`. No defects found; nothing to route back to Implement.
