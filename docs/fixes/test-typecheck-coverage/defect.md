---
stage: capture
run: maintenance:test-typecheck-coverage
date: 2026-10-08
re-entry: implement
origin: Review stage of maintenance:floor-plan-cache-keys (2026-10-07) — no backlog seed, no tracker issue
status: implementing — Matt chose option A (real fixes, 5 PRs) on 2026-10-08; see autorun-brief.md § Decisions after Capture
assumptions:
  - "Volume policy (brief, orchestrator default): measured total is 679 errors, over the ~500 trigger. Capture STOPPED here and surfaced the counts. Resolved 2026-10-08: Matt chose option A (real fixes everywhere, the 5-PR plan below)."
  - "Measurement method (Capture's choice, the brief is silent): per package, a throwaway tsconfig.ttc-tmp.json extending ./tsconfig.json with every escaped test file's directory added to include, the non-test excludes kept, rootDir widened to ../.. (the api-client/types precedent), then tsc --noEmit -p on it. The file was deleted right after each run and never committed. Counts are TS diagnostics (`error TSxxxx` lines), not distinct root causes."
  - "e2e/ Playwright specs, and root-level *.test.ts files outside src/, are counted as escaped tests in the measurement (36 errors). The brief says every package's typecheck covers its test files and does not single out e2e. Whether e2e lands in the same PRs is listed as a separate choice under § Decision needed rather than decided here."
  - "JS tests (.test.js/.test.mjs: scripts/ 254, plugins/acmm 36, infrastructure/worker 16) are out of scope. tsc cannot type-check them without checkJs and JSDoc, and the brief prefers tsc and leaves out production behaviour changes. Recorded, not measured."
  - "re-entry: implement (Capture's call per brief). The target shape is settled by precedent (a per-package tsconfig.test.json and a typecheck script that points at it), so this needs no Architect pass. The one open question is volume and strategy, which is a scope decision for Matt, not a design document."
---

# Condition: test files escape `pnpm typecheck` in 18 workspace packages

## Defect (or Condition)

**Degraded:** `pnpm typecheck` (`turbo run typecheck`, the CI `Typecheck` job, part of `CI
Gate`) is supposed to type-check the codebase. For 18 workspace packages it type-checks some
or all of the test files **not at all**. Vitest strips types and never checks them. So in
those packages a test with a wrong-shaped mock, a stale prop or a renamed field compiles,
runs and passes, and nothing anywhere goes red. `.claude/rules/gotchas.md` § Pre-push /
typecheck already describes this trap ("Vitest does NOT typecheck") but no gate stands
behind it.

**Target state (ends the run):**

1. Every TS/TSX unit test file tracked in a workspace package is in at least one tsc project
   that the package's `typecheck` script runs.
2. The type errors this exposes are fixed **in the tests**, with no production behaviour
   change.
3. A guard test fails when any package's typecheck projects stop covering a tracked test
   file. It must fail on today's configs.
4. The gotchas bullet describes a guarded trap, not an unguarded one.

## Reproduction / Evidence

All commands were run in the worktree at `origin/main` `e4dd62ca4`, after
`pnpm install --frozen-lockfile` and
`pnpm turbo build --filter='./packages/*' --filter='@mbe/cli...'` (20/20 tasks green).

**Coverage measurement:** for each package with a `typecheck` script, every `-p` project in
that script (default `tsconfig.json`) was passed to `tsc --listFilesOnly`. The result was
compared with `git ls-files` for `*.test|spec.ts(x)`.

**Error measurement:** escaped tests were added to a throwaway config and run through
`tsc --noEmit`. See `assumptions:`.

### Per-package table

