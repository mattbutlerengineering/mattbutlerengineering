---
stage: verify
run: feature:bootstrap-worktree
date: 2026-11-02
assumptions:
  - "SC-2 (< 5 s) is judged on the literal command `pnpm bootstrap:worktree`; the pnpm-startup share and the script's own share are reported separately because the host was heavily loaded (load average 22–45 during measurement)."
  - "Verified against the already-merged implementation (#6676, on main @ 77f84aca5, which this branch is cut from); this branch carries no product-code diff, so `turbo --affected` scopes by that fact, not by the feature's files."
---

# Verification: `pnpm bootstrap:worktree`

## Summary

7 criteria verified: 5 PASS, 1 FAIL as literally measured (SC-2, environment-confounded), 1 PARTIAL (SC-5: the targeted gates pass; the full affected turbo gate did not complete green on this overloaded host, and the two failing packages pass when re-run in isolation). The command, the pure core, the hook, the wiring and the docs all behave as the PRD specifies; the only open question is the < 5 s budget, which this host cannot confirm.

Environment: fresh worktree `.claude/worktrees/bootstrap-worktree-autorun` (no `node_modules`, no `dist/` before the run); macOS arm64, Node v22.22.3, pnpm 9.15.4 (per `packageManager`), host load average 22.8 → 45.7 while measuring.

## Criteria & evidence

### SC-1 — fresh worktree: `pnpm bootstrap:worktree` then `pnpm --dir apps/hospitality exec tsc --noEmit` passes, no TS2307

- Check: confirmed the worktree was fresh, ran the command, then the typecheck.
- Evidence (pre-state):
  ```
  ls: cannot access 'node_modules': No such file or directory
  ls: cannot access 'packages/rialto/dist': No such file or directory
  $ node scripts/bootstrap-worktree.mjs --check
  bootstrap-worktree: pending — install, then build (@mbe/agent-core, @mbe/api-client, @mbe/auth, @mbe/availability, @mbe/cancellation-policy, @mbe/database, @mbe/gh-client, @mattbutlerengineering/rialto, @mbe/rialto-catalog, @mbe/sentry, @mbe/service-bootstrap, @mbe/types, @mbe/ui-quality-capture).
  exit=0
  ```
- Evidence (bootstrap run, `( time pnpm bootstrap:worktree )`):
  ```
  Packages: +1689
  ...
   Tasks:    13 successful, 13 total
  Cached:    0 cached, 13 total
    Time:    10m29.299s
  exit=0
  real	15m59.080s
  ```
  (Install + 13 derived builds; slow only because the host was at load ~25. Rialto alone logged `✓ built in 3m 54s`.)
- Evidence (typecheck):
  ```
  $ pnpm --dir apps/hospitality exec tsc --noEmit
  (no output)
  real	12m41.365s
  tsc-exit=0
  ```
  No TS2307 (nor any diagnostic) was emitted.
- Result: PASS

### SC-2 — a second `pnpm bootstrap:worktree` with nothing to do finishes in < 5 s

