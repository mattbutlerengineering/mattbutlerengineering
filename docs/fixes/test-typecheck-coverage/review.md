---
stage: review
run: maintenance:test-typecheck-coverage
date: 2026-10-08
reviewed-at: origin/main 88581c586 (all six run PRs merged) + this branch's review fix
assumptions:
  - "Standards index: the skill's `docs/standards.json` belongs to the idea-to-prod plugin, and its domains are factory, pipeline, docs and eval for that repo. None of them covers this repo's tsconfig, turbo or test changes, so every finding cites `none`."
  - "Run scale: this is a maintenance run that changed only tests, typecheck configs, turbo inputs, docs and the unpublished rialto showcase. Each PR already passed the per-PR `reviewer` (9/10). So this pass is run-level only: cross-PR consistency, how the guard and turbo design hold up, and the inventory. It did not re-review each PR's test edits line by line."
  - "Turbo input drift is ranked minor because no false cache hit exists today. It was still fixed on this branch: the fix is three config lines plus a test, and the brief allows code changes that a finding needs."
  - "Backlog: the review skill does not say to seed `docs/backlog.md`, so nothing was seeded. Each deferred finding has its reason recorded below."
  - "The tools/cli flake behind the bb85b3071 main-push failure is not fixed here. It is in a file this run never touched, and it predates the run. It is recorded as a deferred finding with the one-line fix."
---

# Review: test files escape `pnpm typecheck`

## Scope

This review covers the six merged PRs: #6158 `d68f8ec1e`, #6162 `bb85b3071`, #6165 `a2d05bdd4`,
#6167 `bdfcad156`, #6168 `1cd09d0e6` and #6169 `88581c586`. Each was scoped with
`git show --stat <sha>`, and the review was restricted to the files those commits touch.
Unrelated commits in `e4dd62ca4..88581c586` were ignored. The review examined:

- **Per-package configs.** It covered 19 `tsconfig.{test,e2e,showcase}.json` files and every
  workspace `typecheck` script (29 packages). It compared each base `tsconfig.json`'s
  `include`/`exclude`/`rootDir` with its sibling config and the package's `build` script.
- **The guard.** `scripts/__tests__/typecheck-covers-tests.test.mjs` was read in full: how it
  parses scripts, how it resolves projects, how it lists files, and its runtime.
- **Turbo inputs.** It read root `turbo.json`, the three new package `turbo.json` files,
  `scripts/turbo.json` and `scripts/__tests__/turbo-task-inputs.test.mjs`. It then measured the
  resolved input sets with `turbo run typecheck --dry-run=json` (turbo 2.11.0).
- **Cast inventory.** Added lines across all six commits, excluding `*.md` and `llms*`.
- **The bb85b3071 failure.** It read the main-push CI log for run 37825873644, job
  113479604749, and the gh-client transport code.
- **Gotchas, ADRs and security.** It read `.claude/rules/gotchas.md` § Pre-push / typecheck,
  ran `check-adr`, and read ADR-015 and ADR-016.

## Findings

### Minor: the per-package `typecheck.inputs` overrides replaced the root list instead of extending it, and one had already drifted within the run

- Scenario: turbo merges a Package Configuration's `inputs` by replacing the root array.
  `apps/hospitality/turbo.json`, `apps/rialto-web/turbo.json` and
  `packages/rialto-catalog/turbo.json` each copied the root globs and then added their
  out-of-package files. Any later root edit therefore skipped these three packages. That has
  already happened once:
  - PR1 wrote `packages/rialto-catalog/turbo.json` from the root list as it stood then.
  - PR5 added `e2e/**` and `*.ts` to root, but not to rialto-catalog.
  - Measured with dry-run: rialto-catalog's typecheck input set lacked `vitest.config.ts`
    (26 files, where root resolution gives 27).

  This causes no false hit today, because no rialto-catalog tsc project reads a root-level
  `.ts`. But the next test location added at root would silently not apply to these packages.
  ADR-015 says CI uses a remote cache, so a stale green typecheck would replay in CI too, not
  only locally.

