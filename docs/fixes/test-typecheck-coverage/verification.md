---
stage: verify
run: maintenance:test-typecheck-coverage
date: 2026-10-08
verified-at: origin/main 88581c586 (contains all six run PRs)
assumptions:
  - "Bug-class proof package: the brief says 'e.g. notifications or hospitality' and is silent on which. Picked packages/notifications because its tsconfig.json is byte-identical to the pre-run e4dd62ca4 config, so the old `typecheck` script (`tsc --noEmit`) can be run against it unchanged on today's tree for a true before/after."
  - "Bug-class mutation: used a field on a fixture typed by a real port interface (`BookingNotificationInput` in resend-adapter.test.ts), not the `satisfies NotificationPort` mocks. Those `satisfies` clauses were added by this run's PR2, so a mutation there would partly test the run's own edits rather than the old config."
  - "Guard probe (c) needs the throwaway file to be tracked, because the guard reads `git ls-files` (by design: it guards committed tests). The file was registered with `git add -N` (intent-to-add, nothing committed), then removed with `git rm --cached` and deleted."
  - "Test re-run scope, per the stage instructions: `pnpm --dir scripts test` and the `apps/hospitality` suite re-run locally. Every other package suite is taken from the six PRs' green `CI Gate` runs (cited) and main's push CI, not re-run here."
---

# Verification: test files escape `pnpm typecheck`

## Summary

**11 PASS, 0 FAIL. Known gaps are listed under Not verified; none of them is in the target
state.** All checks ran on merged `origin/main` at `88581c586`, in the run worktree after
`pnpm install --frozen-lockfile` and `pnpm build --filter @mbe/cli... --filter @mattbutlerengineering/rialto`.

Verdict: the condition brief's target state holds. Every tracked TS/TSX test file in a
workspace package (972 of 972) is a root file of a tsc project its package's `typecheck`
runs. A full forced `turbo typecheck` is green with 52 tasks and 0 errors. The guard is
green, and each of three mutations makes it fail. A wrong-shaped mock now fails `typecheck`.
The same mock passes the pre-run config and vitest. Turbo's typecheck hash now moves on
e2e and root-level test edits.

## Criteria & evidence

### T1. Every TS/TSX unit test file tracked in a workspace package is in a tsc project its `typecheck` runs (defect.md target 1)

- Check: a scratch replica of the guard's measurement (not committed) that prints counts.
  It enumerates workspace packages with the guard's own `discoverWorkspaceGlobs`/`resolveGlob`
  and parses each `typecheck` script into `-p` projects. It runs `tsc --showConfig -p` on
  each one and intersects the resolved `files` with `git ls-files` `*.(test|spec).(ts|tsx|mts|cts)`.
- Evidence:
  ```
  apps/gen                  32/32    tsconfig.json,tsconfig.e2e.json
  apps/hospitality          207/207  tsconfig.test.json,tsconfig.e2e.json
  apps/marketing            41/41    tsconfig.json,tsconfig.e2e.json
  apps/rialto-web           77/77    tsconfig.json,tsconfig.e2e.json
  infrastructure/pulumi     2/2      tsconfig.json
  packages/agent-core       98/98    tsconfig.test.json
  packages/agent-test-utils 4/4      tsconfig.test.json
  packages/api-client       19/19    tsconfig.test.json
  packages/auth             10/10    tsconfig.test.json
  packages/cancellation-policy 2/2   tsconfig.test.json
  packages/config           6/6      tsconfig.json
  packages/database         5/5      tsconfig.test.json
  packages/gh-client        18/18    tsconfig.test.json
  packages/jobs             5/5      tsconfig.test.json
  packages/mcp-server       10/10    tsconfig.json
  packages/notifications    8/8      tsconfig.test.json
  packages/observability    8/8      tsconfig.json
  packages/rialto           154/154  tsconfig.json,tsconfig.test.json,tsconfig.showcase.json
  packages/rialto-catalog   7/7      tsconfig.json,tsconfig.test.json
  packages/sentry           3/3      tsconfig.json
  packages/service-bootstrap 13/13   tsconfig.test.json
  packages/supply-chain-scanner 5/5  tsconfig.test.json
  packages/test-fixtures    2/2      tsconfig.test.json
  packages/types            15/15    tsconfig.test.json
  services/agent            36/36    tsconfig.json
  services/reservations     121/121  tsconfig.json
  services/users            11/11    tsconfig.json
  tools/cli                 45/45    tsconfig.json
  tools/route-contract      8/8      tsconfig.json

  TOTAL tracked TS tests (repo-wide git ls-files): 973
  In workspace packages: 972; covered by a typecheck project: 972
  TS tests outside every workspace package: tests/smoke/smoke.spec.ts
  JS tests (out of scope): 307 { 'infrastructure/worker': 16, 'plugins/acmm': 36, scripts: 255 }
  ```
  Capture's table showed 430 escaped files across 18 packages. All 18 now show full
  coverage. The one TS test outside the count is `tests/smoke/smoke.spec.ts`, which sits
  in no workspace package (see Not verified).
