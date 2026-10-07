---
stage: verify
run: maintenance:static-sentry-dsn-routing
date: 2026-10-02
head: b7963864bd2f16f1e960e58f413ed30a1e4270db
assumptions:
  - "Criteria list = defect.md work items 1-4 (a maintenance run has no prd.md/breakdown.md; defect.md's work items are the breakdown). The end-to-end regression (heartbeat PASS for mattbutlerengineering, live bundles carrying key 3eb05100…) is post-release and is recorded as PENDING-SHIP, never as a pass. Taken from the autorun orchestrator's instruction and the skill's 'maintenance runs: the regression never scales away' rule."
  - "The pre-fix regression proof ran the branch's test file against origin/main's deploy-static.yml in a temporary detached worktree (scratchpad, node_modules symlinked from this worktree, removed afterwards). This is the stash-free equivalent the orchestrator named; origin/main was 1a6082f4b, the branch's merge base."
  - "Red CI on PR #5990 is recorded as an external blocker, not a pass and not a failure of this change: the only failing step is Build's `pnpm audit`, on an advisory this diff does not touch, and main fails identically."
---

# Verification: marketing and rialto-web report to the hospitality Sentry project

## Summary

Local: 6 of 6 checkable criteria PASS, all from commands run on 2026-10-02 against
head `b7963864b`. The new routing test fails against `origin/main`'s workflow (4 of
10 cases) and passes against the branch's (10 of 10). That is the regression proof at
unit level.

Not passing:

- **PR CI is red (external blocker).** `CI Gate` fails only because Build's
  `pnpm audit` step fails on basic-ftp `GHSA-c475-qrg2-pj4r`. `main` fails the same
  way. The fix is open PR #5966. This blocks the merge until #5966 lands. It is not a
  defect in this change.
- **End-to-end regression: PENDING-SHIP.** The heartbeat and the live bundles can only
  change after the secret is created, the PR is merged, and the deploy is dispatched.
  The "before" baseline is recorded below.

Verdict: the change does what defect.md asks, as far as anything before release can
show. Next stage is Review. Ship is gated on #5966 or an equivalent green `CI Gate`.

## Criteria & evidence

### 1. Env-shape test pins per-app DSN and project, and fails on the misrouted shape

- Check: (a) run the test file on the branch; (b) run the **same** test file against
  `origin/main`'s `deploy-static.yml` in a temporary detached worktree at `1a6082f4b`
  (the workflow there is byte-identical to `origin/main`; `git diff --stat` was empty).
- Evidence (a), branch:
  ```
  ✓ scripts/__tests__/deploy-static-sentry-env.test.mjs (10 tests) 5ms
  ✓ scripts/__tests__/require-deploy-secrets.test.mjs (16 tests) 4ms
  Test Files  2 passed (2)
       Tests  26 passed (26)
  ```
- Evidence (b), origin/main workflow:
  ```
  ❯ scripts/__tests__/deploy-static-sentry-env.test.mjs (10 tests | 4 failed) 11ms
    ✓ deploy-static.yml passes the Sentry build environment to every static app (4)
    ❯ deploy-static.yml routes each static app to its own Sentry project (4)
      ✓ pins routing for exactly the apps in STATIC_APPS 0ms
      × routes the marketing build to its expected DSN and project 5ms
      ✓ routes the hospitality build to its expected DSN and project 0ms
      × routes the rialto-web build to its expected DSN and project 1ms
    ❯ deploy-static.yml fails closed when VITE_SENTRY_DSN_MBE is absent (2)
      × deploy-marketing runs require-deploy-secrets.mjs ahead of its build 1ms
      × deploy-rialto-web runs require-deploy-secrets.mjs ahead of its build 0ms
  AssertionError: marketing build step: VITE_SENTRY_DSN is ${{ secrets.VITE_SENTRY_DSN }}, expected ${{ secrets.VITE_SENTRY_DSN_MBE }}; SENTRY_PROJECT is ${{ secrets.SENTRY_PROJECT }}, expected mattbutlerengineering
  AssertionError: rialto-web build step: VITE_SENTRY_DSN is ${{ secrets.VITE_SENTRY_DSN }}, expected ${{ secrets.VITE_SENTRY_DSN_MBE }}; SENTRY_PROJECT is ${{ secrets.SENTRY_PROJECT }}, expected mattbutlerengineering
  AssertionError: deploy-marketing has no VITE_SENTRY_DSN_MBE guard step: expected -1 not to be -1
  AssertionError: deploy-rialto-web has no VITE_SENTRY_DSN_MBE guard step: expected -1 not to be -1
  ```
