---
stage: verify
run: maintenance:static-sourcemaps-confirm
date: 2026-10-04
head: 48b07f7a01e915a02918b824c092700390e6653f
assumptions:
  - "Soft gate: work items 1-3 are checked and item 4 (end-to-end proof after merge) is open by design, because it belongs to Ship. This verifies the completed subset, which is the skill's offered default. Item 4's criteria are recorded below as PENDING-SHIP, never as passes."
  - "The enabled-plugin builds ran `pnpm exec vite build` inside each app, not `turbo run build`. Turbo's strict env mode strips SENTRY_URL (it is not in passThroughEnv), so going through turbo would have pointed the plugin at sentry.io. The turbo link is proved separately by the env probe in criterion 1. In 10.65.0 `allowedToSendTelemetry` returns false when `url` is not the SaaS URL and `sentry-cli info` fails, so pointing at 127.0.0.1:9 also kept the plugin's own telemetry offline."
  - "The env probe's temporary first line ends in `process.exit(0)`, so vite exits before the plugin can run with the dummy token. Nothing was sent anywhere."
  - "The tokenless builds also ran `vite build` directly, not `pnpm build --filter`. Implement measured turbo replaying a cached dist over a fresh one, and a replay would not show the current config's exit code."
  - "The live baseline counts the `.js` files each page's HTML references (entry and modulepreload). Lazy chunks are not counted. The defect's E1 used the same method."
---

# Verification: static-site source maps never reach Sentry

## Summary

- **6 PASS**, 0 FAIL, **3 PENDING-SHIP** (work item 4, which cannot pass before
  merge and deploy).
- The regression is reproduced on `origin/main` (`f43465f5f`) and is gone on the branch:
  - With main's `turbo.json`, the vite process under turbo sees no `SENTRY_*`. With the
    branch's, it sees all three.
  - With main's vite config, a failing upload exits 0. With the branch's, it exits 1.
- Verdict: the fix does what `defect.md` says for items 1 to 3. Production is unchanged
  until Ship dispatches `deploy-static.yml`.

All commands ran on 2026-10-04 in the worktree at head `48b07f7a0`, using local
turbo 2.11.0 (the same version as CI). Temporary probe edits were reverted, and
`git diff --quiet` confirmed it after each one.

## Criteria & evidence

### 1. Turbo passes SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT to the vite process (item 1)

- **Check (a): the regression test, red on main and green on the branch.**
  - Temporarily replaced `turbo.json` with `git show origin/main:turbo.json`.
  - Ran `pnpm --dir scripts test -- scripts/__tests__/deploy-static-sentry-env.test.mjs`.
  - Restored the branch file from a scratch copy, then ran the same test again.
- Evidence:
  ```
  --- RED (origin/main turbo.json @ f43465f5f) ---
  exit=1
  turbo.json restored, clean vs HEAD
       × passes SENTRY_AUTH_TOKEN through to the build task 4ms
       × passes SENTRY_ORG through to the build task 0ms
       × passes SENTRY_PROJECT through to the build task 0ms
  AssertionError: SENTRY_AUTH_TOKEN is filtered out of turbo run build: expected [ 'CI', 'NODE_ENV', …(4) ] to include 'SENTRY_AUTH_TOKEN'
        Tests  3 failed | 13 passed (16)
  --- GREEN (branch) ---
  exit=0
        Tests  16 passed (16)
  ```
- **Check (b): a behavioural probe of the real process.**
  - Prepended a temporary line to `apps/marketing/vite.config.ts`:
    `console.log(\`SENTRY_PROBE token-set=…\`); process.exit(0);`.
  - Ran `SENTRY_AUTH_TOKEN=dummy SENTRY_ORG=o SENTRY_PROJECT=p pnpm turbo run build --filter=@mbe/marketing --only --force`,
    first with main's `turbo.json` and then with the branch's.
  - Restored both files afterwards.
- Evidence:
  ```
  2.11.0
  === origin/main turbo.json ===
  @mbe/marketing:build: SENTRY_PROBE token-set=false org-set=false project-set=false
  === branch turbo.json ===
  @mbe/marketing:build: SENTRY_PROBE token-set=true org-set=true project-set=true
  probe reverted: turbo.json + vite.config.ts clean vs HEAD
  ```