- Fix (this branch):
  - Each override now starts with `"$TURBO_EXTENDS$"` and keeps only its extra
    `$TURBO_ROOT$/…` files. Turbo 2.11.0 supports this syntax.
  - A new describe in `scripts/__tests__/turbo-task-inputs.test.mjs` asserts that every
    tracked package `turbo.json` with a `tasks.typecheck.inputs` override starts with
    `$TURBO_EXTENDS$`. It reads config text on purpose: today's file hashes cannot show
    future drift. Its docstring says so.
  - The gotchas bullet now names the rule.
- Evidence:
  - RED before the config change: `3 failed | 1 passed` (each override failed with
    `expected 'src/**' to be '$TURBO_EXTENDS$'`).
  - GREEN after: `turbo-task-inputs.test.mjs` 15/15. The 7 existing app hash probes still
    pass, which proves that inherited `e2e/**` and `*.ts` still move the hash.
  - Resolved input sets match before and after: rialto-web 358 = 358, hospitality 531 = 531.
    Rialto-catalog went from 26 to 27 (`+vitest.config.ts`, which closes the drift).
  - Inheritance probe: a temporary `index.html` appended to root `typecheck.inputs` appeared
    in both hospitality's and rialto-web's dry-run inputs (`true`/`true`). Root was restored
    afterwards.
- Standard: none
- Decision: fixed

### Minor: `tools/cli` `issue.test.ts` depends on a real `gh --version` finishing within 5 s (cause of the bb85b3071 main-push red)

- Scenario: `transitionIssue` tests build `createGhClient({ runner })` with no `probe`.
  `createTransportRunner` runs the process-wide memoized `probeGh`, which is `execFileSync("gh",
["--version"], { timeout: 5_000 })`. The injected `runner` is used only if that probe succeeds.
  Here is what the failing job shows:
  - The job ran `pnpm turbo test:coverage --concurrency=2` on a cold cache (8 cache misses).
  - `issue.test.ts` took **5107 ms** (`10 tests | 5 failed`), which is the probe timeout.
  - All 5 `transitionIssue` tests then failed together. Each got
    `MissingGithubTokenError … resolveToken ../../packages/gh-client/src/rest-args.ts:16`,
    from the REST fallback with no token.

  The memoized `false` is why all five failed as one. The sibling `check-model.test.ts` already
  injects `probe: () => true`. `issue.test.ts` is the outlier.

- Did this run cause it? No. The run's only link is that it triggered the test.
  - bb85b3071 changed no `tools/cli` file and no gh-client non-test source. It changed only
    `packages/gh-client/package.json` (the `typecheck` script), `tsconfig.test.json` and seven
    gh-client `*.test.ts` files.
  - The `package.json` edit changes `@mbe/gh-client`'s task hash. That is a cache miss for its
    dependents, so `@mbe/cli#test:coverage` really executed instead of replaying.
  - The failure itself is a runner-load timeout in code that predates the run: gh-client's
    transport/probe dates from #3699, 2026-08-02.
  - The next main push, a2d05bdd4, had the same tools/cli and gh-client source and was green.
  - Main's last four earlier ci.yml failures (37566906625, 37416547647, 37410776168, 37359920871) show no `MissingGithubTokenError`, so this is a one-off load flake, not a
    recurring one.
- Standard: none
- Decision: deferred. The file is outside this run's scope (tools/cli was never touched), and
  the run is tests-for-typecheck only. The fix is one line: `createGhClient({ probe: () => true,
runner })` in each `transitionIssue` test, matching `check-model.test.ts`. It is worth its
  own small PR.

### Nit: `tscProjectsOf` counts a project as covered even when its exit code is swallowed by `||`