- Result: **PASS.** The failures name the app and the wrong value. The four presence
  cases and the hospitality routing case still pass on the old shape.

### 2. marketing and rialto-web routed to `mattbutlerengineering`; hospitality untouched

- Check: grep the branch workflow; diff the `deploy-hospitality` job block against
  `origin/main`.
- Evidence:
  ```
  164:          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN_MBE }}     (deploy-marketing)
  166:          SENTRY_PROJECT: mattbutlerengineering
  215:          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}         (deploy-hospitality)
  217:          SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}
  261:          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN_MBE }}     (deploy-rialto-web)
  263:          SENTRY_PROJECT: mattbutlerengineering
  deploy-hospitality job: byte-identical to origin/main
  ```
- Result: **PASS.**

### 3a. Guard step present in both jobs, ahead of the build

- Check: list the step order in each job (lines are relative to the job header).
- Evidence:
  ```
  deploy-marketing:  16 checkout · 23 Require deploy secrets · 30 pnpm/action-setup · 32 setup-node · 37 pnpm install · 42 Collect repo stats · 47 pnpm build --filter=@mbe/marketing · 68 Deploy
  deploy-rialto-web:  7 checkout · 14 Require deploy secrets · 21 pnpm/action-setup · 23 setup-node · 28 pnpm install · 30 pnpm build --filter=@mbe/rialto-web · 41 Deploy
  124:      - name: Require deploy secrets
  126:          VITE_SENTRY_DSN_MBE: ${{ secrets.VITE_SENTRY_DSN_MBE }}
  128:          set -euo pipefail
  129:          node scripts/require-deploy-secrets.mjs VITE_SENTRY_DSN_MBE
  (the same block at 239-244 for rialto-web)
  ```
- Result: **PASS.** The guard runs right after checkout, before install. That is the
  `deploy-services.yml` precedent, which Implement recorded as a deviation. It is
  stricter than "before the build". The test file pins it (criterion 1, cases 9-10).

### 3b. `require-deploy-secrets.mjs` exit codes

- Check: run the guard locally with the variable unset, empty, and set.
- Evidence:
  ```
  ::error::VITE_SENTRY_DSN_MBE is not defined in the step's env block. Refusing to deploy.
  unset -> exit 1
  ::error::VITE_SENTRY_DSN_MBE is defined but empty — check `gh secret set NAME --body "value"`. Refusing to deploy.
  empty -> exit 1
  All 1 required deploy secret(s) present: VITE_SENTRY_DSN_MBE
  set -> exit 0
  ```
- Result: **PASS.**

### 4a. Full scripts suite

- Check: `pnpm --dir scripts test`
- Evidence:
  ```
   Test Files  246 passed (246)
        Tests  4753 passed (4753)
  scripts test exit 0
  ```
- Result: **PASS.**

### 4b. Workflow paths-filter coverage

- Check: `node scripts/check-workflow-paths-coverage.mjs`
- Evidence:
  ```
  deploy-static.yml: scripts/require-deploy-secrets.mjs — deploy gate helper, same reasoning as the deploy-services.yml entry above: ... Recorded in docs/fixes/static-sentry-dsn-routing/defect.md (maintenance:static-sentry-dsn-routing)
  PASS: workflow paths-filter coverage
  paths-coverage exit 0
  ```
- Result: **PASS.** One note for Review: the section header reads "Known, accepted
  gaps (ALLOWLIST — each has a docs/backlog.md seed)". The new entry cites
  `defect.md`, not a backlog seed. Its sibling `deploy-services.yml` entry cites a
  breakdown.md in the same way, so this follows the precedent. The header claim is
  still slightly inaccurate.

### 4c. Lint and typecheck

- Check: `pnpm lint`, `pnpm typecheck`
- Evidence:
  ```
  lint exit 0
   Tasks:    52 successful, 52 total
  typecheck exit 0
   Tasks:    52 successful, 52 total
  ```
- Result: **PASS.** The working tree was clean after the gates. The only untracked file
  was `.claude/sessions/…`, which is not this run's.

### PR #5990 CI (external blocker; not a pass)

- Check: `gh pr checks 5990`, then the step-level job results for run `37075000758`
  (`pull_request`, headSha `b7963864b`). Compared with main's latest push CI run
  `36945050307` (`2ff41db96`).
