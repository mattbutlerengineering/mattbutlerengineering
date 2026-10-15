# Autorun brief — bootstrap-worktree

Collected 2026-10-14 from issue #6634 (conductor batch b20261014c, item spec
step). Not a pipeline artifact. The issue body is the interview source; the
Owner is not present in this session.

stop-after: decompose

## Run

- **Scale:** feature run, slug `bootstrap-worktree`, dir
  `docs/features/bootstrap-worktree/`.
- **Worktree / branch:** `.claude/worktrees/conductor-b20261014c-6634`, branch
  `conductor/b20261014c-6634`, cut from `origin/main` @ `17010ecf5`.
- **Origin:** GitHub issue #6634 — part 2 of 4 of the sdlc-speed feature
  ("remove measured friction from the build → commit → push → queue loop").
  The issue stays open past this run: this spec step stops at the blueprint
  gate (`stop-after: decompose` above) and build steps implement the
  breakdown later in the batch. Nothing here may auto-close #6634.
- **Reserved ids (from the item's block):** PRD-1, ADR 89–91, WO-6–WO-15.
  Ids outside this block must not be minted; if the block runs out, stop.
- **In-flight / open-PR pre-flight:** **could not run** — this Worker
  carries no GitHub credential and its tool policy forbids `gh`. Recorded
  here per protocol (a check whose failure looks like a clean result is
  worse than no check). Batch-level duplication and PR drain are owned by
  the Conductor session.
- **Tracker interaction:** none. No issues are created or edited; work items
  carry no `(tracker: #N)` refs so no merge auto-closes #6634.

## Idea-stage inputs

- **Problem (sufferer's view — any agent or human in a fresh worktree):** a
  fresh `git worktree` has no `node_modules` and no built workspace `dist/`,
  so the first typecheck/test run fails confusingly (`TS2307: Cannot find
module '@mattbutlerengineering/rialto'` on every page) and the session
  burns time rediscovering the same two-step fix.
- **Who has it / coping today:** every worktree-spawned agent (conductor
  Workers, implement-queue workers) and Matt when he opens a worktree by
  hand. Coping = gotchas.md bullets ("#1 recurring agent failure"), agent
  prompts that say "run `pnpm install --frozen-lockfile` first", and the
  implement-queue-worker's step 0 — all documentation, nothing executable.
- **Why now:** measured 2026-10-13/14 during the localization run (PR #6591):
  after `pnpm install`, `tsc` in `apps/hospitality` still failed on every
  page until workspace deps were built via turbo. Friction was timed, not
  anecdotal, and the sdlc-speed decomposition names this as its part 2.
- **Evidence:** gotchas.md § Build / pnpm / turbo records missing-install as
  the #1 recurring CI failure pattern and missing `pnpm typecheck` as #2;
  the llms-regen bullets record `ERR_MODULE_NOT_FOUND` from missing
  `packages/agent-core/dist` as a recurring silent failure of the same
  class.
- **Solution hunch (from the issue, a hunch not a design):** one idempotent
  command, `pnpm bootstrap:worktree`, that installs when node_modules is
  missing/stale and builds exactly the workspace packages apps consume via
  `dist/` (derived, not hardcoded); a SessionStart hook that _hints_ (one
  line, never installs, always exit 0); docs re-pointed at the command.
- **Success (one sentence):** in a fresh worktree, `pnpm bootstrap:worktree`
  followed by `pnpm --dir apps/hospitality exec tsc --noEmit` passes with no
  TS2307, and a second run with nothing to do finishes in under 5 seconds.
- **Biggest unknowns / ways this dies:** deriving the dist-consumed package
  list wrongly (misses a package → TS2307 survives; over-includes → slow
  no-op path); staleness detection via mtimes being flaky across clones;
  the hook tripping `hook-input.test.mjs` / `check-hook-wiring.mjs` guards.

## Scope

- **In:** `scripts/bootstrap-worktree.mjs` (pure `decideBootstrapSteps` +
  thin CLI, node-builtins only) + unit tests; `bootstrap:worktree` root
  script; `.claude/hooks/worktree-bootstrap-hint.sh` wired in
  `.claude/settings.json` beside `session-log-rotate.sh`; pointer edits in
  `.claude/rules/gotchas.md` and `.claude/agents/implement-queue-worker.md`.
- **Out:** auto-running the install from the hook (timeout); changing
  turbo/pnpm config; worktree reaping (`reap-worktrees.mjs` owns that);
  CI changes; the other three sdlc-speed parts.

## Constraints / already decided (by the issue)

- Pure decision function `decideBootstrapSteps({ hasNodeModules, lockNewer,
missingDists })` + thin CLI, unit-tested — pattern:
  `scripts/reap-worktrees.mjs`.
- Hook must not run the install itself and must exit 0 always; SessionStart
  wiring pattern: `.claude/hooks/session-log-rotate.sh`; wiring guard:
  `scripts/check-hook-wiring.mjs`.
- Gates: `pnpm lint && pnpm typecheck && pnpm test` (affected), plus the
  issue's verification commands.

## UX / release

- **User-facing surface:** none — developer/agent tooling only. `ux:
not-applicable` expected at PRD time.
- **Release authorization:** not granted and not reachable — the run stops
  at Decompose. Later build steps merge only on the Owner's in-session
  answer (conductor `standing_consent` is off).
