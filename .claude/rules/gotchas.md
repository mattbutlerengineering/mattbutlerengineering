# Known gotchas

Project-specific traps that have bitten me before. Read these before diving into pre-commit, release, or deploy work.

## Pre-commit / lint

- Pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed` (the last one regenerates `llms.txt` / `llms-full.txt` in affected packages — expect them to appear in `git status` after your commit lands)
- JSX strings with `'` fail `react/no-unescaped-entities` at commit time — use `&apos;`

## Pre-push / typecheck

- **Vitest does NOT typecheck** — tests can pass with completely wrong types. Pre-push hook now runs `turbo typecheck` before `turbo test`. If you add test mocks, they must match the actual interface shape (e.g. `SessionResult` needs `status`/`sessionId`/`branchName`, not `success`/`stuck`/`outputs`)
- **Worktree agents must run `pnpm typecheck` before declaring done.** Agents that only run `pnpm test` will miss type errors that break CI. This is the #2 recurring CI failure pattern after the missing `pnpm install` pattern

## Build / pnpm / turbo

- Run `pnpm` from inside a package directory, not the monorepo root — turbo filter errors out at the root for `test`/`typecheck`/`build` in most packages
- Parallel `Bash` tool calls don't share `cd` state and race each other — use absolute paths or `pnpm --dir <abs-path> <cmd>` when running in parallel
- **Worktree agents must `pnpm install --frozen-lockfile` before running tests/builds.** Claude Code `isolation: "worktree"` creates a bare checkout without `node_modules`. Without the install step, `vitest: command not found` / `ELIFECYCLE` failures are guaranteed. This is the #1 recurring CI failure pattern across agent sessions

## CI

- **GH Actions is paid and runs on every PR** — verify state with `gh run list --limit 5` before claiming CI is broken. (The earlier "intentionally unpaid" note was true pre-OSS-launch and is now stale)
- **Baseline checks fail on `main`:** `Typecheck`, `Coverage Check`, `Integrity`, and `Accessibility AI Attribution` currently fail on every PR because `main` itself fails them. Don't file `ci-fix` issues for these — they're not regressions from the PR. Admin-merge unrelated PRs through, and tackle the baseline failures in a dedicated fix-up PR
- **Integrity fails due to Node 20/22 ts-morph formatting diff** — the `pack` command's `getText()` output differs between Node 20 (local) and Node 22 (CI), causing llms-full.txt line-wrapping differences. This is a baseline issue on main, not a PR regression
- **`Accessibility AI Attribution` fails with "Results file not found: a11y-results.json"** — the processing step expects an artifact from an upstream a11y scan step that doesn't produce it. This is a workflow config issue, not a code issue
- **Coverage Check failures may be baseline, not PR-caused.** Before adding tests to fix a coverage CI failure, check if the failing package's coverage is also below threshold on `main`. If the PR branch was based on an older commit, rebasing onto current `main` may resolve it. Close the issue and document rather than writing unnecessary tests
- **Architecture Audit only needs CLI deps built.** The job uses `pnpm build --filter @mbe/cli...` (turbo `...` = transitive deps). Never use bare `pnpm build` here — unrelated packages with TS errors (e.g. agent-service test files) would fail the entire job even though they have nothing to do with ADR/dep checks
- **ACMM scanner checks file/dir existence, not contents.** Criteria marked `scannable: false` (correction-capture, positive-reinforcement, session-summary, etc.) pass detection when the directory exists — even if it's empty. Always audit substance (file count, entry quality) separately when evaluating maturity level
- **Adding/changing packages requires `pnpm generate:dep-graph`** — CI's Build job regenerates the dependency graph and fails if the committed `infrastructure/worker/dep-graph.json` doesn't match. The pre-commit hook doesn't run this, so you must do it manually after adding a new workspace package or changing `dependencies`/`devDependencies`
- **Verify CI failures are truly baseline before admin-merging** — don't assume a failing check is "known baseline" without confirming the same failure exists on `main`. Admin-merging PRs with real failures creates broken-main issues that ci-monitor files as CRITICAL
- **Worktree agent PRs may target wrong base branch** — `isolation: "worktree"` agents branch from whatever commit the worktree was created at. If spawned from a feature branch, the PR targets that branch (not `main`). After agent completes, verify the PR's base ref is `main` — if not, close and recreate from a rebased branch

- **Local `generated-schemas.ts` modifications pollute drift-check** — if `packages/rialto-catalog/src/generated-schemas.ts` has uncommitted changes (e.g. from running the generator with different rialto dist), the drift-check test reads the modified file and fails. Fix: `git checkout -- packages/rialto-catalog/src/generated-schemas.ts` before push

## Dependencies

- **pnpm.overrides for CVEs: use the scoped pattern** `"pkg@<patched": "^patched"`, not `"pkg": ">=patched"` — the open range resolves to the latest satisfying version and can pull major bumps (e.g. `protobufjs@>=7.5.5` → 8.0.1)

## Releases (changesets / rialto)

- **Changesets require `GITHUB_TOKEN`**: run `GITHUB_TOKEN=$(gh auth token) pnpm version-packages` — without it, `@changesets/get-github-info` errors asking for a PAT
- **Changesets post-version prettier step errors with `Cannot find package '@mbe/config'`** — version bump + `.changeset/*.md` consumption succeed, but `packages/rialto/CHANGELOG.md` write is **silently skipped**. Manually prepend the new version block to `CHANGELOG.md` before committing the release
- **`pnpm release` regenerates `packages/rialto/package.json` exports map** when a new component folder was added — run `git status` after release and commit the follow-up diff. Otherwise the subpath `import from "@mattbutlerengineering/rialto/<NewComponent>"` works for registry consumers but is missing from the repo

## Tooling artifacts

- **`graphify-out/` is not gitignored** and accumulates wherever `/graphify` was invoked (repo root or package subdirs). Either `rm -rf graphify-out/` after use or add `graphify-out/` to `.gitignore`

## Prisma + DO migrate

- **Migrate Dockerfile must pin same Prisma major as `@prisma/client`** (`infrastructure/migrate/Dockerfile`). Prisma 7 dropped schema-level `url`; client gen rejects it (P1012) while Prisma 6 CLI requires it. No schema syntax bridges both — keep them in sync. Migrate URL comes from per-service `prisma.config.ts` on Prisma 7
- **Prisma 7 `prisma.config.ts` in containers needs `ENV NODE_PATH=/usr/local/lib/node_modules`** when prisma is globally installed via `npm install -g prisma@7`. Without it the config loader fails with `Cannot find module 'prisma/config'` from any service dir
- **Verify prod DB connectivity via `/api/v1/users/health`, not `/health`** — `/health` is liveness only (returns 200 even when DB is dead); `/api/v1/users/health` runs `prisma.$queryRaw` and reports `degraded` with the actual DB error