- **Check (c): the resolved task definition, and whether the token enters the task hash.**
  Ran `pnpm turbo run build --filter=@mbe/marketing --dry=json`, then the same command
  with two different token values.
- Evidence:
  ```
  envMode: strict
  passThroughEnv: ["SENTRY_AUTH_TOKEN","SENTRY_ORG","SENTRY_PROJECT"]
  env: ["PUBLIC_*","VITE_*"]
  hash(token=dummy): c1ddea52839e4e3c
  hash(token=other): c1ddea52839e4e3c
  ```
- Result: **PASS**. This also observes directly the one link that `defect.md`'s
  root-cause hypothesis had left unproven.

### 2. A failed upload fails the build, and a tokenless build still succeeds (item 2)

- **Check (a): the plugin enabled against an unreachable Sentry, offline, for all three
  apps.** In each app ran
  `SENTRY_URL=http://127.0.0.1:9 SENTRY_AUTH_TOKEN=sntrys_probe_invalid SENTRY_ORG=probe-org SENTRY_PROJECT=probe-project pnpm exec vite build`.
- Evidence (the same for marketing, rialto-web and hospitality):
  ```
  === marketing: plugin ENABLED, SENTRY_URL=127.0.0.1:9 ===
  vite build exit=1
  Build failed with 1 error:
  Error: Command failed: …/sentry-cli releases new 48b07f7a01e915a02918b824c092700390e6653f
  error: API request failed
  === rialto-web: … ===
  vite build exit=1
  === hospitality: … ===
  vite build exit=1
  ```
- **Check (b): the control.** The same offline env, with marketing's config temporarily
  set to `git show origin/main:apps/marketing/vite.config.ts`, then restored.
- Evidence (this reproduces E7 directly):
  ```
  origin/main config, enabled-offline vite build exit=0
  [sentry-vite-plugin] Error: An error occurred. Couldn't finish all operations: Error: Command failed: …/sentry-cli releases new 48b07f7a0…
  error: API request failed
  vite.config.ts restored clean
  ```
- **Check (c): tokenless builds.** In each app ran
  `env -u SENTRY_AUTH_TOKEN -u SENTRY_ORG -u SENTRY_PROJECT -u SENTRY_URL pnpm exec vite build`.
- Evidence:
  ```
  marketing tokenless vite build exit=0
  rialto-web tokenless vite build exit=0
  hospitality tokenless vite build exit=0
  ```
- **The unit test.** `static-sentry-vite-plugin.test.mjs` passes 6 of 6 (see criterion 3's
  run). Implement's red run (3 failed) is recorded in `defect.md`.
- Result: **PASS**.

### 3. The post-build guard `scripts/verify-sentry-sourcemaps.mjs` (item 3)

- **Check (a): the unit tests.** Ran
  `pnpm --dir scripts test -- scripts/__tests__/verify-sentry-sourcemaps.test.mjs scripts/__tests__/static-sentry-vite-plugin.test.mjs`.
- Evidence:
  ```
  unit exit=0
   ✓ scripts/__tests__/static-sentry-vite-plugin.test.mjs (6 tests) 4ms
   ✓ scripts/__tests__/verify-sentry-sourcemaps.test.mjs (12 tests) 18ms
        Tests  18 passed (18)
  ```
- **Check (b): the guard against the real dists that the enabled plugin built offline in
  criterion 2(a).** Ran `node scripts/verify-sentry-sourcemaps.mjs apps/<app>/dist` with
  no pipe, so the exit code is the guard's own.
- Evidence:
  ```
  apps/marketing/dist: all 18 chunk(s) carry a Sentry debug ID and no source maps remain.
  guard(marketing, enabled-offline dist) exit=0
  apps/rialto-web/dist: all 199 chunk(s) carry a Sentry debug ID and no source maps remain.
  guard(rialto-web, enabled-offline dist) exit=0
  apps/hospitality/dist: all 68 chunk(s) carry a Sentry debug ID and no source maps remain.
  guard(hospitality, enabled-offline dist) exit=0
  ```