- Result: PASS

### T1b. The full typecheck is green over the widened projects (Gates work item: `pnpm typecheck`)

- Check: `pnpm turbo typecheck --force` (full, unfiltered, cache bypassed).
- Evidence:
  ```
  exit 0
   Tasks:    52 successful, 52 total
  Cached:    0 cached, 52 total
    Time:    1m3.552s
  ```
  `grep -c "error TS"` on the full log: `0`.
- Result: PASS

### T2. Exposed errors fixed in the tests, no suppression, no production behaviour change (defect.md target 2; brief § Desired shape and Constraints)

- Check: for each of the six merge commits, `git show -U0` with `*.md`/`llms*.txt`
  excluded, grepped for added `@ts-expect-error|@ts-ignore|@ts-nocheck|as any|as unknown as|eslint-disable`.
  Separately grepped for strictness options (`noUncheckedIndexedAccess`, `strict`,
  `noImplicitAny`, `skipLibCheck`) added to any `tsconfig*.json`.
- Evidence:

  ```
  == d68f8ec1e (#6158, 1/6) | 48 files changed, 924 insertions(+), 133 deletions(-)
     +  return fake as unknown as TelemetrySdk;
     +  return fastify.close as unknown as Mock<() => Promise<undefined>>;
  == bb85b3071 (#6162, 2/6) | 22 files changed, 192 insertions(+), 96 deletions(-)
     +  return messages as unknown as readonly SDKMessage[];
  == a2d05bdd4 (#6165, 3/6) | 49 files changed, 273 insertions(+), 182 deletions(-)
     +  } as unknown as SDKResultMessage;
     +    } as unknown as Partial<SDKResultMessage>);
  == bdfcad156 (#6167, 4/6) | 73 files changed, 467 insertions(+), 235 deletions(-)
     +    const callArgs = vi.mocked(createApiClient).mock.calls[0]![0] as any;   (x4)
  == 1cd09d0e6 (#6168, 5/6) | 27 files changed, 236 insertions(+), 38 deletions(-)
     +  // eslint-disable-next-line @typescript-eslint/no-explicit-any   (x2)
  == 88581c586 (#6169, 6/6) | 11 files changed, 130 insertions(+), 100 deletions(-)
  ```

  The strictness grep returned nothing in all six commits.

  Each hit matches an entry the implement log in `defect.md` § Notes already discloses:
  - The 5 `as unknown as` (PR1 ×2, PR2 ×1, PR3 ×2) are wrapped in named helpers, and each
    carries an inline reason: partial SDK fixtures, NodeSDK's private members, and the
    `fastify.close` overload.
  - The 4 `as any` in PR4 were already in the code before the run. Only the `!` before them
    is new. The diff shows the whole line because the line changed.
  - The 2 `eslint-disable` lines in PR5 belong to the documented type-only non-test edit
    to `CapturePageLike.on/off` in `packages/test-fixtures/src/ui-quality-capture.ts`.

  No `@ts-expect-error`, `@ts-ignore` or `@ts-nocheck` was added. Non-test source edits:

  - `packages/database/src/testing.ts`: `vi.fn` type to `Mock`.
  - `packages/rialto/scripts/component-metadata.ts:525`: a `!`.
  - test-fixtures `CapturePageLike`: a param type.
  - rialto showcase demo source (PR6).

  The first three are type-only. Matt pre-authorised the showcase edits (brief § Decision:
  showcase test gets PR 6), and PR6 called each one out. Published `src/components/**` is
  unchanged.

