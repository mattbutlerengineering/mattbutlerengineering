# Known gotchas

Project-specific traps that are **still live**. Read these before diving into pre-commit, release, or deploy work.

> **Format:** one entry = the rule, the reason in a clause, and an issue/PR link. Incident narratives (measurements, run IDs, timelines) go in the PR, `docs/fixes/<slug>/`, or `.claude/reflections/` — not here. This file loads into every session, so its size is budgeted by `scripts/__tests__/instruction-budget.test.mjs`. Once a trap is pinned by a test, shrink its entry to "pinned by `<test>`" or drop it. The pre-compression narratives are preserved at `git show 0e870c555:.claude/rules/gotchas.md`.
>
> **Domain-specific gotchas** live in path-scoped siblings that load only when a matching file is read: `gotchas-pulumi.md`, `gotchas-dependencies.md`, `gotchas-releases.md`, `gotchas-fastify.md`, `gotchas-prisma.md`, `gotchas-auth0-e2e.md`.
>
> **Adding entries:** after an autonomous loop, run `/idea-to-prod:knowledge-base`'s harvest (`kb.py harvest <main checkout root> --days N` — a worktree path finds no transcripts) to propose bullets here with human review.

## Pre-commit / lint

- **Hooks get their input as JSON on stdin, never from `$CLAUDE_FILE_PATH`/`$CLAUDE_BASH_COMMAND`/`$CLAUDE_TOOL_INPUT` (those don't exist; #3631).** Read the path with `FILE=$(node "$CLAUDE_PROJECT_DIR/.claude/hooks/hook-input.mjs"); [ -n "$FILE" ] || exit 0;`. **Never pass an unguarded variable to a formatter** — an empty arg means "everything" to prettier/eslint (once reformatted the whole repo). Contract: `scripts/hook-input.mjs`, pinned by `scripts/__tests__/hook-input.test.mjs`.
- **In a worktree-isolated subagent, hooks still run with `CLAUDE_PROJECT_DIR` = CWD = the MAIN checkout.** Bash hooks resolve the real tree via `hook-input.mjs cwd` + `git -C "$cwd" rev-parse --show-toplevel`; PostToolUse path hooks (`regen-llms.sh`, `regen-dep-graph.sh`, `check-changeset.sh`) resolve the edited file's own tree via `git -C "$(dirname "$file_path")"`. Pinned by the worktree cases in `hook-input.test.mjs`. Never read a worktree hook's silence as "nothing drifted".
- **`.claude/hooks/secret-scan.mjs` blocks Edit/Write (exit 2) on high-confidence secrets** (live Stripe keys, AWS key ids, JWTs, PEM headers); test keys, `.example`, `__tests__`/`fixtures`, `.md` allowlisted; fails open on parse error. Logic: `scripts/secret-scan.mjs`.
- Pre-commit runs `eslint --fix` (lint-staged) + `check-adr` + `scripts/precommit-llms-stage.mjs` (regenerates and stages affected `llms*.txt`). There is no `post-commit` hook (#6633); `pack-changed` runs from `.husky/post-checkout`.
- JSX strings with `'` fail `react/no-unescaped-entities` — use `&apos;`.
- **Rialto components must NOT call `setState` inside a `useEffect` body** (pre-commit bans it in `packages/rialto`) — render loop. Derive during render or set state in event handlers.
- **lint-staged passes generated files to ESLint as explicit args, bypassing config `ignores`** — `lint-staged.config.js` filters `/generated/` paths first; keep it.
- **`run-related-tests.sh` (PostToolUse) runs the sibling `*.test.*` after every TS/JS edit.** Never blocks. `Test failure in related file` = that test failing; no output = pass _or_ no sibling test, not proof of coverage.
- **`check-changeset.sh` warns when rialto published source changes without a changeset in the diff** (same rule as CI's `check-rialto-changeset.mjs`). Advisory, fails open — a missing warning is not proof CI passes.

## Pre-push / typecheck

- **Vitest does NOT typecheck; every package's `typecheck` runs `tsc` over its tests via a sibling `tsconfig.test.json`** (`extends ./tsconfig.json`, `noEmit`, explicit `"exclude": []` — `exclude` is inherited through `extends`). Same-basename `foo.test.ts` + `foo.test.tsx`: tsc silently drops the `.tsx`. Pinned by `scripts/__tests__/typecheck-covers-tests.test.mjs` (#6158). New test location → also widen turbo `tasks.typecheck.inputs` (per-package `inputs` must start with `$TURBO_EXTENDS$`; `turbo-task-inputs.test.mjs`) or a cached green replays. App `lint` covers `e2e/**` (`app-lint-covers-e2e.test.mjs`). Still uncovered: JS tests, `tests/smoke/smoke.spec.ts`.
- **Nothing typechecks before push** — `.husky/pre-push` runs only the destructive-migration check, the antipattern ratchet, CLI build + `pnpm regen`, and `pnpm regen --check`. Run `pnpm typecheck` (or `pnpm turbo typecheck --filter='...[HEAD]'`) yourself; `CI Gate` is the gate.
- **Worktree agents must run `pnpm typecheck` before declaring done** (after `pnpm bootstrap:worktree`, or workspace imports fail TS2307). #2 recurring CI failure.

## Build / pnpm / turbo

- Run `pnpm` from inside a package directory, not the monorepo root — turbo filter errors at the root for `test`/`typecheck`/`build`.
- Parallel `Bash` calls don't share `cd` state — use absolute paths or `pnpm --dir <abs-path>`.
- **Worktree agents must run `pnpm bootstrap:worktree` first** (frozen install + missing workspace `dist/`; no-op when bootstrapped). `isolation: "worktree"` has no `node_modules`; #1 recurring CI failure. `implement-queue-worker` does it as step 0.
- **`gh pr update-branch` drifts llms artifacts** (no regen runs). Fix: `pnpm build --filter @mbe/cli... && pnpm regen`, commit, push.
- **llms regen needs `packages/agent-core/dist` built.** `regen-llms.sh` swallows the `ERR_MODULE_NOT_FOUND` silently; pre-push's `pnpm regen --check` fails closed on it and reports **every** package stale — all 28 stale at once = missing build, not drift. Always `pnpm build --filter @mbe/cli...` first. `SKIP_PUSH_TYPECHECK=1` does not bypass it.
- **A _stale_ `agent-core/dist` silently narrows implement-queue's review gate** (#3989: `reviewersForDiff` returned `[]` from old dist). `scripts/agent-core-build-freshness.mjs check` fails closed on stale/missing/unknown; exit 1 = treat the PR as needing full review.
- **A workflow that names Playwright specs explicitly must list every spec** (#3955: six rialto-web specs never ran). Use an explicit file list, never a glob; pinned by `apps/rialto-web/e2e/workflow-coverage.test.ts`. Orphaned tests in general: `scripts/check-orphaned-tests.mjs` (#3911).
- **`pnpm exec mbe` fails (`Command "mbe" not found`)** — the bin is never linked. Use `node tools/cli/dist/index.js <cmd>` or `pnpm --filter @mbe/cli start <cmd>`.
- **An exported `new Command(...)` nobody `.addCommand()`s is unreachable, and its unit tests still pass.** Guarded by `scripts/check-orphaned-cli-commands.mjs` in `repo-audit`.
- **Worktree-isolated subagents' Bash is gated by an isolation classifier** that rejects heredocs, compound commands, and ambiguous `git`/`gh`/`sed` forms (27 rejections in one worker). Prescribe up front: Write/Edit for file content (scripts go in the scratchpad, run as one plain `python3 <path>`); one simple command per Bash call with absolute paths; `gh` with explicit `--repo`. Only fires under `isolation: "worktree"`.
- **Committed worker worktrees are never auto-removed** — `scripts/reap-worktrees.mjs` (implement-queue Phase 4) reaps them, refusing any with an open PR or live process; it uses `--force` deliberately (#3950).
- **Turbo's local cache must stay per-checkout** — keep `"cacheDir": ".turbo/cache"` in `turbo.json`, or worktrees replay each other's build output (#3786, #3593). Repro: `scripts/repro-turbo-worktree-cache.sh`.

## CI

- **GH Actions is paid and runs on every PR** — `gh run list --limit 5` before claiming CI is broken.
- **Green-main policy:** no admin-merge through red. Main broken = top priority; emergency revert is the only exception.
- **`CI Gate` is the only required check on `main`; `main` is NOT `strict`** (measured 2026-08-17: `{"strict": false, "contexts": ["CI Gate"]}`). `codecov/patch` and `Hospitality E2E` are advisory. A `BEHIND` PR is mergeable. Branch protection is repo state, not code — re-measure (`gh api repos/.../branches/main/protection/required_status_checks`) before building on it; `scripts/main-strictness.mjs` treats any error as strict (ADR-027).
- **No merge queue on this personal-account repo** (ruleset returns `422 Invalid rule 'merge_queue'` even with valid params — don't chase the first error). Use `gh pr merge <N> --auto --squash --delete-branch`; it does not auto-rebase. Run the review gate **before** `--auto` — once enqueued, GitHub merges on green with no further gate. Dequeue: `--disable-auto`.
- **`merge-queue.yml` must never enable auto-merge before a `tier:*` label lands, and disables only on an explicit `needs-review`** (#5983, #6199). `decideAutoMergeAction` in `scripts/merge-queue-eligibility.mjs` fails closed; pinned by `merge-queue-tier-race.test.mjs`.
- **GitHub Actions' default shell has no `pipefail`** (`bash -e {0}`) — `check | tee log` reports `tee`'s status. Any `run:` block whose exit code matters opens with `set -o pipefail` (#4505; reference: `preview-deploy.yml`).
- **A verify step that writes before it checks cannot fail.** llms `--check` compared against the file `pnpm regen` had just rewritten; `runCheck()` in `scripts/regen.mjs` now requires both git-diff and source→output signals (pinned by `regen.test.mjs`). When adding a "verify X is in sync" step, make it order-independent.
- **Node 22 is pinned via `.nvmrc`** — `nvm use`; mismatched Node drifts llms in Integrity. Node 20 was retired (#3570); never re-add a matrix that diverges by `github.event_name`.
- **Architecture Audit builds only `pnpm build --filter @mbe/cli...`** — never bare `pnpm build`.
- **ACMM scanner checks existence, not contents** — audit substance separately.
- **Package changes regenerate the dependency graph** — `regen-dep-graph.sh` handles Claude Code edits; otherwise `pnpm graph && pnpm generate:dep-graph` before pushing.
- **Visual/E2E jobs must build the app's whole workspace closure, not just rialto** — `@mbe/types` and `@mbe/api-client` resolve `default` to `dist/` (#7042). Prefer `pnpm build --filter '<app>^...'`; pin the closure in a test (`^...` exits 0 having built nothing on an empty closure). The symptom is misleading (`users-api never became healthy`; the real `ERR_MODULE_NOT_FOUND` is lower in the log).
- **Worktree agent PRs may target the wrong base** — verify base ref is `main`; if not, close and recreate.
- **Cold-cache test timeouts:** `buildApp()` cold start and any `pnpm-lock.yaml` change (a turbo `globalDependencies` entry → every task cold, ~40 concurrent) push suites past vitest's 5 s default (#3588). Fix: `testTimeout: 15000` in that package's `vitest.config.ts`; `scripts/` tests take theirs from `scripts/vitest.config.mjs` (`scripts-vitest-timeout.test.mjs`).
- **"Was this PR reverted" comes only from `findRevertPr()` + `classifyRevertState()`** in `scripts/revert-rca.mjs` — never a revert-sha passed at proposal time (#3590).
- **A workflow-level `success` can be a skipped run** (Pulumi Deploy, Deploy Services) — check the job-level conclusion.
- **DO + Pulumi dual-deploy race** — every `doctl apps create-deployment` spawns a cancelled "spec updated" deployment; Pulumi spec drift can hang `pulumi up`.
- **`GITHUB_TOKEN`-authored PRs/pushes never fire `ci.yml` (anti-recursion)** — `CI Gate` never appears, nothing is red, PR stays `BLOCKED` (#3538 + five rediscoveries). Fix: dispatch CI on the branch (`gh workflow run ci.yml --ref <branch>`, needs `permissions: actions: write`; reference `drift-fix.yml`). Dispatch-produced check runs are invisible to `statusCheckRollup` (#4023), so `CI Gate` also publishes a **commit status** (#4025, `scripts/ci-gate-commit-status.mjs`; confirmed working 2026-08-24). When verifying, read statuses on the SHA the run executed (`gh run view <id> --json headSha`), not the PR's current head. The four `auto-merge` producers route enabling through `merge-queue-eligibility.mjs` and wait on the tier label (#3966, #3972, #4070); `automation-pr-rescue.yml` re-checks stale ones. `AUTOMATION_PAT` is still unset (`docs/SECRETS.md`). `auto-qa-tune.yml` deliberately opts out.
- **A PR with zero CI runs (`gate-missing`) is distinct from both the token trap and green** (#3969). `classifyCiGateStatus()` in `scripts/ci-gate-status.mjs` separates `green`/`failed`/`pending`/`gate-missing`/`gate-unattributed`; on `gate-missing`, dispatch and re-poll. Never read `fail=0 pend=0` as green without asserting `CI Gate` = `SUCCESS`.
- **Rate sensors must scope to the branch and exclude `skipped`/`cancelled` from the denominator** (#4538, #4685, fixed #4687). Triage tell: a big negative `pass_rate_pct` with `failed: 0` is not a regression.
- **A squash-merge's subject comes from the PR title, and a title edited minutes before merge may not be picked up.** Always `gh pr merge <N> --squash --subject "<subject> (#<N>)" --delete-branch`. When a PR's mechanism changes in review, update its title. `gh pr edit` is broken here — use `gh api -X PATCH repos/.../pulls/<N> -f title=…`.
- **pnpm-lock.yaml quote-style diffs are noise** — `git checkout -- pnpm-lock.yaml`.
- **Uncommitted `packages/rialto-catalog/src/generated-schemas.ts` edits fail the drift-check** — `git checkout --` it before push.
- **New packages with committed llms files need a `FAMILIES` entry in `scripts/regen-manifest.mjs`** (alphabetical by path), or the coverage test fails.
- **Visual baselines are Linux-runner-specific — never commit macOS screenshots.** Preferred: `gh workflow run visual-baseline-regen.yml -f app=<app> [-f grep=<route>]` (opens a `needs-review` PNG PR; merge by hand). Manual source: the `visual-actuals-replica-a` artifact from `visual-noise-floor.yml` (all snapshots + `provenance.json`).
- **Cloud routines cannot regenerate baselines** (no `actions: write`) — label stale-baseline issues `ready-for-human` with the exact dispatch line, never `ready`. Tell: an identical pixel delta across unrelated routes = shared chrome moved.
- **Changing a shared Heading/CSS primitive's `line-height` flips ±1px baselines in unrelated sections** — expect 18+ failures; regenerate after landing. Merging with visual red cascades onto every later PR.
- **Docs-only PRs skip the Build chain** — `docs-format` (`ci.yml`, #5787) runs `pnpm check:prettier` for them; prettier-format docs before any docs PR anyway. `gh run rerun --failed` reuses the old merge SHA; use `gh pr update-branch <N>` for a fresh merge ref. `.claude/**/*.md` is covered by `check:prettier`.

## Metrics / staleness detection

- **A bot that writes to an issue/PR invalidates `updatedAt` as a measure of it.** The detector persists its own before-the-write timestamp; consumers read that, never `updatedAt`; unmeasured = age unknown, no fallback (#4274). Also fix the producer's own candidate gate, not just consumers (#5816).
- **A failure-streak detector cannot see a workflow that never ran** — recency is a separate axis: `classifyRunRecency()` (`fresh`/`overdue`/`never-ran`/`undeterminable`, fails closed) in `scheduled-workflow-health.mjs` (#5815). GitHub drops scheduled runs under load and starts them 5–7 h late; `DEFAULT_OVERDUE_TOLERANCE_HOURS = 12`.
- **A unit-tested, scheduled collector can still have never produced a row** — a graceful skip looks identical to success (#5527-#5531). When a script depends on ambient capability (egress, a CLI binary, a credential), assert it exists where the script runs and freshness-check its output: `scripts/metrics-freshness.mjs`, whose `freshnessExitCode()` fails an empty set.

## Pulumi / R2 state backend

→ Moved to `.claude/rules/gotchas-pulumi.md` (loads for `infrastructure/pulumi/**` and Pulumi workflows). Cross-cutting rule kept here: **pin every tool a deploy workflow uses to an exact version, and back the pin with a test** — runner images bump preinstalled tools with no repo change (`scripts/__tests__/pulumi-cli-pin.test.mjs`).

## Dependencies

→ Moved to `.claude/rules/gotchas-dependencies.md` (loads for `package.json` / `pnpm-lock.yaml` / Dockerfiles).

## Releases (changesets / rialto)

→ Moved to `.claude/rules/gotchas-releases.md` (loads for `.changeset/**` and rialto package files).

## Claude Code Remote / cloud sessions

- **`gh` exists in CCR sessions, but GraphQL-backed subcommands are blocked; `gh api` REST works** (corrected 2026-10-02, #5958). `gh auth status` reporting an invalid token is misleading.

  | Symptom                                                               | Meaning                                                                                              |
  | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
  | `HTTP 403: GitHub GraphQL is not available from Claude Code sessions` | A GraphQL-backed `gh` subcommand (`issue/pr list/view/edit/merge`); use `gh api` or `mcp__github__*` |
  | `HTTP 403: Resource not accessible by integration`                    | No `actions: write` — cannot dispatch workflows by any path                                          |
  | `401 Bad credentials` on `gh api`                                     | Different class: token scoped for git-over-HTTPS only (#3689/#3937)                                  |

  `mbe check-model --issue` and `mbe issue transition` fail here for the same reason. Discover `mcp__github__*` tools with a `ToolSearch` keyword query. CCR environments change without a repo diff — re-measure if symptoms don't match.

  - **Large MCP results land on disk, not in context.** An over-cap tool result is written to a file and the tool returns its path — read it with `jq` rather than re-running the query.
  - **Pin error-shape detectors to a string captured verbatim from a real log, never a plausible one** (#6312: the GraphQL fallback shipped dead). Also: `--search "label:a label:b"` ANDs labels (comma form ORs); REST `state_reason` is lowercase.

- **A CCR session's permission classifier can deny every PR merge (`[Merge Without Review]`)** regardless of tier or review (#6125). On the first denial, stop calling merge for the session; leave the PR green and reviewed, and report it as awaiting a human merge.

## Deploy / static sites

- **Static sites deploy as Cloudflare Workers with Service Bindings, never CF Pages** — cached HTML references dead bundle hashes, leaving a blank page after every deploy. Architectural, not fixable with headers.
- **DO reports every non-zero build exit as `BuildJobTerminated` / "resource exhaustion"** — not diagnostic (#5677 was a missing `COPY patches ./patches`). Read `doctl apps logs <app-id> <component> --type=build --deployment <id>` (component positional). Anything the root `package.json` references by path is a build-context dependency of every image (`dockerfile-pnpm-patches.test.mjs`).
- **`Deploy Services` concludes `success` while deploying nothing when the circuit breaker is open** — check `Deploy API Services`' job conclusion. After fixing, reset the breaker (`gh workflow run circuit-breaker.yml -f force=true`) and re-dispatch.

## Shell (zsh)

- **Never use `status` as a shell variable name** — read-only in zsh. Use `run_state`, `http_code`, `phase`, `result`.

## Auth0 / E2E

→ Moved to `.claude/rules/gotchas-auth0-e2e.md`. Cross-cutting rule kept here: **`gh secret set NAME` without `--body` silently sets `""`** — always `--body "value"`.

## Fastify / rate limiting

→ Moved to `.claude/rules/gotchas-fastify.md` (loads for `services/**` and `packages/service-bootstrap/**`).

## Prisma + DO migrate

→ Moved to `.claude/rules/gotchas-prisma.md` (loads for Prisma schemas, migrations, and `infrastructure/migrate/**`).
