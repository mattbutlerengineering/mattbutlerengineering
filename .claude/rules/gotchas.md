# Known gotchas

Project-specific traps that have bitten me before. Read these before diving into pre-commit, release, or deploy work.

## Pre-commit / lint

- Pre-commit hook runs `eslint --fix` + `check-adr` + `pack-changed` (the last one regenerates `llms.txt` / `llms-full.txt` in affected packages — expect them to appear in `git status` after your commit lands)
- JSX strings with `'` fail `react/no-unescaped-entities` at commit time — use `&apos;`
- **lint-staged passes generated files to ESLint as explicit CLI args** — ESLint 10's `ignores` array in config only applies to glob-resolved files, not explicit paths. When lint-staged stages a Prisma generated file (`services/*/src/generated/**`), it passes the path directly to `eslint`, bypassing the ignore. `lint-staged.config.js` filters `/generated/` paths before grouping to prevent this

## Pre-push / typecheck

- **Vitest does NOT typecheck** — tests can pass with completely wrong types. Pre-push hook now runs `turbo typecheck` before `turbo test`. If you add test mocks, they must match the actual interface shape (e.g. `SessionResult` needs `status`/`sessionId`/`branchName`, not `success`/`stuck`/`outputs`)
- **Worktree agents must run `pnpm typecheck` before declaring done.** Agents that only run `pnpm test` will miss type errors that break CI. This is the #2 recurring CI failure pattern after the missing `pnpm install` pattern

## Build / pnpm / turbo

- Run `pnpm` from inside a package directory, not the monorepo root — turbo filter errors out at the root for `test`/`typecheck`/`build` in most packages
- Parallel `Bash` tool calls don't share `cd` state and race each other — use absolute paths or `pnpm --dir <abs-path> <cmd>` when running in parallel
- **Worktree agents must `pnpm install --frozen-lockfile` before running tests/builds.** Claude Code `isolation: "worktree"` creates a bare checkout without `node_modules`. Without the install step, `vitest: command not found` / `ELIFECYCLE` failures are guaranteed. This is the #1 recurring CI failure pattern across agent sessions

## CI

- **GH Actions is paid and runs on every PR** — verify state with `gh run list --limit 5` before claiming CI is broken
- **Green-main policy: main must always be green.** No admin-merge through red checks. If main breaks, fix is top priority. Emergency revert is the only exception
- **Node version: repo pins Node 22 via `.nvmrc`** — run `nvm use` to align local with CI. Mismatched Node versions cause llms.txt drift in the Integrity check
- **Architecture Audit only needs CLI deps built.** The job uses `pnpm build --filter @mbe/cli...` (turbo `...` = transitive deps). Never use bare `pnpm build` here — unrelated packages with TS errors (e.g. agent-service test files) would fail the entire job even though they have nothing to do with ADR/dep checks
- **ACMM scanner checks file/dir existence, not contents.** Criteria marked `scannable: false` (correction-capture, positive-reinforcement, session-summary, etc.) pass detection when the directory exists — even if it's empty. Always audit substance (file count, entry quality) separately when evaluating maturity level
- **Adding/changing packages regenerates the dependency graph** — CI's Build job regenerates the graph and fails if committed `infrastructure/worker/dep-graph.json` or `docs/architecture/dependency-graph.md` don't match. The pre-commit hook doesn't run this, but the `regen-dep-graph.sh` PostToolUse hook (`.claude/hooks/`) now auto-regenerates and re-stages both artifacts whenever Claude Code edits a `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`. For edits made outside Claude Code (or if the hook was skipped), run `pnpm graph && pnpm generate:dep-graph` manually before pushing
- **E2E workflow requires rialto built** — `@mattbutlerengineering/rialto/styles` export points to `dist/lib/styles.css` (a build artifact). Without `pnpm build --filter @mattbutlerengineering/rialto` before E2E tests, Vite can't resolve any rialto imports
- **Worktree agent PRs may target wrong base branch** — `isolation: "worktree"` agents branch from whatever commit the worktree was created at. If spawned from a feature branch, the PR targets that branch (not `main`). After agent completes, verify the PR's base ref is `main` — if not, close and recreate from a rebased branch