- Result: PASS. Five disclosed, reasoned casts remain. They are recorded here so they are not
  read as zero.

### T3. A guard fails when a package's typecheck projects stop covering a tracked test file (defect.md target 3)

- Check (green baseline): `pnpm exec vitest run --config scripts/vitest.config.mjs scripts/__tests__/typecheck-covers-tests.test.mjs`
- Evidence:
  ```
   ✓ scripts/__tests__/typecheck-covers-tests.test.mjs (5 tests) 3240ms
   Test Files  1 passed (1)
        Tests  5 passed (5)
  ```
- Check (mutation a): move `packages/notifications/tsconfig.test.json` aside.
- Evidence:
  ```
  exit 1
  AssertionError: expected { Object (packages/notifications) } to deeply equal {}
  + {
  +   "packages/notifications": "packages/notifications/tsconfig.test.json does not exist (8 tests)",
  + }
        Tests  1 failed | 4 passed (5)
  ```
- Check (mutation b): re-add the old exclude to `packages/agent-core/tsconfig.test.json`
  (`"exclude": []` to `"exclude": ["src/**/*.test.ts"]`).
- Evidence:
  ```
    "exclude": ["src/**/*.test.ts"]
  exit 1
  AssertionError: expected { 'packages/agent-core': [ …(98) ] } to deeply equal {}
        Tests  1 failed | 4 passed (5)
  ```
- Check (mutation c): add a throwaway `packages/jobs/throwaway-guard-probe.test.ts` at
  the package root. jobs' test config includes only `src`. The file was tracked with
  `git add -N`.
- Evidence:
  ```
  exit 1
  + {
  +   "packages/jobs": [
  +     "throwaway-guard-probe.test.ts",
  +   ],
  + }
        Tests  1 failed | 4 passed (5)
  ```
- Check (restore): each mutation was reverted, and the guard was re-run.
- Evidence:
  ```
  === restored
        Tests  5 passed (5)
  (git status --short, excluding .claude/sessions: empty)
  ```
- The "fails on today's configs" half of the acceptance (RED against `e4dd62ca4`) was shown
  at PR1. defect.md § Notes records that it named exactly the 10 PR1 packages, and PRs 2–6
  each recorded a RED. It was not re-run against `e4dd62ca4` here. Mutations (a) to (c)
  re-establish the same property on merged main.
- `PENDING_IN_THIS_RUN` is gone: `grep -c PENDING_IN_THIS_RUN scripts/__tests__/typecheck-covers-tests.test.mjs` returned `0`.
- Result: PASS

### T3b. The bug class is now caught: a wrong-shaped mock fails `typecheck`, where the pre-run config passed it

- Check: in `packages/notifications/src/resend-adapter.test.ts`, mutate the
  `BookingNotificationInput` fixture. Run the merged `typecheck`
  (`tsc --noEmit -p tsconfig.test.json`), then the pre-run script (`tsc --noEmit` on
  `tsconfig.json`, which is identical to `e4dd62ca4`), then vitest. Revert after each
  mutation.
- Evidence (stale field, `+  partySizeLegacy: 4,`):
  ```
  === new typecheck (merged main script)
  src/resend-adapter.test.ts(14,3): error TS2353: Object literal may only specify known properties, and 'partySizeLegacy' does not exist in type 'BookingNotificationInput'.
   ELIFECYCLE  Command failed with exit code 2.
  === pre-run script (tsc --noEmit on tsconfig.json, unchanged since e4dd62ca4)
  tsconfig.json identical to e4dd62ca4
  old-config exit 0
  === vitest on the mutated file
   Test Files  1 passed (1)
        Tests  19 passed (19)
  ```