- Check: timed the literal command four times, the same via `pnpm run -s`, the script via `node` directly, and bare `pnpm --version` inside and outside the repo to isolate pnpm's own startup.
- Evidence:
  ```
  $ pnpm bootstrap:worktree
  bootstrap-worktree: nothing to do.
  real	0m10.945s   user 0m1.222s
  (3 more runs)  real 0m12.251s / 0m11.788s / 0m10.885s

  $ node scripts/bootstrap-worktree.mjs        # the script alone
  bootstrap-worktree: nothing to do.
  real	0m1.365s    user 0m0.139s

  $ pnpm --version            # in repo, no script involved
  9.15.4        real 0m11.327s
  $ cd /tmp && pnpm --version
  10.26.2       real 0m8.735s
  $ node -e 0   real 0m1.035s
  ```
  Output is `nothing to do.` and no pnpm/turbo child is spawned (`user` 1.2 s ≈ pnpm's own cost). `uptime` at the time: `load average: 22.15, 23.14, 25.85`.
- Result: FAIL as literally measured (10.9–12.3 s > 5 s). Attribution: ≥ 9 s of that is `pnpm` startup on this loaded host (bare `pnpm --version` costs 8.7–11.3 s, outside the script's control); the script's own no-op path is 1.37 s wall / 0.14 s CPU. The PRD's assumption that the budget is "wall-clock on dev hardware and CI runners" could not be confirmed on an unloaded machine here — see Failures.

### SC-3 — unit tests cover `decideBootstrapSteps` for missing node_modules, stale lockfile, missing dists, nothing-to-do

- Check: ran the issue's verification command.
- Evidence:
  ```
  $ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/bootstrap-worktree.test.mjs
   ✓ scripts/__tests__/bootstrap-worktree.test.mjs (22 tests) 735ms
   Test Files  1 passed (1)
        Tests  22 passed (22)
  ```
  The breakdown's WO-6 acceptance (invalid input throws; `distConsumedPackages` main/exports/src-only/empty cases) is part of the same 22-test file.
- Result: PASS

### SC-4 — hint prints only where needed; hook exits 0 always; `hook-input.test.mjs` and `check-hook-wiring.mjs` green

- Check: ran the hook pre-bootstrap in the worktree, in the main checkout, post-bootstrap, with the script absent, with the script crashing (exit 3), and with a nonexistent project dir; ran both guards; confirmed the hook never installs; confirmed settings wiring.
- Evidence:
  ```
  # worktree, pre-bootstrap
  worktree needs bootstrap — run: pnpm bootstrap:worktree
  exit=0
  # main checkout (CLAUDE_PROJECT_DIR=/Users/mbutler/github/mattbutlerengineering)
  (no output)  exit=0
  # worktree, post-bootstrap
  (no output)  hook-exit=0
  # linked-worktree stand-in, script absent / script exits 3 / project dir nonexistent
  exit=0
  exit=0
  exit=0
  ```
  Never installs: `node_modules` and `packages/rialto/dist` were still absent after the pre-bootstrap hook ran (ls output under SC-1); the hook body invokes only `node scripts/bootstrap-worktree.mjs --check`.
  ```
  .claude/settings.json (SessionStart):
    "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-log-rotate.sh\"", "timeout": 3000
    "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/worktree-bootstrap-hint.sh\"", "timeout": 5000

  $ node scripts/check-hook-wiring.mjs
  PASS: Every file in .claude/hooks/ is referenced from settings.json, a workflow, another hook, or the allowlist.
  exit=0

  $ pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/hook-input.test.mjs
   Test Files  1 passed (1)
        Tests  58 passed (58)
  ```
- Result: PASS

### R4 / WO-9 — docs name `pnpm bootstrap:worktree`, prettier-clean

- Check: grep for the command in the two doc files; prettier on all touched files.
- Evidence:
  ```
  .claude/rules/gotchas.md:27:- **Worktree agents must run `pnpm typecheck` before declaring done** (after `pnpm bootstrap:worktree`, or workspace imports fail TS2307). #2 recurring CI failure.
  .claude/rules/gotchas.md:33:- **Worktree agents must run `pnpm bootstrap:worktree` first** (frozen install + missing workspace `dist/`; no-op when bootstrapped). `isolation: "worktree"` has no `node_modules`; #1 recurring CI failure. `implement-queue-worker` does it as step 0.
  .claude/agents/implement-queue-worker.md:40:   pnpm bootstrap:worktree && touch .worktree-installed

  $ pnpm exec prettier --check scripts/bootstrap-worktree.mjs scripts/__tests__/bootstrap-worktree.test.mjs .claude/rules/gotchas.md .claude/agents/implement-queue-worker.md .claude/settings.json package.json
  All matched files use Prettier code style!
  ```
  Root script present: `package.json:13:    "bootstrap:worktree": "node scripts/bootstrap-worktree.mjs",`. Breakdown checkboxes WO-6..WO-10 are all `[x]`.
- Result: PASS

### SC-5 — gates pass on affected packages (`pnpm lint && pnpm typecheck && pnpm test`) plus the issue's verification commands

- Check: issue verification commands (SC-3/SC-4 above, all green); `eslint` on the two script files; `bash scripts/conductor-gate.sh` (install + `turbo run lint typecheck test --affected`); re-ran the two packages that failed in isolation.
- Evidence:
  ```
  $ pnpm exec eslint scripts/bootstrap-worktree.mjs scripts/__tests__/bootstrap-worktree.test.mjs
  eslint-exit=0

  $ bash scripts/conductor-gate.sh
   ERROR  run failed: command  exited (1)
   Tasks:    11 successful, 54 total
  Cached:    10 cached, 54 total
  Failed:    @mbe/config#test
  real	4m14.688s            (load average 45.67 at the time)

  @mbe/config:test:  FAIL  eslint/local-rules.test.ts > prefer-rialto-components > valid > ...
  @mbe/config:test:  FAIL  eslint/no-literal-ui-strings.test.ts > ...   (3 more, same shape)
  @mbe/config:test: Error: Test timed out in 5000ms.
  @mbe/config:test:       Tests  5 failed | 99 passed (104)
  @mbe/types:test:  ELIFECYCLE  Test failed. See above for more details.   (turbo aborted the run)

  # re-run in isolation with a 120 s test timeout:
  $ pnpm --dir packages/config exec vitest run --testTimeout=120000
   Test Files  7 passed (7)   Tests  104 passed (104)
  $ pnpm --dir packages/types exec vitest run --testTimeout=120000
   Test Files  29 passed (29)  Tests  487 passed (487)
  ```
  The gate's five failures are 5000 ms test timeouts in ESLint rule-tester cases of `packages/config`, a package this feature does not touch; `packages/types` was in flight when turbo aborted on the first failure (its output shows passing files and a lifecycle exit, no assertion failure). Working tree stayed clean after the gate (`git status --porcelain` empty), so the non-frozen install did not modify the lockfile.
- Result: PARTIAL — targeted gates PASS; the full affected turbo gate never completed green, and the full-repo `lint`/`typecheck`/`test` sweep did not run to completion. No evidence implicates the feature, but "green" was not demonstrated end to end on this host.

### WO-7 acceptance — `--check` exits 0 before and after; second run spawns no pnpm/turbo

- Check: `--check` pre-bootstrap (SC-1 evidence) and post-bootstrap.
- Evidence:
  ```
  pre : bootstrap-worktree: pending — install, then build (...).   exit=0
  post: $ node scripts/bootstrap-worktree.mjs --check
        bootstrap-worktree: nothing to do.   exit=0
  ```
  "Spawns no pnpm/turbo" on the no-op path: `real 1.365s user 0.139s` for the bare node run (SC-2); not separately strace'd.
- Result: PASS

## Failures

1. **SC-2 — literal `pnpm bootstrap:worktree` no-op takes 10.9–12.3 s on this host (budget < 5 s).** Root cause observed: pnpm's own startup (`pnpm --version` alone: 8.7–11.3 s) under load average 22–45; the script contributes 1.37 s. No defect in the product code is evident, but the success criterion as written is not met by this measurement. Route: Owner decision — either re-measure on an unloaded machine/CI runner (the PRD's stated measurement basis) or, if pnpm startup is the real floor, restate SC-2 as the script's own no-op cost. Nothing was changed.
2. **SC-5 (partial) — full affected gate not demonstrated green.** `@mbe/config#test` timed out under load (5 × 5000 ms) and aborted the turbo run; both failing packages pass in isolation (104/104, 487/487). Route: re-run `bash scripts/conductor-gate.sh` on an idle host before Ship if a clean gate is required.

## Not verified

- SC-2 on unloaded hardware or a CI runner — host load was 22–45 throughout.
- Full `pnpm lint && pnpm typecheck && pnpm test` across the repo (only the targeted checks, eslint/prettier on the feature files, and the two re-run packages ran).
- Staleness detection across clones (brief's "mtimes flaky" risk): the stale-lockfile branch is covered only by the pure-function unit tests, not by touching `pnpm-lock.yaml` in a real worktree.
- The hook firing through Claude Code's real SessionStart machinery; it was exercised by hand via `CLAUDE_PROJECT_DIR`, and the wiring guard confirms the settings entry.
- No-spawn property of the no-op path was inferred from `user 0.139s` and the `nothing to do.` output, not traced.