- **Check (c): the guard against the real tokenless dists from criterion 2(c).**
- Evidence:
  ```
  marketing   guard exit=1
  ::error::apps/marketing/dist/assets/AcmmPage-Dyvbka8N.js has no sentry-dbid- debug-ID snippet (sentryVitePlugin did not run on it)
  36 problem(s). Source maps were not uploaded to Sentry for this build. Refusing to deploy.
  rialto-web  guard exit=1
  397 problem(s). Source maps were not uploaded to Sentry for this build. Refusing to deploy.
  hospitality guard exit=1
  135 problem(s). Source maps were not uploaded to Sentry for this build. Refusing to deploy.
  ```
- Result: **PASS**.
- **Caveat, re-observed.** The enabled dists in (b) pass the guard even though the release
  step failed, because the maps are still deleted. A passing guard therefore proves only
  that the plugin ran, not that the upload succeeded. Upload success rests on criterion 2
  and on Ship's check 7.

### 4. Workflow wiring: build, then verify, then deploy, in all three jobs, under pipefail (item 3)

- **Check (a): an independent parse of `.github/workflows/deploy-static.yml`.** This is
  separate from the repo's own test. It finds each `deploy-<app>` job's build, verify and
  `wrangler deploy` lines, and the line before the verify invocation.
- Evidence:
  ```
  deploy-marketing: build L148 < verify L176 < deploy L179 => true; verify targets "node scripts/verify-sentry-sourcemaps.mjs apps/marketing/dist"; preceding line "set -euo pipefail"
  deploy-hospitality: build L216 < verify L236 < deploy L239 => true; verify targets "node scripts/verify-sentry-sourcemaps.mjs apps/hospitality/dist"; preceding line "set -euo pipefail"
  deploy-rialto-web: build L273 < verify L291 < deploy L294 => true; verify targets "node scripts/verify-sentry-sourcemaps.mjs apps/rialto-web/dist"; preceding line "set -euo pipefail"
  ```
  `grep -n continue-on-error .github/workflows/deploy-static.yml` printed nothing, and no
  verify step has an `if:`.
- **Check (b): paths coverage.** Ran `node scripts/check-workflow-paths-coverage.mjs`.
- Evidence:
  ```
  deploy-static.yml: scripts/verify-sentry-sourcemaps.mjs — post-build deploy gate, same reasoning as require-deploy-secrets.mjs above: …
  PASS: workflow paths-filter coverage
  paths-coverage exit=0
  ```
- Result: **PASS**.

### 5. Repository gates: the full scripts suite, lint and typecheck

- Check: ran `pnpm --dir scripts test`, then `pnpm lint`, then `pnpm typecheck`.
- Evidence:
  ```
  scripts test exit=0
   Test Files  248 passed (248)
        Tests  4777 passed (4777)
  lint exit=0
  @mbe/hospitality:lint: ✖ 137 problems (0 errors, 137 warnings)
   Tasks:    52 successful, 52 total
  typecheck exit=0
   Tasks:    52 successful, 52 total
  ```
  Lint reported warnings only, and they are pre-existing.
- Result: **PASS**.

### 6. CI on PR #6019 at head 48b07f7a0

- Check: ran `gh pr view 6019`, `gh pr checks 6019`, `gh run view` on the CI and visual
  runs, the main-branch history of `rialto-web-e2e.yml`, and branch protection.
- Evidence:
  ```
  {"headRefOid":"48b07f7a01e915a02918b824c092700390e6653f","isDraft":true,"mergeStateStatus":"UNSTABLE","state":"OPEN"}
  CI Gate	pass	0	…/actions/runs/37175144210	CI Gate success
  CI Gate	pass	8s	…/actions/runs/37175144210/job/111358238315
  run 37175144210: {"conclusion":"success","event":"pull_request","headSha":"48b07f7a01e915a02918b824c092700390e6653f","workflowName":"CI"}
  Visual Regression (rialto-web)	fail	4m36s	…/actions/runs/37175144229/job/111356111997
  required_status_checks: {"contexts":["CI Gate"],"strict":false}
  ```
  Every other check passed, and "Docs Formatting" was skipped.