- Evidence (wrong type, `-  partySize: 4,` / `+  partySize: "4",`):
  ```
  src/resend-adapter.test.ts(13,3): error TS2322: Type 'string' is not assignable to type 'number'.
  old-config exit 0
        Tests  19 passed (19)
  ```
  Before this run, the pre-run `typecheck` (`git show e4dd62ca4:packages/notifications/package.json`
  → `"typecheck": "tsc --noEmit"`, with `"exclude": ["src/**/*.test.ts"]`) and vitest both
  passed this mock. Now `typecheck` fails on it. The mutation was reverted:
  `git status --short .` is clean.
- Result: PASS

### T4. The gotchas bullet describes a guarded trap and names the guard (defect.md target 4; final work item)

- Check: read `.claude/rules/gotchas.md` § Pre-push / typecheck on main.
- Evidence (line 18, excerpts):
  ```
  - **Vitest does NOT typecheck — `tsc` is the only thing that does, and every workspace package's `typecheck` now runs it over its own tests (`docs/fixes/test-typecheck-coverage`, six PRs starting #6158).**
  … **Enforced by `scripts/__tests__/typecheck-covers-tests.test.mjs`** (runs in `pnpm --dir scripts test`) …
  … (1) **`exclude` is inherited through `extends`** — `packages/api-client`'s old `tsconfig.test.json` set `include` but inherited the base `exclude` and covered 0 of 19 tests …
  … **Still uncovered:** JS tests …, `tests/smoke/smoke.spec.ts` …, and app `lint` scripts are `eslint src/` …
  ```
  The bullet also keeps the pre-push gap, which is accurate: `.husky/pre-push` does not run
  typecheck.
- Result: PASS

### W-turbo. Turbo typecheck inputs cover the new test locations (PR1/PR5 acceptance: editing only an e2e spec busts the cache)

- Check: root `turbo.json` `tasks.typecheck.inputs`, then A/B/A `pnpm turbo typecheck --filter=<pkg> --dry=json`
  task hashes. Append `// probe` to one file, take the hash, then `git checkout` the file
  and take the hash again.
- Evidence:
  ```
  "inputs": [ "src/**", "scripts/**", "e2e/**", "*.ts", "package.json", "tsconfig*.json", …
  apps/hospitality/e2e/auth.spec.ts >>
  hospitality A=bc1b9d1f4cacf042 B=53ac0b530b5cb884 C=bc1b9d1f4cacf042
  apps/rialto-web/token-count.config.test.ts >>
  rialto-web A=0b9a320c4694c50c B=75f59a2196a198aa C=0b9a320c4694c50c
  ```
  The hash moves on the edit and returns on restore. The rialto `scripts/**` A/B/A was
  measured at PR1 (defect.md § Notes), and `scripts/__tests__/turbo-task-inputs.test.mjs`
  pins all of these. That file is part of the scripts suite below.
- Result: PASS

### W-tests. Test suites stay green (Gates work item: `pnpm test` incl. scripts suite)

- Check (local, on 88581c586): `pnpm --dir scripts test`; `pnpm --dir apps/hospitality test`.
  `pnpm exec vitest run src/showcase/App.vibes.test.tsx` in `packages/rialto`.
- Evidence:
  ```
  scripts exit 0
   Test Files  255 passed (255)
        Tests  4852 passed (4852)
  hosp exit 0
   Test Files  182 passed (182)
        Tests  2544 passed (2544)
  rialto showcase:  Test Files  1 passed (1)   Tests  2 passed (2)
  ```
- Relied on from CI, not re-run locally: every other package's suite, via each PR's
  `CI Gate`. See the next criterion.
- Result: PASS

### W-ci. `CI Gate` green on each PR's final head (Gates work item acceptance)