| Package                         | How tests escape                                                                                                                                          | TS tests | Escaped | Errors when included | Dominant codes                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------: | ------: | -------------------: | ------------------------------------------------------------------------------ |
| `packages/agent-core`           | `exclude: src/**/*.test.ts`                                                                                                                               |       98 |      98 |              **255** | TS2532 126, TS18048 47, TS2345 28, TS2322 10, TS6133 9, TS2722 9               |
| `apps/hospitality`              | `exclude: src/**/*.test.ts(x)`; `e2e/` and `vite.manualChunks.test.ts` outside `include: [src]`                                                           |      207 |     207 |      **226** (4 e2e) | TS2322 89, TS2532 54, TS6133 15, TS2353 14, TS2345 10, TS2741 9                |
| `packages/notifications`        | exclude                                                                                                                                                   |        8 |       8 |                   56 | TS2739 32 (mock missing props), TS2532 24                                      |
| `apps/rialto-web`               | `e2e/` and `token-count.config.test.ts` outside `include: [src]`                                                                                          |       77 |      16 |          36 (31 e2e) | TS2591 18 (no node types under the react config), TS7006 7, TS2532 5, TS7016 2 |
| `packages/gh-client`            | exclude                                                                                                                                                   |       18 |      18 |                   35 | TS2532 22, TS7006 9, TS18048 3                                                 |
| `packages/agent-test-utils`     | exclude                                                                                                                                                   |        4 |       4 |                   21 | TS2532 15, TS2322 3, TS18048 3                                                 |
| `packages/service-bootstrap`    | exclude. Its `tsconfig.test.json` lists only `register-endpoint(.test).ts`                                                                                |       13 |      12 |                   14 | TS2345 14                                                                      |
| `packages/auth`                 | `exclude: src/**/*.test.ts` (its 3 `.test.tsx` already slip through and are checked)                                                                      |       10 |       7 |                    8 | TS18046, TS2532, TS2352, TS2493                                                |
| `packages/database`             | exclude                                                                                                                                                   |        5 |       5 |                    7 | TS2348 5, TS2532 2                                                             |
| `packages/supply-chain-scanner` | exclude                                                                                                                                                   |        5 |       5 |                    5 | TS2532 3, TS18048 2                                                            |
| `packages/test-fixtures`        | exclude                                                                                                                                                   |        2 |       2 |                    4 | TS2322 3, TS2532 1                                                             |
| `packages/api-client`           | **"Precedent" is broken.** `tsconfig.test.json` sets `include` but not `exclude`, so it inherits `exclude: src/**/*.test.ts` and covers **0 of 19** tests |       19 |      19 |                    3 | TS2591 2, TS2339 1                                                             |
| `packages/jobs`                 | exclude                                                                                                                                                   |        5 |       5 |                    3 | TS6133 2, TS2488 1                                                             |
| `packages/rialto-catalog`       | `scripts/__tests__/` outside `include: [src]`                                                                                                             |        7 |       1 |                    3 | TS5097 2 (`.ts` import extension), TS2532 1                                    |
| `packages/rialto`               | `scripts/*.test.ts` outside `include: [src]`                                                                                                              |      154 |       7 |                    2 | TS2532 1 (in `scripts/component-metadata.ts`, non-test), TS2345 1              |
| `apps/gen`                      | `e2e/` outside `include: [src]`                                                                                                                           |       32 |       4 |              1 (e2e) | TS2769 1 (`e2e/auth-helpers.ts`)                                               |
| `apps/marketing`                | `e2e/` outside `include: [src]`                                                                                                                           |       41 |      10 |                    0 | none                                                                           |
| `packages/cancellation-policy`  | exclude                                                                                                                                                   |        2 |       2 |                    0 | none                                                                           |
| **Total**                       |                                                                                                                                                           |          | **430** |              **679** |                                                                                |

**Already covered, no change needed:** `packages/types` (its `tsconfig.test.json` sets
`exclude: []`, 15/15), `services/agent` (36), `services/reservations` (121),
`services/users` (11), `tools/cli` (45), `tools/route-contract` (8), `packages/config` (6),
`packages/mcp-server` (10), `packages/observability` (8), `packages/sentry` (3),
`infrastructure/pulumi` (2). These have `include: [src]` (or `*.ts`) and no test exclude.
The services exclude tests only in `tsconfig.build.json`, which is the shape every package
should have.

**No typecheck script / JS tests (out of scope, see `assumptions:`):** `scripts/` (254
`.test.mjs`), `plugins/acmm` (36), `infrastructure/worker` (16 `.test.js`),
`tools/mutation-testing` (none). `packages/rialto-plugin` has no tests.

### Error categories (all 679)

- **`noUncheckedIndexedAccess` (TS2532 256 + TS18048 59 = 315, 46%).** Mostly
  `mock.calls[0]`, `result[0].field`. These fix mechanically with `!` or `?.`. `!` is not
  lint-banned, and agent-core tests already contain 85 `!.` uses, so this is idiomatic here.
  Whether 315 `!` insertions count as "real fixes" or as a suppression sweep is the judgment
  call behind § Decision needed.
- **Mock and fixture shape mismatches (TS2322 107, TS2345 54, TS2739 37, TS2353 14, TS2741
  9, TS2561 3, about 224).** These are the bug class the gotcha warns about. Examples:
  notifications mocks missing required props (TS2739 ×32), service-bootstrap ×14 TS2345,
  hospitality ×89 TS2322.
- **Hygiene (TS6133 unused 26, TS7006 implicit any 25).**
- **Environment and config (TS2591 20 missing node types, TS7016 3 untyped `.mjs`/`.js`
  imports, TS5097 3 `.ts` import extensions, TS2304 6).** These are fixed by test-config
  `types`/`allowImportingTsExtensions` settings, not by test edits. Concentrated in
  rialto-web e2e, api-client and rialto-catalog.
- **Errors outside test files (12).** 7 are in e2e helpers and support files and 3 in
  `rialto-web/token-count.config.ts`. The remaining 2 are `packages/rialto/scripts/component-metadata.ts:525`,
  a TS2532 in a **non-test** build script that is outside `include` today; it shows up twice,
  through rialto and through rialto-catalog. Fixing it touches non-test source, but a `?.`/guard
  there does not change behaviour for well-formed input. Flagged for the implementer.

### CI wiring

`.github/workflows/ci.yml` `typecheck` job runs `pnpm typecheck` = `turbo run typecheck`.
The job is in `ci-gate`'s `needs`. A package `typecheck` script change is therefore picked
up automatically, so no CI change is needed **for tests under `src/`**. The trap:
`turbo.json` `tasks.typecheck.inputs` is
`["src/**", "package.json", "tsconfig*.json", "$TURBO_ROOT$/packages/config/typescript/**"]`.
Tests under `e2e/`, `scripts/` or at the package root are not inputs, so after they join a
typecheck project an edit to them alone would get a **turbo cache hit, replaying a stale
green**. Any batch that covers tests outside `src/` must widen `inputs` in the same PR
(e.g. add `e2e/**`, `scripts/**`, `*.ts`).