- Scenario: a script such as `tsc --noEmit -p tsconfig.test.json || true` splits on `||`. The
  guard records the project as covered, but `typecheck` can never fail on it. No script uses
  `||` today (all 29 were checked). The guard handles the other unfamiliar shapes loudly:
  - `pnpm run x` delegation, `vue-tsc` alone, and `tsc -b` each throw.
  - A quoted `-p` path fails on the `existsSync` check.
  - A chained non-tsc checker is ignored. That only under-counts, which fails safe.

  A new `tsconfig.*.json` that is not in the chain leaves its tests uncovered, and the guard
  goes red. That is the intended behaviour, and verification mutation (a) shows it.

- Standard: none
- Decision: deferred. No current script has this shape, and the cost is one regex alternative.
  It is noted here in case a future script adds `||`.

### Nit: the gotchas bullet said the test config "is chained into" `typecheck`, but for 14 packages it replaces `tsconfig.json`

- Scenario: library packages and hospitality run only `tsc --noEmit -p tsconfig.test.json`,
  a superset of the base files. The production config is still compiled by `build` (`tsc`,
  and `tsc -b` for hospitality), which CI runs. So nothing is lost. But "chained" implies two
  passes, and a reader could then add a redundant `tsc --noEmit &&`.
- Standard: none
- Decision: fixed. The gotchas wording now says the config runs alone where it is a superset,
  and is chained after `tsconfig.json` otherwise.

### Nit: the copied `rootDir: "../../"` in 13 library `tsconfig.test.json` relaxes the rootDir check on production sources under `typecheck`

- Scenario: a production file in, say, `packages/jobs/src` that imports `../../other/src/x`
  passes `typecheck`. It fails only in `build`, where base `rootDir: "src"` gives TS6059. CI
  runs `build`, so this is caught before merge, one job later.
- Standard: none
- Decision: deferred. No gate is lost (`build` is in `CI Gate`). Narrowing `rootDir` per
  package needs a per-package measurement of which tests import across packages, which is
  out of proportion for a nit.

## Inventory (focus areas with no finding)

### Config consistency across the 18 packages, plus rialto and rialto-catalog

| Shape                                     | Packages                                                                                                                                                                     | `typecheck` runs                                                                | Gap / waste                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Library, base excludes `src/**/*.test.ts` | agent-core, agent-test-utils, api-client, auth, cancellation-policy, database, gh-client, jobs, notifications, service-bootstrap, supply-chain-scanner, test-fixtures, types | `tsconfig.test.json` only (`include: ["src"]`, `exclude: []`, `noEmit`)         | none; `build: tsc` keeps the base honest                         |
| App, base excludes tests                  | hospitality                                                                                                                                                                  | `tsconfig.test.json` + `tsconfig.e2e.json`                                      | none; e2e program pulls 2 `src/` files                           |
| App, base already includes tests          | gen, marketing, rialto-web                                                                                                                                                   | `tsconfig.json` + `tsconfig.e2e.json`                                           | none                                                             |
| rialto                                    | —                                                                                                                                                                            | base + `tsconfig.test.json` (`scripts/**/*.test.ts`) + `tsconfig.showcase.json` | showcase program re-checks 49 of 357 component files; negligible |
| rialto-catalog                            | —                                                                                                                                                                            | base (`src`) + `tsconfig.test.json` (`scripts`)                                 | none; test config inherits `noEmit: true` from base              |

Here is why the configs differ. `rootDir`/`allowJs`/`types: ["node"]` appear only where the
e2e program reaches out of the package: hospitality imports `scripts/venue-journey/report.mjs`,
and rialto-web imports `infrastructure/worker/csp.js`. The overlap was measured with
`tsc --listFilesOnly`. The duplicate checking stays small and does not need project references.

### Guard design

- It asks tsc for resolved `files` rather than grepping, so `extends`-inherited `exclude` and
  `.ts`/`.tsx` shadowing are both visible to it.
- It enumerates through the shared `dep-graph-discovery.mjs`. No workspace packages are nested
  (34 resolved, 0 nested), so `git ls-files -- <wsDir>` never double-counts.
- Runtime is about 3.4 s for 5 tests, with the tsc spawns in parallel. `beforeAll` has a 120 s
  budget.