- Check: `gh pr view <N> --json statusCheckRollup`, filtered to `CI Gate`.
- Evidence:
  ```
  #6158 MERGED d68f8ec1e 2026-10-08T18:17:55Z CheckRun SUCCESS …/actions/runs/37811538557 | StatusContext SUCCESS
  #6162 MERGED bb85b3071 2026-10-08T18:38:38Z CheckRun SUCCESS …/actions/runs/37824663615 | StatusContext SUCCESS
  #6165 MERGED a2d05bdd4 2026-10-08T19:00:01Z CheckRun SUCCESS …/actions/runs/37827144934 | StatusContext SUCCESS
  #6167 MERGED bdfcad156 2026-10-08T19:43:11Z CheckRun SUCCESS …/actions/runs/37831619788 | StatusContext SUCCESS
  #6168 MERGED 1cd09d0e6 2026-10-08T20:25:22Z CheckRun SUCCESS …/actions/runs/37836874222 | StatusContext SUCCESS
  #6169 MERGED 88581c586 2026-10-08T20:50:59Z CheckRun SUCCESS …/actions/runs/37840900337 | StatusContext SUCCESS
  ```
- Main push CI (`ci.yml`, `--branch main`), for the record:
  ```
  1cd09d0e6 push success 37839329601
  bdfcad156 push success 37834046930
  a2d05bdd4 push success 37828611255
  bb85b3071 push failure 37825873644
  88581c586 push success 37842507864   (CI Gate: completed success)
  ```
  The `bb85b3071` failure is `Test (Node 22)` → `@mbe/cli#test:coverage`:
  5 × `tools/cli src/__tests__/issue.test.ts > transitionIssue`, with
  `MissingGithubTokenError: gh-client: no \`gh\` binary on PATH and no GITHUB_TOKEN/GH_TOKEN in the environment`.
This is an environment error at runtime, not a type error, and it is in a file the run
did not touch. The next main push (`a2d05bdd4`) contained the same `tools/cli`and`gh-client` source plus agent-core-only changes, and it was green. So the failure did not
  come from the run's diff. It is recorded as an unexplained main flake for Review to note,
  not as a run failure.
- Result: PASS (per-PR gate, and main is green at 88581c586).

### W-regen. Generated artifacts up to date (Gates work item: `pnpm regen --check`)

- Check: `pnpm regen --check`.
- Evidence:
  ```
  regen exit 0
  > node scripts/regen.mjs "--check"
  All generated artifacts are up to date.
  ```
- Result: PASS

### W-pending. `PENDING_IN_THIS_RUN` emptied and deleted (final work item)

- Check: `grep -c PENDING_IN_THIS_RUN scripts/__tests__/typecheck-covers-tests.test.mjs`.
- Evidence: `0`. The guard's last assertion is `expect(offenders).toEqual({})`, with no
  pending filter.
- Result: PASS

## Failures

None.

## Not verified

These gaps are known and out of the target state. The gotchas bullet names each one, so
none of them reads as covered:

- **JS tests: 307 files** (`scripts/` 255, `plugins/acmm` 36, `infrastructure/worker` 16).
  tsc does not check `.test.js`/`.test.mjs` without `checkJs` and JSDoc. They are out of
  scope per defect.md `assumptions:` and the brief.
- **`tests/smoke/smoke.spec.ts`.** This is the one tracked TS test outside every workspace
  package. The guard enumerates only workspace packages, so it never sees the file, and no
  `typecheck` script covers it. Its type-correctness is unknown.
- **e2e files are type-checked but not linted.** App `lint` scripts are `eslint src/`.
- **No committed test mounts the rialto showcase app.** PR6 fixed showcase sources that
  were broken at runtime (the app could not mount). The only proof was a throwaway,
  uncommitted `render(<App />)` probe. `App.vibes.test.tsx` runs in CI (2 tests pass) but
  does not mount the whole app, and showcase is excluded from coverage. A future prop drift
  in showcase now fails `typecheck`, but nothing pins that the showcase renders.
- **Not re-run locally:** the guard's RED against the pre-run `e4dd62ca4` configs (it was
  recorded at PR1); other packages' unit suites, `pnpm lint`, and package `build`s (taken
  from the six PRs' green `CI Gate`).
- **Adjacent smells logged by Implement, unchanged by this run:**
  - `packages/auth` compiles its `*.test.tsx` into `dist/`.
  - agent-core compiles `src/__tests__/fake-phase-deps.ts` into `dist/`.
  - Root `tasks.build.inputs` excludes `scripts/**` while rialto's `build` runs a script
    generator.
  - The hospitality `DashboardSidebar` "renders step statuses" test asserts only labels.