## Root-cause hypothesis

_Hypothesis._ Every library package builds with plain `tsc` from `tsconfig.json`, emitting
`dist/`. The test exclude in `tsconfig.json` exists to keep tests out of `dist`, and the
same file doubles as the typecheck config, so excluding tests from the build also excluded
them from typecheck. The services avoided this by putting the exclude in
`tsconfig.build.json`. The partial fixes (api-client, service-bootstrap) failed in two
different ways:

- api-client relied on TS `exclude` inheritance being reset by `include`. It is not reset:
  `exclude` is inherited from the base unless the child sets it.
- service-bootstrap scoped its test config to a single file.

The `e2e/`/`scripts/` escapes are a second, independent mechanism: `include: [src]` never
reached them.

## Blast radius

- **Who:** every agent and human writing tests in the 18 packages. That covers 430 test
  files, including the two highest-churn surfaces, `apps/hospitality` (207) and
  `packages/agent-core` (98).
- **How badly:** silent. Tests can assert against shapes the code no longer has, so a test
  "pins" behaviour it does not actually exercise. The 224 shape-mismatch diagnostics are
  candidates for exactly that. No runtime or production impact: this is a test-quality gate,
  with no user-facing surface.
- **Since when:** as long as each package has existed with its exclude. Not a regression.
- **Scale for Review/Ship:** test and config files only, with many files but low risk per
  file. Review should sample the shape-mismatch fixes for weakened assertions (`as any`,
  `as unknown as`), not re-read all 315 `!` insertions.

## Ruled out

- **"api-client and types are the precedent."** Only `types` actually works. api-client's
  test config covers 0/19, measured with `tsc --listFilesOnly -p tsconfig.test.json`. Copy
  the `types` shape (explicit `"exclude": []`), not the api-client one.
- **"Dropping the exclude from `tsconfig.json` is simplest."** For the 12 library packages it
  would ship compiled tests into `dist/` (their `build` is plain `tsc`). This is viable only
  for `apps/hospitality` (`tsc -b && vite build` with `noEmit` from the react base), and even
  there it makes `build` fail on test type errors. The `tsconfig.test.json` shape is the
  uniform choice.
- **CI wiring change for `src/` tests.** Not needed. `turbo run typecheck` is already in
  `CI Gate`. Only the turbo `inputs` caveat above applies.
- **Lint ban on `!`.** None exists in the eslint configs. The `!` fixes would pass lint.
- **In-flight duplicate.** Ran `gh pr list --state open --limit 100`: 27 open PRs, none
  touching tsconfig/typecheck coverage (closest: #6146 expands agent-core eval tasks, #6121
  adds a reservations test). Nothing matches, and the check did run.

## Decision needed (volume policy, STOP)

**Resolved 2026-10-08: Matt chose A** (autorun-brief.md § Decisions after Capture).

Measured 679 > ~500. Choices for Matt:

- **A. Real fixes everywhere, split into PRs.** `!`/`?.` for indexed access, matching the
  repo idiom, plus mock corrections. **Recommended**, because 46% of the volume is
  mechanical and the rest is the bug class the run exists to surface.
- **B. Test configs set `noUncheckedIndexedAccess: false`.** This removes about 315 and lands
  at about 364. It relaxes strictness for tests, which is arguably a suppression strategy.
- **C. Phase it.** The guard plus every package except agent-core and hospitality (about 198
  errors) now, then those two as follow-up runs or PRs. The guard would need an allowlist
  for the two deferred packages, which is a ratchet, which the brief also routes to Matt.
- **Orthogonal: e2e and root-level tests** (36 errors, 4 apps, plus the turbo-inputs change)
  go either in the same PRs or as a separate final batch.

## Work items

<!-- Drafted for option A with e2e as its own batch. Matt chose option A on 2026-10-08,
     so this plan is live. -->

**PR 1: guard plus small packages (about 49 errors)**

- [x] **Guard test (RED first)** — `scripts/__tests__/typecheck-covers-tests.test.mjs`
      (runs under the existing `scripts` vitest suite). For each workspace package with a
      `typecheck` script, resolve every `-p` project, `tsc --listFilesOnly` each, and assert that
      every tracked `*.test|spec.ts(x)` under the package (scoped to non-e2e until PR 5) appears
      in at least one. It must detect inherited excludes, so it uses listFilesOnly or
      `--showConfig`, not a grep for `"exclude"`.
  - Accept: fails on the `e4dd62ca4` configs and names the packages from the table; passes
    after the last batch.
  - Note: about 30 tsc invocations. Measure runtime and, if slow, use `--showConfig` plus
    glob matching instead of listFilesOnly.