- `scripts/turbo.json` hashes `packages/**/tsconfig*.json`, `packages/**/*.{test,spec}.*`,
  `tools/**` (both), `apps/**`, `services/**` and `infrastructure/**`. Together these cover
  every file the guard reads. The tsconfig hash response is pinned by a probe.

### Casts, `!` and `any`

- About 323 added lines carry a `!` in total: PR1 22, PR2 71, PR3 150, PR4 69, PR5 11, PR6 0.
  Almost all are `noUncheckedIndexedAccess` on `mock.calls[0]!` or array indexing in tests.
  A wrong `!` throws a TypeError, which fails the test. It does not mask anything.
- There are 5 `as unknown as` casts. All five sit in named helpers with a stated reason:
  partial SDK fixtures, NodeSDK private members, and the `fastify.close` overload.
- `ActivityFeed.test.tsx` has `{ id: "res-1" } as Reservation`, with a comment saying the
  payload is never read.
- The showcase `id as ThemeMode`/`as VibeName` keeps the cast form that existed before the
  run. `SegmentedControl` yields `string` ids.
- No `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck` or strictness relaxation was added.
  Verification confirmed this with a grep. Nothing here needs tightening.

### Gotchas accuracy

Besides the wording nit above (now fixed) and the new `$TURBO_EXTENDS$` clause, the bullet's
claims check out:

- The `extends`-inherited `exclude` trap: api-client covered 0 of 19 tests.
- `.ts`/`.tsx` shadowing.
- The still-uncovered list: JS tests, `tests/smoke/smoke.spec.ts`, and e2e files not linted.
- `.husky/pre-push` runs no typecheck.

### Adjacent observation (outside the run's diff; not a finding against it)

Root `tasks.test.inputs` is `src/**`, `package.json` and `vitest.config.ts`. It does not hash
apps' root-level vitest files, such as `apps/hospitality/vite.manualChunks.test.ts`. A local
`turbo test` can therefore replay over an edit to one. CI is unaffected, because it runs
`test:coverage`, which has default (all-files) inputs. The root `test` inputs predate this run.

## Passes with no findings

- **Correctness:** clean apart from the deferred tools/cli flake, which predates the run and
  sits outside its diff. Verify's mutations (guard a/b/c, wrong-shaped mock) already cover the
  regression floor, so they were not repeated here.
- **Security:** clean. The changes are configs, tests, docs, showcase demo source and two
  type-only non-test edits. The guard spawns `tsc`/`git` with `execFile` argument arrays and
  no shell, and parses script text without executing it. There are no secrets, no auth,
  payment or migration surface, and no new runtime input.
- **ADRs:** `node tools/cli/dist/index.js check-adr` gives `No architectural violations
detected`. ADR-015 (turbo task graph, remote cache) and ADR-016 (`CI Gate`) are consistent
  with the change. The `$TURBO_EXTENDS$` fix strengthens ADR-015's cache correctness.

## Gates run for the fix on this branch

```
pnpm exec vitest run … turbo-task-inputs.test.mjs typecheck-covers-tests.test.mjs
  Test Files  2 passed (2)   Tests  20 passed (20)
pnpm --dir scripts test
  Test Files  255 passed (255)   Tests  4856 passed (4856)   (4852 + 4 new)
pnpm --dir scripts lint                       → clean
turbo run typecheck --filter=@mbe/rialto-catalog --filter=@mbe/hospitality --filter=@mbe/rialto-web
  Tasks: 12 successful, 12 total
pnpm regen --check                            → All generated artifacts are up to date.
prettier --check (changed files)              → All matched files use Prettier code style!
```

## Verdict

Ready to ship. There are no critical or major findings. The one minor that touched the run's
own design, turbo input drift, is fixed on this branch with a guard. The other minor is the
tools/cli probe flake behind the bb85b3071 red. It predates the run, was not caused by its
diff, and is deferred with a one-line fix. The remaining nits are fixed or deferred with
reasons. Ship needs to carry this branch's review commit: three package `turbo.json` files,
one test describe and one gotchas sentence.