- Evidence:
  ```
  Build | fail
  CI Gate | fail
  Integrity | skipping
  (every other check: pass or skipping)

  Build job steps:
  8 success Build all packages
  9 success Run Full Repository Audit
  10 failure Run pnpm audit (network-resilient)
  11 skipped Verify generated artifacts are in sync
  12 skipped Check bundle size budgets

  │ high                │ basic-ftp: Quadratic-time CPU denial of service in     │
  │ More info           │ https://github.com/advisories/GHSA-c475-qrg2-pj4r      │
  ##[error]pnpm audit failed with a non-transient result (likely a real high-severity advisory)

  CI Gate: ... build=failure ... integrity=skipped ...
  ##[error]Required job failed or was cancelled

  main run 36945050307: failed jobs = Build, CI Gate; Build failed step = 10 Run pnpm audit (network-resilient); log cites GHSA-c475-qrg2-pj4r
  PR #5966: OPEN fix/basic-ftp-audit-override "fix(deps): widen basic-ftp pnpm override to cover GHSA-c475-qrg2-pj4r"
  ```
- Result: **BLOCKED (external).** `pnpm audit` is the only failing step. Because Build
  stopped there, three checks never ran on CI for this head:
  - Build's "Verify generated artifacts are in sync" and "Check bundle size budgets"
  - the `Integrity` job, which was skipped

  They are **unverified in CI**. Local lint, typecheck, and the scripts suite are green,
  but they do not replace those checks. They must go green after #5966 lands and the
  branch is re-run.

### End-to-end regression: heartbeat and live bundles (PENDING-SHIP)

- Check: the "before" baseline only. Curl each live entry chunk and grep for the
  ingest DSN. Read the latest heartbeat runs, the alert issue, and the secret list.
- Evidence (2026-10-02T23:13:36Z):
  ```
  / /assets/index-BHgqOM0i.js -> https://7faccca51daa0d1c8dae179686042ab8@o4510650299842560.ingest.us.sentry.io/4511413547040768
  /rialto/ /rialto/assets/index-ifu0gcSr.js -> https://7faccca51daa0d1c8dae179686042ab8@o4510650299842560.ingest.us.sentry.io/4511413547040768
  /hospitality/ /hospitality/assets/index-BCZjMWsI.js -> https://7faccca51daa0d1c8dae179686042ab8@o4510650299842560.ingest.us.sentry.io/4511413547040768

  sentry-heartbeat: 37048199667 schedule failure 2026-10-02T18:33:06Z
                    36910621839 schedule failure 2026-10-01T18:56:45Z
                    36819787202 workflow_dispatch failure 2026-10-01T05:26:36Z
  #5941: OPEN
  gh secret list: SENTRY_PROJECT 2026-05-19, VITE_SENTRY_DSN 2026-05-18  (no VITE_SENTRY_DSN_MBE yet)
  ```
- Expected after Ship:
  - `/` and `/rialto/` chunks carry key `3eb05100486a63c8bcd98a58c8911f36`, project
    `4511154257526784`.
  - `/hospitality/` keeps `7faccca5…`.
  - A dispatched heartbeat reports `mattbutlerengineering` PASS, and #5941 closes itself.
- Result: **PENDING-SHIP.** This is not a pass. It is Ship's (and Operate's) to record.

## Failures

None in this change. The red `CI Gate` is an external blocker (see above). It routes
to PR #5966, not back to Implement.

## Not verified

- **Generated-artifact sync, bundle-size budgets, and the Integrity job on CI.** CI
  skipped them because Build stopped at `pnpm audit`. They are pending a re-run after
  #5966.
- **The deployed outcome.** That covers the routed DSN in the live bundles, the
  heartbeat PASS, and #5941 self-closing. All three are post-release.
- **The guard on a real runner.** `VITE_SENTRY_DSN_MBE` does not exist yet. Ship step 1
  creates it before merge. If the merge and deploy dispatch go ahead without it, the
  guard fails both jobs. That is the intended fail-closed behaviour, but it would leave
  the defect live.
- **Source-map symbolication on a `mattbutlerengineering` event.** The SENTRY_PROJECT
  literal is pinned by the test, but whether the maps actually upload and resolve is
  observable only after deploy. defect.md marks this optional for the run.
- **The CSP `connect-src` for the new DSN.** It uses the same org ingest host
  (`o4510650299842560.ingest.us.sentry.io`) as the current DSN, which the baseline
  above confirms. The browser-side acceptance is still a post-deploy check for Ship.