- [x] **Config + fixes: `api-client` (3), `jobs` (3), `test-fixtures` (4),
      `supply-chain-scanner` (5), `database` (7), `auth` (8), `cancellation-policy` (0),
      `service-bootstrap` (14), `rialto` + `rialto-catalog` `scripts/` (5)** — add a
      `tsconfig.test.json` per package (types shape: `extends ./tsconfig.json`,
      `rootDir: ../..`, `noEmit`, `include` covering the test dirs, `exclude: []`, plus `types`
      or `allowImportingTsExtensions` where TS2591/TS5097 call for it), point the `typecheck`
      script at it (keep `tsc --noEmit` on the build config too where the build config isn't a
      subset), fix the tests, and widen turbo `inputs` for rialto/rialto-catalog `scripts/**`.
  - Accept: `pnpm turbo typecheck --filter=<each>` green and the guard passes for these
    packages. Mock fixes match the real interface, with no `as any` or `as unknown as`
    without a stated reason.

**PR 2: `gh-client` (35), `agent-test-utils` (21), `notifications` (56) — about 112**

- [x] **Config + fixes** — same shape. The notifications TS2739 ×32 means its mocks need the
      missing required props.
  - Accept: as above.

**PR 3: `packages/agent-core` (255)**

- [x] **Config + fixes** — same shape. 173 are indexed-access errors. Split into 3a/3b by
      subdirectory if the diff isn't reviewable.
  - Accept: as above.

**PR 4: `apps/hospitality` unit tests (222)**

- [x] **Config + fixes** — `tsconfig.test.json` (react base) covering `src/**` tests.
      89 TS2322 means prop and mock shape drift. `vite.manualChunks.test.ts` moved to PR 5
      with the other root-level app tests (orchestrator, 2026-10-08).
  - Accept: as above.

**PR 5: e2e and root-level tests in apps (36 e2e + 5 rialto-web root = 41)**

- [x] **Config + fixes** — cover `apps/{hospitality,rialto-web,gen,marketing}/e2e/**` and
      `apps/rialto-web/token-count.config(.test).ts` (node types), widen turbo
      `tasks.typecheck.inputs` to include `e2e/**` and root `*.ts`, and lift the guard's e2e
      scoping.
  - Accept: the guard covers e2e. Editing only an e2e spec busts the typecheck cache (verify
    with `turbo run typecheck --filter=<app> --dry=json` showing a changed hash).

**PR 6: `packages/rialto` showcase test (1 test, 27 non-test errors)** — added 2026-10-08 (Matt)

- [ ] **Config + fixes** — bring `packages/rialto/src/showcase/App.vibes.test.tsx` under a
      typecheck project and fix the 27 showcase-source errors it pulls in (TS2322 ×15, TS2353
      ×7, TS4104 ×2, TS7006 ×2, TS2305 ×1). Showcase demo-app source edits are allowed (not
      type-only, unpublished demo code), each called out in the PR body.
  - Accept: the guard passes for `packages/rialto` with no `PENDING_IN_THIS_RUN` entry.

**Final (in the last PR)**

- [ ] **Empty and delete `PENDING_IN_THIS_RUN`** in the guard test (added at PR1, see
      Notes). Each later PR removes its own entries; the guard's stale-entry test forces it.
  - Accept: the constant no longer exists.
- [ ] **gotchas.md** — rewrite the "Vitest does NOT typecheck" bullet: the trap still exists
      in vitest, but `pnpm typecheck` now covers tests and the guard test enforces it. Also
      record the TS `exclude`-inheritance trap that broke api-client.
  - Accept: the bullet names the guard file.
- [ ] **Gates** — `pnpm lint`, `pnpm typecheck`, `pnpm test` (including the scripts suite),
      `pnpm regen --check`, all green per PR.
  - Accept: `CI Gate` green on each PR's final head.

## Notes

- 2026-10-08 Capture: stopped at the volume policy (679 > ~500). Awaiting Matt's choice
  under § Decision needed before Implement.
