---
stage: verify
run: maintenance:browser-sentry-env-release
date: 2026-10-04
verified-at: 1ad4f63ace597b783e60a83fdd008a4c23dcd469
assumptions:
  - "No prd.md exists (maintenance run). The criteria list is defect.md's Expected outcome plus every work-item acceptance criterion, plus the brief's matcher check. This is the protocol's maintenance orientation, not a gap."
  - "The regression demonstration swapped origin/main's react.ts into the worktree, ran the new tests, and restored the fixed file (git status clean afterwards). That re-runs the RED step against the actual pre-fix source instead of quoting Implement's notes."
---

# Verification: production browser Sentry events report `environment: development` and `release: null`

## Summary

9 criteria checked: **8 PASS, 0 FAIL, 1 PENDING** (live production events, which cannot exist before deploy and belong to Ship). Verdict: the code change does what the defect brief asks. The regression tests fail on the pre-fix `react.ts` for the stated reasons and pass on the fix. A local production build ships `environment:"production"` and no explicit `release` key. Backend Sentry code and tests are byte-for-byte unchanged.

All commands were run in worktree `.claude/worktrees/browser-sentry-env-release` at `1ad4f63ac` (merge-base with `origin/main` = `802d78175`, which is also current `origin/main`).

## Criteria & evidence

### 1. Regression: the new browser-shaped tests fail on the pre-fix code (work item 1, centerpiece)

- Check: `git show origin/main:packages/sentry/src/react.ts > packages/sentry/src/react.ts`, then `NO_COLOR=1 pnpm --dir packages/sentry exec vitest run src/react.test.ts`, then restore the fixed file from a scratch copy. `git status --short packages/sentry` was empty after the restore.
- Evidence:
  ```
  exit=1
   FAIL  src/react.test.ts > initSentry (react) > in a browser bundle (no process.env values) > uses the caller-supplied environment
  AssertionError: expected 'development' to be 'production' // Object.is equality
   FAIL  src/react.test.ts > initSentry (react) > in a browser bundle (no process.env values) > omits the release key so the SDK falls back to the plugin-injected SENTRY_RELEASE
  AssertionError: expected true to be false // Object.is equality
        Tests  2 failed | 27 passed (29)
  ```
  Test (c), `still passes release through when SENTRY_RELEASE is set`, passed on the old code, as intended: it pins the pass-through.
- Result: PASS. These are assertion failures that reproduce the defect, not compile or mock errors.

### 2. Release: stop overriding the SDK default; environment: caller-supplied (work items 2 and 3)

- Check: `pnpm --dir packages/sentry test` and `pnpm --dir packages/sentry typecheck` on the fixed code.
- Evidence:
  ```
   Test Files  3 passed (3)
        Tests  64 passed (64)
  sentry test exit=0
  > @mbe/sentry@0.0.0 typecheck .../packages/sentry
  > tsc --noEmit
  sentry tc exit=0
  ```
  Diff of `packages/sentry/src/react.ts` vs `origin/main`:
  ```
  -    environment: config.environment,
  -    release: config.release,
  +    environment: options.environment ?? config.environment,
  +    ...(config.release !== undefined && { release: config.release }),
  ```
  The pre-existing `defaults environment to 'development'`, `passes environment from NODE_ENV` and `uses SENTRY_ENVIRONMENT` tests are unchanged in the diff and pass.
- Result: PASS

### 3. Apps wired and typecheck (work item 4, first half)

- Check: `git diff origin/main...HEAD -- apps/*/src/main.tsx`, then `pnpm turbo typecheck --filter=@mbe/gen --filter=@mbe/marketing --filter=@mbe/hospitality --filter=@mbe/rialto-web --filter=@mbe/sentry`.
- Evidence: each of `apps/{gen,hospitality,marketing,rialto-web}/src/main.tsx` gains exactly one line:
  ```
  +  environment: import.meta.env.MODE,
  ```
  ```
   Tasks:    14 successful, 14 total
  tc exit=0
  ```
- Result: PASS

### 4. Shipped bundle: environment from MODE, no unconditional `release` key, nothing sent to sentry.io (work item 4, second half)