- **The Visual Regression (rialto-web) failure was already on main before this branch.**
  - The latest main run of `Rialto Web E2E`, `36790124632` (`fda7ff10c`, push,
    2026-09-30), concluded `failure` with `Visual Regression (rialto-web): failure`.
  - Main's earlier runs were also failures: `36481971063`, `36481945012` and
    `35916763363`. The last success was `35662143208` on 2026-09-21.
  - `git diff --stat fda7ff10c origin/main -- apps/rialto-web packages/rialto` is empty.
    The branch touches only the `errorHandler` lines in `apps/rialto-web/vite.config.ts`,
    and they are inert without a token.
  - Both runs fail the same way:
    ```
    == run 36790124632 (main)   46 failed, 3 passed — visual.spec.ts:65:3 › light / accordion-default …
    == run 37175144229 (PR)     46 failed, 3 passed — visual.spec.ts:65:3 › light / accordion-default …
    ```
  - The check is advisory. It is not a required context, and it runs in the separate
    `Rialto Web E2E` workflow, outside `CI Gate`.
- Result: **PASS**. `CI Gate` is green on the head SHA, and the one red check predates the
  branch and is advisory.

### 7. Ship (a): the deploy build log shows the plugin's upload succeeded (item 4)

- Result: **PENDING-SHIP**. This needs `deploy-static.yml` dispatched on main after merge,
  with the real `SENTRY_AUTH_TOKEN`. Token scope (brief hypothesis 2) and the hospitality
  `SENTRY_PROJECT` value (hypothesis 3) remain untested. They will be tested for the first
  time there.

### 8. Ship (b): live chunks carry `sentry-dbid-`, and wrangler lists no `.map` files (item 4)

- Result: **PENDING-SHIP**.
- **The baseline before Ship, measured 2026-10-04T04:11Z.**
  - DNS was cross-checked with `dig` and `dig @1.1.1.1`. Both returned
    `104.21.25.32 172.67.222.73`, so the LAN sinkhole is not involved.
  - Ran `curl` on each page's referenced `.js`, then `grep -q sentry-dbid-`, in bash.
- Evidence:
  ```
  /: 0 of 5 referenced .js carry sentry-dbid-
  /rialto/: 0 of 10 referenced .js carry sentry-dbid-
  /hospitality/: 0 of 11 referenced .js carry sentry-dbid-
  map probe: 404 text/plain;charset=UTF-8
  /assets/index-DOa0iccL.js        (still the run-37096660655 bundle from E2)
  ```
  The `.map` 404 comes from the edge router's block, as E3 explains. It does not prove
  the maps were deleted.

### 9. Ship (c): a Sentry release exists and frames symbolicate (item 4)

- Result: **PENDING-SHIP**.
- **The baseline.** Sentry MCP
  `find_releases(organizationSlug=mattbutlerengineering, regionUrl=https://us.sentry.io)`,
  queried read-only, returned:
  ```
  {"releases":[],"hasMore":false}
  ```
- After Ship, expect a release named after the deployed git SHA, because the plugin
  auto-detects it (see Implement notes). Symbolication needs a real event with frames.
  The heartbeat cannot prove it.

## Failures

None.

## Not verified

- **Criteria 7, 8 and 9 (work item 4).** They need the merged change deployed with the real
  token. That is Ship's job, and nothing about them is claimed here.
- **The real upload path against sentry.io.** No build here talked to sentry.io. Every
  enabled-plugin build targeted `127.0.0.1:9` by design. So these remain unproven until
  Ship: the token's scopes, the org and project slugs, and a successful artifact-bundle
  upload.
- **Turbo with remote caching.** Remote caching is not exercised, and deploy-static logs
  "Remote caching disabled". The guard covers a replayed tokenless dist, which Implement
  observed with the local cache, but not a replayed _enabled_ dist whose upload never
  happened in the current run.
- **Lazy-loaded chunks on the live site.** The baseline counts only the `.js` that the
  HTML references.
- **Not re-tested: the Review-flagged trade-off.** A Sentry outage or an expired token
  will now block every static deploy, hotfixes included. This is a design decision for
  Review, not a verification gap.