- **Pulumi Deploy "success" can be a skipped run** — the workflow reports `success` even when `Deploy Infrastructure` job was skipped (triggered by failed static deploy). Check the job-level conclusion, not workflow-level, to determine if Pulumi actually ran
- **DO + Pulumi dual-deploy race** — `deploy-services.yml` (doctl) and `pulumi-up.yml` both manage the same DO App Platform resource. Every `doctl apps create-deployment` triggers a paired "app spec updated" deployment that gets CANCELED. If Pulumi detects spec drift from doctl, `pulumi up` can hang waiting for DO deployment to complete

- **pnpm-lock.yaml quote style diffs are formatting noise** — different pnpm versions use single vs double quotes for keys. These are not real changes. Revert with `git checkout -- pnpm-lock.yaml` rather than committing formatting-only lockfile diffs

- **Local `generated-schemas.ts` modifications pollute drift-check** — if `packages/rialto-catalog/src/generated-schemas.ts` has uncommitted changes (e.g. from running the generator with different rialto dist), the drift-check test reads the modified file and fails. Fix: `git checkout -- packages/rialto-catalog/src/generated-schemas.ts` before push

## Dependencies

- **pnpm.overrides for CVEs: use the scoped pattern** `"pkg@<patched": "^patched"`, not `"pkg": ">=patched"` — the open range resolves to the latest satisfying version and can pull major bumps (e.g. `protobufjs@>=7.5.5` → 8.0.1)
- **Zod 4 `z.record()` requires 2 args** — `z.record(z.unknown())` fails; use `z.record(z.string(), z.unknown())`. Zod 3 accepted 1 arg, Zod 4 does not
- **AI SDK v6 API renames** — `streamText` uses `stopWhen: stepCountIs(N)` (not `maxSteps`), `tool()` uses `inputSchema` (not `parameters`), fullStream text-delta events have `.text` (not `.textDelta`), and tool-call events have `.input` (not `.args`). The old names don't exist — TypeScript will catch it but only at typecheck, not at test time

## Releases (changesets / rialto)

- **Changesets require `GITHUB_TOKEN`**: run `GITHUB_TOKEN=$(gh auth token) pnpm version-packages` — without it, `@changesets/get-github-info` errors asking for a PAT
- **Changesets post-version prettier step errors with `Cannot find package '@mbe/config'`** — version bump + `.changeset/*.md` consumption succeed, but `packages/rialto/CHANGELOG.md` write is **silently skipped**. Manually prepend the new version block to `CHANGELOG.md` before committing the release
- **`pnpm release` regenerates `packages/rialto/package.json` exports map** when a new component folder was added — run `git status` after release and commit the follow-up diff. Otherwise the subpath `import from "@mattbutlerengineering/rialto/<NewComponent>"` works for registry consumers but is missing from the repo

## Tooling artifacts

- **`graphify-out/` is not gitignored** and accumulates wherever `/graphify` was invoked (repo root or package subdirs). Either `rm -rf graphify-out/` after use or add `graphify-out/` to `.gitignore`

## Auth0 / E2E

- **Auth0 ROPC grant requires SPA or Regular Web Application** — Machine to Machine (M2M) apps return `401 access_denied` even with Password grant enabled. The `E2E_AUTH0_CLIENT_ID` must point to a SPA or Regular Web App, not M2M. Current E2E client: `mattbutlerengineering-hospitality` (SPA)
- **`gh secret set` without `--body` sets empty value** — when stdin is empty (non-interactive), the secret silently gets set to `""`. Always use `gh secret set NAME --body "value"`. An empty `E2E_AUTH0_CLIENT_ID` causes "Missing required E2E auth env vars" instead of the expected auth error

## Prisma + DO migrate

- **Migrate Dockerfile must pin same Prisma major as `@prisma/client`** (`infrastructure/migrate/Dockerfile`). Prisma 7 dropped schema-level `url`; client gen rejects it (P1012) while Prisma 6 CLI requires it. No schema syntax bridges both — keep them in sync. Migrate URL comes from per-service `prisma.config.ts` on Prisma 7
- **Prisma 7 `prisma.config.ts` in containers needs `ENV NODE_PATH=/usr/local/lib/node_modules`** when prisma is globally installed via `npm install -g prisma@7`. Without it the config loader fails with `Cannot find module 'prisma/config'` from any service dir
- **Verify prod DB connectivity via `/api/v1/users/health`, not `/health`** — `/health` is liveness only (returns 200 even when DB is dead); `/api/v1/users/health` runs `prisma.$queryRaw` and reports `degraded` with the actual DB error