- Check: `env | grep -c SENTRY_AUTH_TOKEN` gave `0`. Both apps' `vite.config.ts` set `disable: !process.env.SENTRY_AUTH_TOKEN` on `sentryVitePlugin`, so the plugin made no network calls. Then `rm -rf apps/marketing/dist apps/hospitality/dist packages/sentry/dist` and `env -u SENTRY_AUTH_TOKEN VITE_SENTRY_DSN=https://k@o0.ingest.sentry.io/0 pnpm turbo build --filter=@mbe/marketing --filter=@mbe/hospitality --force` (exit 0; `@mbe/sentry` dist rebuilt with `cache bypass, force executing`). Then grep the emitted `dist/assets/*.js`.
- Evidence:
  ```
  === marketing
  apps/marketing/dist/assets/index-fe7BuGPe.js
  Kf({appName:`marketing`,dsn:`https://k@o0.ingest.sentry.io/0`,environment:`production`})
  environment:e.environment??t.environment,...t.release!==void 0&&{release:t.release},replaysSessionSampleRate
  -- release:void 0 / undefined count:
         0
  -- SENTRY_RELEASE global count:
         0
  === hospitality
  apps/hospitality/dist/assets/index-D0laXd1i.js
  _e({appName:`hospitality`,dsn:`https://k@o0.ingest.sentry.io/0`,environment:`production`})
  environment:e.environment??t.environment,...t.release!==void 0&&{release:t.release},replaysSessionSampleRate
  -- release:void 0 / undefined count:
         0
  -- SENTRY_RELEASE global count:
         0
  ```
  The compiled `resolveConfig` is unchanged: its browser `release` still evaluates to `undefined`, which the conditional spread now drops.
  ```
  release:(typeof process<`u`?{}.SENTRY_RELEASE:void 0)??(typeof process<`u`?{}.npm_package_version:void 0)
  ```
- Result: PASS. **Not shown by this probe:** the `SENTRY_RELEASE={id:…}` global is **absent** from the local bundle, because the plugin is disabled without a token. Whether the release reaches events therefore depends on CI's token-enabled build injecting that global. Capture measured the global in all three live entry chunks (defect.md evidence item 2). Its effect on events is pending live proof (criterion 9).

### 5. Backend unchanged (work item 5)

- Check: `git diff origin/main -- packages/sentry/src/config.ts packages/sentry/src/node.ts packages/sentry/src/config.test.ts packages/sentry/src/node.test.ts packages/service-bootstrap services | wc -c`, then the unmodified backend tests and `pnpm --dir packages/service-bootstrap test`.
- Evidence:
  ```
  === backend diff bytes:
         0
  ```
  ```
  (vitest run src/config.test.ts src/node.test.ts)
   Test Files  2 passed (2)
        Tests  35 passed (35)
  (service-bootstrap)
   Test Files  12 passed (12)
        Tests  173 passed (173)
  ```
- Result: PASS. Backend behaviour is unchanged by construction, so no `deploy-services.yml` run is needed.

### 6. App test suites (work item 6)

- Check: `NO_COLOR=1 pnpm --dir apps/<app> test` for hospitality, marketing, rialto-web and gen.
- Evidence:
  ```
  == hospitality
   Test Files  181 passed (181)
        Tests  2523 passed (2523)
  == marketing
   Test Files  32 passed (32)
        Tests  365 passed (365)
  == rialto-web
   Test Files  67 passed (67)
        Tests  770 passed (770)
  == gen
   Test Files  28 passed (28)
        Tests  302 passed (302)
  ```
- Result: PASS. Repo-wide `pnpm lint` / `pnpm typecheck` / `pnpm regen --check` were run by Implement (defect.md § Implement notes: `52 successful` each, "All generated artifacts are up to date.") and were not re-run here. CI on PR #6035 is the authoritative re-run.

### 7. No changeset required

- Check: Capture's finding, re-confirmed by the diff: the only package source touched is `packages/sentry` (`private: true`); the changeset gate covers `packages/rialto/src/**` only.
- Evidence: `git diff origin/main...HEAD --stat` lists no `packages/rialto/` and no `.changeset/` path.
- Result: PASS

### 8. Heartbeat and sentry-triage do not filter on environment or release

- Check: `grep -rniE "environment|release|development|production"` over `scripts/sentry-heartbeat*.mjs`, the heartbeat tests, `.github/workflows/sentry-heartbeat.yml` and `.claude/skills/sentry-triage/`. Also read the heartbeat matcher and the triage queries.
- Evidence: the only hits are prose, never a filter:
  ```
  scripts/sentry-heartbeat.mjs:497:/* c8 ignore start -- CLI entrypoint: it fires real triggers against PRODUCTION ...
  .claude/skills/sentry-triage/scripts/triage.mjs:152:    const body = `## Sentry Production Error\n\n...
  .claude/skills/sentry-triage/SKILL.md:3:description: Query Sentry for production errors, ...
  ```
  Matcher (`scripts/sentry-heartbeat.mjs` `eventMatchesTarget`): `return carriesMarker && tagValue(event, "app") === target.app;`. It matches on the marker and the `app` tag only.
  Triage queries carry no environment parameter:
  ```
  fetch-issues.mjs:21: .../organizations/${orgSlug}/issues/?statsPeriod=${STATS_PERIOD}&groupStatsPeriod=${STATS_PERIOD}&sort=freq&limit=20
  triage.mjs:102:      `/projects/${ORG_SLUG}/${project.slug}/issues/?statsPeriod=${STATS_PERIOD}`
  ```
- Result: PASS

### 9. Live: production browser events carry `environment: production` and `release: <deployed SHA>` (defect Expected)

- Check: none possible before deploy.
- Evidence: none yet. Ship must deploy via `deploy-static.yml` and dispatch `sentry-heartbeat.yml` once. Then, through Sentry MCP, confirm the new heartbeat events in `hospitality` and `mattbutlerengineering` show `environment: production` and a `release` equal to the `SENTRY_RELEASE` id grepped from each freshly deployed entry chunk. Ship should also re-run Capture's grouped query to confirm the node rows are still `production` / `null`.
- Result: PENDING (Ship)

## Failures

None.

## Not verified

- **Live event labelling (criterion 9).** It is pending the deploy, and the release half rests on the SDK default (`applyDefaultOptions` reading `WINDOW.SENTRY_RELEASE.id`), which Capture read from `@sentry/browser` 11.4.0 source. No browser-runtime test exercises that path: unit tests mock `Sentry.init`, and the local bundle has no injected global. The live heartbeat is the first end-to-end proof.
- **rialto-web and gen bundles** were not built locally. Only marketing and hospitality were probed. rialto-web uses the identical `initSentry` call and typechecks; gen is not deployed by `deploy-static.yml`.
- **Sentry UI alert rules and inbound filters** keyed on `environment` were not enumerated (carried over from defect.md Notes). Ship should glance at each project's alert rules.
- **Repo-wide lint, typecheck and regen** were not re-run in this stage (see criterion 6). CI on PR #6035 covers them.
- **Out of scope, unchanged:** backend `release: null`, the deploy-static paths-filter gap for `packages/sentry/**`, the CSP `eval` seed, and the `verify-push-sha` hook bug.