- 2026-10-08 Implement PR1 (branch `fix/test-typecheck-coverage`, from `origin/main`
  `e4dd62ca4`):
  - **Guard.** `scripts/__tests__/typecheck-covers-tests.test.mjs` enumerates workspace
    packages from `pnpm-workspace.yaml`, parses each `typecheck` script into its `tsc -p`
    projects, and asks `tsc --showConfig -p <project>` for the resolved root `files` (so
    inherited `exclude` and `extends` chains count), then diffs against `git ls-files`
    `*.(test|spec).(ts|tsx|mts|cts)`. Chose `--showConfig` over `--listFilesOnly`: same root
    set for test files (tests are never imported), no module resolution, so it does not depend
    on built dists. RED on today's configs named exactly the 10 PR1 packages (api-client,
    auth, cancellation-policy, database, jobs, rialto, rialto-catalog, service-bootstrap,
    supply-chain-scanner, test-fixtures). GREEN after the fixes. Runtime 3.1 s alone, 3.9 s in
    the full scripts suite.
  - **Sequencing list, not an allowlist.** `PENDING_IN_THIS_RUN` names the packages that PRs 2-5
    fix. Each entry must still be uncovered, so a fixed package that stays listed fails the
    stale-entry test. The final PR deletes the list (work item added above).
  - **New finding, deviation: `packages/rialto/src/showcase/App.vibes.test.tsx`.** Capture's
    table missed it. `packages/rialto/tsconfig.json` excludes all of `src/showcase`, and the
    test imports `App.tsx`, which brings in showcase sources carrying **27 non-test errors**
    (TS2322 ×15, TS2353 ×7, TS4104 ×2, TS7006 ×2, TS2305 ×1). This is real prop drift
    against current rialto components (e.g. `SegmentedControl` props, a removed `ColumnDef`
    export). Fixing it means editing demo-app source. That source is not published and not
    behind any gate, but the edits are not purely type-only. It is listed in
    `PENDING_IN_THIS_RUN` as **unassigned**: the orchestrator or Matt has to place it (PR5, its
    own PR, or a separate run).
  - **Turbo inputs.** Root `tasks.typecheck.inputs` gains `scripts/**`: a dry-run showed
    rialto's typecheck hash did not move when only `scripts/lib-external.test.ts` changed,
    and after the change it does. Also new: `packages/rialto-catalog/turbo.json` adds the two
    rialto files that `scripts/generate-catalog.ts` imports by relative path. The catalog's
    hash ignored an edit to `rialto/scripts/component-metadata.ts` until then; A/B/A verified.
    `scripts/turbo.json` `test`/`test:coverage` inputs gain `packages/**` and `tools/**`
    `tsconfig*.json` and test-file globs, plus `packages/config/typescript/**`, because the
    guard reads them. `turbo-task-inputs.test.mjs` gets a probe case for this, which failed
    before the widening.
  - **Per-package diagnostics, before → after:** api-client 3→0, jobs 3→0 (fixing the
    TS2488 exposed 6 more of the same `mock.calls[0]` shape that tsc had not reported, now 8
    sites), test-fixtures 4→0, supply-chain-scanner 5→0, database 7→0, auth 8→0,
    cancellation-policy 0→0, service-bootstrap 14→0, rialto `scripts/` 2→0, rialto-catalog
    `scripts/` 3→0 (2 TS5097 fixed by `allowImportingTsExtensions` in its test config, the
    TS2532 fixed in rialto).
  - **Non-test edits (type-only):** `packages/database/src/testing.ts`, where
    `ReturnType<typeof vi.fn>` → `Mock` on the exported mock types. Under vitest 5 the former
    resolves to `Mock<Procedure | Constructable>`, which is not callable, so every consumer
    calling `mock.getPoolMetrics()` was a type error. The runtime is unchanged and the
    reservations typecheck stays green. Also `packages/rialto/scripts/component-metadata.ts:525`,
    where `name[0].toUpperCase()` → `name[0]!.toUpperCase()`. It erases to identical JS, and
    export names are never empty.
  - **Casts introduced, each with a reason in the code:** `req.query as { venueId?: string }`
    in auth (it mirrors production's `venueIdFromQuery`, since `FastifyRequest.query` is
    `unknown`); `asSdk()` in service-bootstrap (NodeSDK has private members, so the fake is
    `Pick<NodeSDK, "start" | "shutdown">`-checked first); `closeMock()` (`vi.mocked` picks the
    callback overload of `fastify.close`); `h(arg as never)` in test-fixtures (it matches
    `CapturePageLike`'s `(arg: never) => void` listener type).
  - **Build output:** clean `rm -rf dist && pnpm build` for all 10 packages gives the same dist
    file set as before (`find dist -type f`, diffed). Tests stay out of `dist/`.
  - **Adjacent smells (logged, not fixed):** `packages/auth/tsconfig.json` excludes only
    `*.test.ts`, so its 3 `*.test.tsx` are compiled into `dist/` (measured:
    `dist/react/hooks.test.js`, `session-lifecycle.test.js`, ...). That predates this run and
    is unchanged by it. Root `tasks.build.inputs` excludes `scripts/**`, but rialto's
    `build` runs `tsx scripts/generate-all.ts`, so a generator-only edit can replay a cached
    build. `tests/smoke/` holds 1 TS test outside every workspace package, so the guard does
    not see it.
- 2026-10-08 Decision (Matt): the showcase test gets its own **PR 6**, after PR5 (work item
  above, `autorun-brief.md` § Decision). Its `PENDING_IN_THIS_RUN` entry now reads `PR6`.
- 2026-10-08 Implement PR2 (branch `fix/test-typecheck-coverage-2`, from `origin/main`
  `d68f8ec1e`):
  - **Config.** `tsconfig.test.json` in `gh-client`, `agent-test-utils`, `notifications`
    (types shape: `extends ./tsconfig.json`, `rootDir: ../..`, `noEmit`, `include: [src]`,
    `exclude: []`); each `typecheck` script is now `tsc --noEmit -p tsconfig.test.json`. The
    test config is a superset of the build config, so a second `tsc --noEmit` is not needed.
    Their three `PENDING_IN_THIS_RUN` entries are removed.
  - **RED.** With the three configs moved aside and the scripts reverted, the guard failed
    listing `packages/agent-test-utils`, `packages/gh-client` and `packages/notifications` with
    their test files. With the configs in place and no test fixes, `typecheck` exited 2 with
    agent-test-utils 21, gh-client 35, notifications 56 errors (112).
  - **Per-package diagnostics, before → after:** agent-test-utils 21→0, gh-client 35→0
    (as in PR1, fixing the TS2488 `const [req] = mock.calls[0]` sites exposed 3 more of the
    same shape that tsc had not reported), notifications 56→0.
  - **Fixes.** `!` on indexed access (`mock.calls[n]!`, `events[0]!`, `MODEL_PRICING[k]!`).
    notifications: the dispatcher mocks gained the missing `NotificationPort` methods
    (`sendWinBack`, `sendThankYouEmail`) and `SmsPort` methods (`sendWaitlistAdded`,
    `sendWaitlistPositionUpdate`, `sendWaitlistTableReady`), and both are now checked with
    `satisfies` against the real ports. gh-client `sync-http.test.ts`: the fake exec is typed
    as the exported `SyncExecFn`, and the captured args/opts are typed.
  - **Casts introduced, with a reason in the code:** one, `asFixture()` in
    agent-test-utils `mock-claude-client.test.ts` (`as unknown as readonly SDKMessage[]`).
    Replay fixtures are partial SDK messages: the mock yields them verbatim and reads only
    `type`, `total_cost_usd` and `usage`, while the real `SDKSystemMessage`/`SDKResultSuccess`
    carry dozens of required fields that do not matter here.
  - **Non-test edits:** none.
  - **Build output:** `rm -rf dist && pnpm build` in all three packages is green, with no
    `*.test.*` in `dist/`. Build configs are unchanged.
- 2026-10-08 Implement PR3 (branch `fix/test-typecheck-coverage-3`, from `origin/main`
  `bb85b3071`):
  - **Split decision: no split.** The diff is 47 files, about 400 changed lines, nearly all
    one-character `!` insertions, which is under the 3a/3b threshold (about 1500 lines or 60
    files).
  - **Config.** `packages/agent-core/tsconfig.test.json` has the PR2 shape, and `typecheck`
    is now `tsc --noEmit -p tsconfig.test.json`. The `PENDING_IN_THIS_RUN` entry is removed.
    `tsconfig.eslint.json` (`extends ./tsconfig.json`, `exclude: []`) is unaffected and
    `pnpm lint` stays green.
  - **RED.** With the entry removed and no config, the guard failed with
    `expected { 'packages/agent-core': [ …(98) ] } to deeply equal {}`. With the config in
    place and no test fixes, `typecheck` exited 2 with 255 errors (TS2532 126, TS18048 47,
    TS2345 28, TS2322 10, TS6133 9, TS2722 9, TS7006 8, TS2339 6, TS2304 4, TS2352 3,
    TS2488 2, TS2739 1, TS2558 1, TS1360 1). That matches Capture exactly. After the fixes: 0.
  - **Indexed access (TS2532/TS2722, 135).** The `!` marks were placed by a throwaway
    compiler-API script, right after each span that tsc reported as possibly undefined. It
    edited test files only, and no `!!` was produced. TS18048 (47) was fixed at about 12
    declaration sites (`const call = mock.calls[0]!`, `surfaces[0]!`,
    `responseList[idx]!`, `map[task.id]!`, ...) rather than at each use.
  - **Shape fixes toward real interfaces.** `StaticAnalysisResult` mocks gained the
    required `durationMs` (gates, post-commit-gateway). `EvalReport` gained `byCategory` and
    `nonRunCount` (calibrate). `SessionStatus` `"completed"` became `"succeeded"` (eval
    code never reads `status`). Gemini `makeConfig` gained the required
    `repoPath`/`baseBranch`. The `runSession` mock is now `vi.fn<typeof runSession>()` (it
    used the removed vitest-1 tuple generics, which collapsed every call to `never`). The
    `budget-calculator` file was missing its `vi` import (it ran on vitest globals). Unused
    mock params became `_cmd`/`_args`/`_options`. The orchestrator `(e) => events.push(e)`
    callbacks now use a block body (`void` return). `gates` `capturedPrevious` is now mutable.
  - **Type-strengthening.** `cli-adapter.test.ts` `satisfies Record<keyof AdapterResult,
unknown>` demanded optional keys too. It is now `RequiredKeys<AdapterResult>`, and a probe
    confirmed it resolves to exactly the four required keys. `run-git.test.ts` replaces
    `.catch((e) => e as GitCommandError)` with a `gitErrorFrom()` helper that narrows by
    `instanceof` and fails if the call resolved.
  - **Casts introduced, with a reason in the code:** two `as unknown as` in
    `cost-tracker.test.ts`. One is the error-result fixture, whose `usage` has only the 4
    token fields the tracker reads, while NonNullableUsage requires 6 more. The other is the
    null-token case, which sits deliberately outside NonNullableUsage to pin the runtime
    `?? 0`. `gates.test.ts` swapped `(gate as Record<string, unknown>)["lastResult"]` for
    `Reflect.get(gate, "lastResult")`, which keeps the same assertion and needs no cast.
  - **Non-test edits:** none. Only `package.json` (the script) and the new
    `tsconfig.test.json` changed.
  - **Build output:** `rm -rf dist && pnpm build` gives the same 392-file dist set as before
    (diffed).
  - **Adjacent smell (logged, not fixed):** `src/__tests__/fake-phase-deps.ts` (a test
    helper, not `*.test.ts`) is compiled into `dist/__tests__/`. This predates the run and is
    unchanged by it.
- 2026-10-08 Implement PR4 (branch `fix/test-typecheck-coverage-4`, from `origin/main`
  `a2d05bdd4`):
  - **Split decision: no split.** The diff touches 71 files, which is over the 60-file rule of
    thumb, but it is only about 600 changed lines (+363/−233). Most files change by 1 to 3
    lines (an unused `React` import, a `!`, or one missing fixture field). Splitting would
    have needed per-directory pending keys for `src/` and a second round of review for the
    same edits.
  - **Config.** `apps/hospitality/tsconfig.test.json` extends `./tsconfig.json` with
    `noEmit`, `include: [src]` and `exclude: []`. `typecheck` is now
    `tsc --noEmit -p tsconfig.test.json`. The test config is a superset of the build
    config, and plain `tsc --noEmit` never followed the `tsconfig.node.json` reference anyway.
    `tsconfig.json` is unchanged, so `build` (`tsc -b && vite build`) is unchanged too.
    `jsx`, DOM libs and jest-dom types come from the base config and `src/test/setup.ts`. The
    vitest globals need nothing extra: the two files that used `vi`/`afterEach` without
    importing them now import them.
  - **Guard.** `PENDING_IN_THIS_RUN` keys may now be a directory prefix ending in `/`.
    `apps/hospitality` is replaced by `apps/hospitality/e2e/` and
    `apps/hospitality/vite.manualChunks.test.ts` (both PR5). The stale-entry check handles
    prefix keys too. A probe that added `apps/hospitality/src/` failed it as stale.
  - **RED.** The guard failed with `expected { 'apps/hospitality': [ …(171) ] } to deeply equal {}`.
    With the config in place and no fixes, `typecheck` exited 2 with 222 errors, matching
    Capture: TS2322 89, TS2532 54, TS6133 15, TS2353 14, TS2345 10, TS2741 9, TS2722 6,
    TS2352 5, TS2739 4, TS18048 4, TS2561 3, TS2304 2, and 1 each of TS5097, TS2786, TS2740,
    TS2688, TS2604, TS2503 and TS2488. Fixing the TS2488 exposed one more of the same
    `mock.calls[0]` shape. After the fixes: 0.
  - **New finding: a test that tsc could not see.** `src/hooks/use-theme.test.tsx` sat next
    to `use-theme.test.ts`. When two files share a base name and differ only in a
    `.ts`/`.tsx` extension, tsc keeps the `.ts` file and silently drops the `.tsx` one, so
    the guard still listed it after the config was green. It is renamed to
    `use-theme.hooks.test.tsx` and has 0 errors. It is the only such pair in the repo.
  - **Drift fixed toward the current interfaces:**
    - `SetupStep` (`"hours"/"tables"/"publish"` → `"onboarding"/"operating-hours"/"floor-plan"`,
      with `nextStep` set to what `computeReadiness` returns).
    - `NavItem` (`href`/`type`/`status` → `path`/`stepStatus`, plus the required
      `activePath`/`onNavigate` on `DashboardSidebar`).
    - `Table`: the flat `x/y/width/height/shape` fields moved into `shapeMetadata`, and the
      required `minCovers`/`maxCovers`/`priority`/... fields come from a `TABLE_DEFAULTS`
      that each dialog never reads.
    - Fields added to fixtures:
      - `Guest`: `communicationPreference: "both"` (the Prisma default), `noShowCount`,
        `riskScore`, `staffNotes`.
      - `Reservation`: `occasion`/`seatingPreference: null`, and the full shape in
        `ReservationList`.
      - `reservation.guest.communicationPreference`.
      - `GuestSegment.description`.
      - `Pagination.hasPrev`.
      - `DashboardStats`: the waitlist and deposit fields.
      - `FloorPlan.layoutJson`.
      - `Venue`: `venueGroupId`/`currencyCode`.
      - `UseReservationsResult`: `isFromCache`/`lastSyncedAt`.
      - `OnboardingWizardData.floorPlan`.
      - `ReservationHold`, the full shape.
    - `TimeSlot`: `tableIds` → `available`.
    - `VenueContextValue`: `setSelectedVenueId` → `setVenueId` plus the other required
      fields.
    - `useAuth()` state: the 4 new fields in two factories. App.test now uses a full
      `authState()` factory, because a partial cast cannot hold a `vi.fn()` or an
      `ErrorContext`, and its errors carry a real `source`.
    - `JWTPayload`: the full claims, which removes an `as` cast.
    - `shape: "rect"` → `"rectangle"`.
    - Typed `Map<string, TableDisplayStatus>` and `Promise<void>`.
  - **Mechanical.** 68 `!` marks (60 from TS2532/TS2722 spans and 8 from
    `HTMLElement | undefined` arguments) were placed by a compiler-API script after each
    span tsc reported. It edited test files only. 13 unused `import React` lines were
    removed, since the JSX runtime is automatic. An unused `calls` param became `_calls`. A
    dead `_noAvailable` local in WalkInDialog was removed (it was never read). The
    `./use-theme.ts` import became `.js`. The `/// <reference types="node" />` in
    `theme-color-meta.test.ts` was dropped: `@types/node` is not a hospitality dependency,
    and node types already reach the project transitively, as they do for the 17 other tests
    that import `node:*`.
  - **Casts introduced:** one, `data: { id: "res-1" } as Reservation` in
    `ActivityFeed.test.tsx`, with an inline reason: the feed renders only `type` and
    `timestamp`. No `as any` or `as unknown as` was added. The 4 `as any` on
    `createApiClient` call args in `useApiClient`/`usePublicApiClient` tests predate this run;
    only a `!` was inserted before them.
  - **Coverage note:** the `DashboardSidebar` "renders step statuses correctly" test passed
    `status` (an unknown key), so no step icon ever rendered. With `stepStatus` the icons now
    render, but the test still asserts only the labels. Its name overclaims, as it did
    before. Logged here, not fixed.
  - **Non-test edits:** none. The changes are the `package.json` script, the new
    `tsconfig.test.json`, and the guard.
  - **Build:** `pnpm --dir apps/hospitality build` is green, and no `vitest` or
    `@testing-library` code is in `dist/assets`.
  - **Adjacent:** `docs/features/hospitality-service-ux/audit/xcut.md:121` still names
    `use-theme.test.tsx`. It is a dated audit record and is left as written.
- 2026-10-08 Implement PR5 (branch `fix/test-typecheck-coverage-5`, from `origin/main`
  `bdfcad156`):
  - **Config.** Each of `apps/{hospitality,rialto-web,gen,marketing}` gets a
    `tsconfig.e2e.json` (`extends ./tsconfig.json`, `noEmit`, `types: ["node"]`,
    `include: ["e2e", "*.test.ts"]`, `exclude: []`), chained into `typecheck` after the
    existing project (`... && tsc --noEmit -p tsconfig.e2e.json`). `rootDir` is `.` for gen,
    inherited `..` for marketing, and `../..` plus `allowJs` for hospitality and rialto-web:
    their e2e imports out-of-package JS (`scripts/venue-journey/report.mjs`,
    `@mbe/edge-worker/csp.js` = `infrastructure/worker/csp.js`) that had no declarations
    (TS7016), and `allowJs` takes the types from those files' own JSDoc instead of a
    hand-written `.d.ts` that could drift. `tsconfig.json` (the build config) is unchanged in
    all four. The five PR5 `PENDING_IN_THIS_RUN` entries are removed; only the PR6 showcase
    entry remains.
  - **Node types (lockfile change).** TypeScript here no longer auto-includes `@types/*`, so
    every e2e file using `process`/`Buffer`/`node:*` failed TS2591. gen and marketing already
    declare `@types/node: catalog:`; hospitality and rialto-web did not, and nothing
    resolvable from those apps provides it. Both now declare `@types/node: catalog:` (the
    convention of 20 other packages). `pnpm-lock.yaml` gains only the two importer entries
    (+6 lines, version 26.6.2 already in the store); an unrelated `legacy-javascript`
    0.0.1 → 0.0.3 drift that `pnpm install` produced was dropped. CI runs cold once.
  - **RED.** With the entries removed and no config, the guard failed with
    `expected { 'apps/rialto-web': [ …(16) ], …(3) } to deeply equal {}` (rialto-web 16,
    hospitality 36, gen 4, marketing 10). First config draft, without node types: 123 errors
    (hospitality 55, rialto-web 42, gen 6, marketing 20; TS2591 79). With the final config
    and no test fixes, `typecheck` failed with hospitality 4, rialto-web 11, gen 1,
    marketing 1 (17: TS2532 5, TS2345 5, TS2769 3, TS2322 2, TS7006 1, TS2459 1). After the
    fixes: 0 in all four.
  - **Fixes.** `!` on regex groups / indexed access (`token.split(".")[1]!` in gen and
    hospitality `auth-helpers.ts`, `match[1]!`, `locator[2]!`, `block[1]!`, `source[i]!`,
    `violations[0]!` after the `length > 0` assertion). `briefing.spec.ts` imported `type
Page` from `./fixtures.js`, which imports but does not export it; it now imports from
    `@playwright/test` like the other specs (that also cleared the TS7006 on `route`).
  - **Non-test edit (type-only), `packages/test-fixtures/src/ui-quality-capture.ts`.**
    `CapturePageLike.on/off` took `handler: (arg: never) => void`, which no real Playwright
    `Page` satisfies (TS checks callback params one way, so every per-event payload must be
    assignable to the param), so all three `ui-quality.capture.ts` call sites
    (hospitality, rialto-web, marketing) were type errors. The param is now `any` (with an
    inline reason and an eslint-disable; `unknown` would reject the typed handlers), and
    `listen()`'s handler record is typed `Parameters<CapturePageLike["on"]>[1]`. Runtime is
    unchanged; test-fixtures typecheck/test/lint green. The test file's comment about the
    fake's `never` handlers was reworded to match.
  - **Turbo inputs.** Root `tasks.typecheck.inputs` gains `e2e/**` and `*.ts`;
    `apps/hospitality/turbo.json` and `apps/rialto-web/turbo.json` (new Package
    Configurations) add the out-of-package allowJs imports. Dry-run hashes (`turbo run
typecheck --dry=json`) before widening: unchanged for e2e spec, root test, root source
    and cross-package edits in all four apps (the trap, measured). After: each edit moves
    the affected app's hash, and restoring returns it (A/B/A). Pinned by a new `describe` in
    `scripts/__tests__/turbo-task-inputs.test.mjs` (7 cases), which failed 7/7 with the old
    inputs.
  - **Casts introduced:** none. One `any` annotation (above), not a cast.
  - **Build:** `pnpm --dir <pkg> build` green for test-fixtures and all four apps; no test
    code in `dist`.
  - **Adjacent (logged, not fixed):** app `lint` scripts are `eslint src/`, so e2e files
    are type-checked now but still not linted.
