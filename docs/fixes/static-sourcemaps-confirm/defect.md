---
stage: capture
run: maintenance:static-sourcemaps-confirm
date: 2026-10-03
re-entry: implement
origin: "docs/backlog.md seed: Confirm source maps upload and produce readable stack traces (from: maintenance:sentry-dsn-static-builds); also docs/fixes/static-sentry-dsn-routing review Minor 3"
assumptions:
  - "Re-entry is implement, not architect. The fix is a turbo env allowlist entry, an errorHandler, and a post-build guard, with no design choice that changes an interface. Taken as the skill's default for a scoped fix, because the brief does not state a depth."
  - "Use turbo `passThroughEnv`, not `env`, for SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT. They change side effects (the upload), not dist bytes, and `env` would write the token into the task hash inputs. Taken as the recommended default; the brief is silent on it."
  - "A failed upload should fail the deploy build. That means `errorHandler` throws, which is the brief's 'make upload failure loud' option. It is justified by the measured fact that the plugin's default handler only logs on an upload failure (see Evidence E7)."
  - "Implement (2026-10-03): the guard checks only `dist/assets/**/*.js` for the `sentry-dbid-` snippet, not every `.js` in dist. Measured: with the plugin enabled, every file under `assets/` (including the `rolldown-runtime-*.js` chunk, which has no map) carries the snippet, while vite-plugin-pwa's `registerSW.js` and `sw.js` at the marketing dist root never do, because workbox builds them outside the rollup bundle. `.map` files are checked everywhere in dist."
  - "Implement (2026-10-03): marketing's VitePWA `workbox.sourcemap` is set to `false`. This was not a listed work item. workbox writes `sw.js.map` after sentryVitePlugin has deleted the bundle maps, so with the plugin enabled the guard measured `apps/marketing/dist/sw.js.map ... would ship` and exited 1. Without the change every marketing deploy would fail at the new guard. The only effect is that the service worker no longer ships a map, which the edge router already 404s."
  - "Implement (2026-10-03): the errorHandler test is textual (it reads each vite.config.ts and matches a rethrowing `errorHandler` inside the `sentryVitePlugin({...})` call), as the work item suggested. Importing the configs with a mocked plugin was rejected because `@sentry/vite-plugin` is not resolvable from `scripts/`. The behaviour itself was proved by a real build (see Notes)."
  - "Hospitality is in scope. The same root cause applies to it (E1-E4 hold for all three apps), and the brief says to fix it only if that is true."
---

# Defect: static-site source maps never reach Sentry

## Defect

**Observed.** None of the three static apps (marketing, rialto-web, hospitality) uploads
source maps to Sentry. `sentryVitePlugin` never runs in the deploy build. It returns its
no-op plugin, because `SENTRY_AUTH_TOKEN` is not visible inside the turbo-run vite
process. As a result:

- no debug IDs are injected into the deployed chunks;
- no artifacts or releases reach Sentry;
- `filesToDeleteAfterUpload` never runs, so `.map` files ship to Cloudflare. The edge
  router 404s them.

Every production JS error stack from these apps will arrive minified and stay that way.

**Expected.** Each deploy-static build injects debug IDs and uploads its maps:
marketing and rialto-web to project `mattbutlerengineering`, hospitality to
`hospitality`. It deletes the maps before deploy. If the upload fails, the deploy build
fails loudly.

The earlier "unverified" framing was wrong. The pipeline is not merely unproven: it is
measured broken, for a non-credential reason. The token's own scope is still
**untested**, because no build has ever handed the token to the plugin.

## Reproduction / Evidence

All of the following were measured on 2026-10-03 and are read-only.

- **E1. Live chunks carry no debug-ID injection.**
  - Command: `curl` every `.js` referenced by `https://mattbutlerengineering.com{/,/rialto/,/hospitality/}`,
    then `grep "_sentryDebugIdIdentifier\|sentry-dbid"`.
  - Result: `/` 0 of 4 chunks, `/rialto/` 0 of 10, `/hospitality/` 0 of 11.
  - The only `_sentryDebugIds` string in a bundle is the SDK's own reader
    (`let t=T._sentryDebugIds,n=T._debugIds`), not the plugin's injected snippet.
  - When the plugin is enabled, it prepends
    `e._sentryDebugIdIdentifier="sentry-dbid-<uuid>"` to every JS chunk. That comes from
    `@sentry/bundler-plugins@10.65.0`, `core/index.js` `getDebugIdSnippet`, and
    `rollup/index.js` `renderChunk`.
  - No `SENTRY_RELEASE={id:…}` injection is present either.
  - DNS was cross-checked: `dig` and `dig @1.1.1.1` both return Cloudflare
    `172.67.222.73` / `104.21.25.32`, so the LAN sinkhole is not involved.
- **E2. The live bundle is the deploy that was measured.**
  - Live `/assets/index-DOa0iccL.js` is the same filename that deploy-static run
    `37096660655` (headSha `2de5105b6`, `workflow_dispatch`, 2026-10-03 04:28Z) uploaded.
- **E3. The maps shipped to Cloudflare, so `filesToDeleteAfterUpload` never ran.**
  - Source: `gh run view 37096660655 --log`.
  - Wrangler's asset upload listed `+ /assets/index-DOa0iccL.js.map` and the other map
    files: 13 for marketing and 132 for rialto-web.
  - Hospitality uploaded 0 new files ("No files to upload"; the assets were unchanged).
    Its vite output still listed 67 `map:` entries.
  - `curl …/index-DOa0iccL.js.map` returns 404 `text/plain` only because
    `infrastructure/worker/edge-router.js:261-264` blocks every `*.map` path. A
    non-existent `.js` returns 200 `text/html` (SPA fallback). So the 404 proves the edge
    block, not deletion.
- **E4. The token is set in the step but stripped before vite sees it.**
  - The run log shows `SENTRY_AUTH_TOKEN: ***`, `SENTRY_ORG: ***` and
    `SENTRY_PROJECT: ***` on all three build steps. The secret is therefore non-empty
    (`gh secret list`: `SENTRY_AUTH_TOKEN` updated 2026-05-19).
  - Each build runs `pnpm build --filter=…`, which is `turbo run build`. In CI that is
    turbo 2.11.0, per the install log.
  - Turbo runs in **strict env mode**. `turbo run build --filter=@mbe/marketing --dry=json`
    (local turbo 2.10.11, read-only) reports `envMode: "strict"`.
  - The build task's allowlist is `env: ["VITE_*","PUBLIC_*"]`, `passThroughEnv: null`.
    The global passthrough is `CI, NODE_ENV, DATABASE_URL, AUTH_AUTHORITY, AUTH_AUDIENCE,
ANTHROPIC_API_KEY`. No `SENTRY_*` variable appears anywhere.
  - That explains why `VITE_SENTRY_DSN` works (heartbeats arrive) while the three
    plugin variables do not.
  - The builds were real cache **misses**, and "Remote caching disabled" was logged, so
    no replayed cache output is involved.
- **E5. Sentry has no releases.**
  - Tool: Sentry MCP `find_releases(organizationSlug=mattbutlerengineering)` returned
    `{"releases":[],"hasMore":false}`.
  - The MCP catalog has no artifact-bundle or debug-ID listing tool. Searches for
    "releases artifact bundles source maps debug id" and "artifact bundle upload source
    map files project" found nothing.
  - So artifact bundles were **not directly listed**. E1 and E3 make an upload
    impossible anyway, because the plugin never reached `writeBundle`.
- **E6. No production event can show symbolication either way.**
  - Tool: Sentry MCP `search_events` over the last 90 days on `mattbutlerengineering` and
    `hospitality`. Apart from heartbeats there are only 3 real issues:
    - `HOSPITALITY-7`: a `captureMessage`-style 401 with no stacktrace.
    - `HOSPITALITY-8` and `HOSPITALITY-9`: dynamic-import `TypeError`s with "No
      stacktrace available".
  - Their `componentStack` extra holds raw minified frames, for example
    `Ap@…/assets/index-D302Ixhv.js:16:55421`. Sentry never symbolicates that field, so
    it is weak corroboration only.
  - Several of these events are tagged `app: marketing` but sit in `hospitality`. That
    is the pre-re-route DSN, which is already fixed.
- **E7. Even an enabled plugin would fail silently on a bad token.**
  - In `core/build-plugin-manager.js`, `handleRecoverableError(e, false)` handles errors
    from the debug-ID upload (around line 476) and from release management (around
    line 315).
  - With no `errorHandler`, it only calls `logger.error(...)`, and the build succeeds.
  - None of the three `vite.config.ts` files sets `errorHandler`, `debug`, `telemetry`
    or `release`.

## Root-cause hypothesis

**Strongly supported, with one unproven link.** Turbo 2's strict env mode filters
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT` out of the build task's
environment. As a result `disable: !process.env.SENTRY_AUTH_TOKEN` evaluates `true`,
and `sentryVitePlugin` returns `{ name: "sentry-noop-plugin" }`.

The evidence for this:

- E4 shows strict mode and an allowlist without `SENTRY_*`.
- E1 and E3 show exactly the no-op plugin's footprint: no injection, no deletion.
- `VITE_*` passes through and works.

The unproven link is a direct observation that `process.env.SENTRY_AUTH_TOKEN` is
undefined inside the CI vite process. Turbo's documented strict-mode semantics imply it,
and the fix's first CI run will confirm it.

**Secondary, open.** Once the token reaches the plugin, it may still lack
`project:releases`/`project:write`, or access to `mattbutlerengineering`. That is brief
hypothesis 2, and it is untestable until the env is fixed. Likewise the value of the
hospitality `SENTRY_PROJECT` secret (brief hypothesis 3) is unknown.

## Blast radius

**Who is affected.** Anyone triaging a production browser error from
mattbutlerengineering.com: the marketing site, the rialto showcase at `/rialto/`, and
the hospitality app at `/hospitality/`.

**How bad.** Every exception stack frame stays minified, which slows triage. No user
sees any change.

**Since when.** Probably since the plugin landed (`49246779c`, 2026-04-02). Turbo 2 has
defaulted to strict env mode throughout, and Sentry has zero releases org-wide. That
start date is a hypothesis; only the current deploy was measured.

**Side effect.** All `.map` files are published to Cloudflare Workers assets. The edge
router blocks them, so this is defence-in-depth working, not a leak.

**Scale.** Low severity and observability-only. There is no runtime code change, so
Review and Ship can stay light.

## Ruled out

- **"The secret is empty."** No: GitHub prints `***` for it, which it does only for a
  non-empty value (E4).
- **"A turbo cache hit replayed old output."** No: the builds were cache misses and
  remote caching was disabled (E4).
- **"The `.map` 404 proves maps were deleted after upload."** No: the edge router blocks
  `*.map`, and wrangler's log shows the maps were uploaded (E3).
- **"The deployed bundle predates the env wiring."** No: the live chunk filename matches
  run 37096660655 (E2).
- **"Heartbeats prove the pipeline."** No: they prove DSN routing only. Their frames are
  Playwright-injected code, not bundle code.
- **"Token scope is the cause."** Not yet testable: the token never reached the plugin.
  Do not rescope or replace it before the env fix has run once.

## Work items

- [x] **Pass the Sentry plugin env through turbo.** Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`
      and `SENTRY_PROJECT` to the `build` task's `passThroughEnv` in `turbo.json`.
      Write the failing test first, for example in
      `scripts/__tests__/deploy-static-sentry-env.test.mjs` or a sibling. It should read
      `turbo.json` and assert that the three names are reachable by the build task.
  - Accept: the test fails before the change and passes after it.
    `turbo run build --filter=@mbe/marketing --dry=json` lists the three names under
    the build task's `passThroughEnv`.
- [x] **Make a failed upload fail the build.** Give `sentryVitePlugin` in all three
      `apps/*/vite.config.ts` an `errorHandler` that rethrows. It only matters when the
      plugin is enabled, which requires the token. Test first: a test asserts that each
      of the three configs supplies a throwing `errorHandler`, following the existing
      config-reading test style.
  - Accept: the test is red before and green after. A local build with no token still
    succeeds, because the plugin is disabled and the handler never runs.
- [x] **Add a post-build guard that the plugin actually ran.** Add a pure, unit-tested
      script such as `scripts/verify-sentry-sourcemaps.mjs <distDir>`. It fails if any
      emitted `.js` chunk lacks `sentry-dbid-` or if any `*.map` remains in `dist/`.
      Wire it into each deploy-static job between the build and `wrangler deploy`, with
      `set -o pipefail`.
  - Accept: the unit tests cover the injected/clean, missing-injection and leftover-map
    cases. A `deploy-static.yml` test asserts that the step precedes the deploy step in
    all three jobs.
- [x] **Prove it end to end after merge (Ship).** Dispatch `deploy-static.yml` on main
      and check each of these:
  - (a) The build log shows the plugin's upload success line, and nothing fails.
  - (b) Live chunks on `/`, `/rialto/` and `/hospitality/` carry `sentry-dbid-`, and
    wrangler lists no `.map` files.
  - (c) If any frame-bearing error event appears, its frames resolve to source. If none
    appears, record that symbolication is pending a real event, because the heartbeat
    cannot prove it.
  - **If the upload fails with 401/403 or a project-access error, STOP.** Write the
    exact token-rescope steps into `release.md` and surface them to Matt (a credential
    change). Do not touch `SENTRY_AUTH_TOKEN` or run `gh secret set`.
  - Accept: `release.md` records (a), (b) and (c), each with the command it came from,
    or records the credential stop.
  - **Ship result (2026-10-04):** (a) PROVEN and (b) PROVEN, on deploy-static runs
    `37179071034` (push) and `37179075898` (dispatch) at `4402db761`. (c) is recorded
    as PENDING, as its own wording allows: no frame-bearing error event exists yet, so
    symbolication of a real frame is **not** proven. A Sentry release named
    `4402db761…` now exists for `mattbutlerengineering` and `hospitality`. See
    `release.md`.

## Notes

- **In-flight check (2026-10-03).** `gh pr list --state open` returned 17 open PRs. None
  matched sentry, source maps, vite or turbo. Nothing matches, so the run proceeds.
- **Seed claimed.** `docs/backlog.md` line 40 now has
  `(claimed: maintenance:static-sourcemaps-confirm)`.
- **Out of scope**, per the brief:
  - the `environment: development` / missing-release tagging seed;
  - the CSP `eval` seed;
  - heartbeat changes;
  - any credential change.

  The fix leaves `release.name` alone. Release injection may start working as a side
  effect, but tagging stays its own seed.

- **Cache caveat for Implement.** `passThroughEnv` does not enter the task hash. A future
  build with remote caching enabled could therefore replay a tokenless `dist/` without
  debug IDs. The post-build guard turns that case into a red build instead of a silent
  regression. deploy-static currently logs "Remote caching disabled".
- **Implementation context.** `pnpm install --frozen-lockfile` and
  `pnpm build --filter @mbe/cli...` are needed in this worktree before committing,
  because the pre-commit `check-adr` requires them.

## Implement notes (2026-10-03)

Work items 1 to 3 are checked. Work item 4 is post-merge and belongs to Ship, so it stays
unchecked. Local turbo was 2.11.0, the same version as CI.

### Item 1: turbo `passThroughEnv`

- **Red.** `pnpm --dir scripts test -- scripts/__tests__/deploy-static-sentry-env.test.mjs`
  returned `Tests  3 failed | 13 passed (16)`, for example
  `SENTRY_PROJECT is filtered out of turbo run build`.
- **Probe before the change.** A temporary first line in `apps/marketing/vite.config.ts`
  logged the env, then the build ran as
  `SENTRY_AUTH_TOKEN=dummy SENTRY_ORG=o SENTRY_PROJECT=p pnpm turbo run build --filter=@mbe/marketing --cache=local:r`.
  It printed
  `@mbe/marketing:build: SENTRY_PROBE token-set=false org-set=false project-set=false`.
  This directly observes the link the root-cause hypothesis had left unproven.
- **Probe after the change.** The same command printed
  `@mbe/marketing:build: SENTRY_PROBE token-set=true org-set=true project-set=true`.
  The probe line was then removed and the config restored from a backup.
- **`--dry=json`.** It reports `envMode: "strict"`, and the task's
  `resolvedTaskDefinition.passThroughEnv` is
  `["SENTRY_AUTH_TOKEN","SENTRY_ORG","SENTRY_PROJECT"]`.
- **The task hash does not depend on the token.** With `SENTRY_AUTH_TOKEN=dummy` and with
  `SENTRY_AUTH_TOKEN=other`, the `@mbe/marketing#build` hash was `236024331debbc48` both
  times.
- **Green.** The same test returned `Tests  16 passed (16)`.

### Item 2: rethrowing `errorHandler`

- **Red.** `scripts/__tests__/static-sentry-vite-plugin.test.mjs` returned
  `Tests  3 failed | 3 passed (6)`: three `× apps/<app>/vite.config.ts supplies a rethrowing errorHandler`.
  The three tests that check `disable` is kept passed.
- **Green.** After the change it returned `Tests  6 passed (6)`.
- **Behaviour proof with an invalid token.** The command was
  `SENTRY_AUTH_TOKEN=sntrys_probe_invalid SENTRY_ORG=probe-invalid-org SENTRY_PROJECT=probe-invalid-project pnpm turbo run build --filter=@mbe/marketing --cache=local:r`.
  It exited 1 with:
  - `sentry-cli releases new f43465f5f… error: Project not found`
  - `Failed:    @mbe/marketing#build`

  Before this change the plugin would only have logged the error.

- **The probe reached sentry.io.** That one probe sent an invalid token and a non-existent
  org to sentry.io, and the plugin sent its default telemetry. Every later enabled-plugin
  probe set `SENTRY_URL=http://127.0.0.1:9` and stayed offline (`error: API request failed`).
- **Building with no token still works.** The command was
  `env -u SENTRY_AUTH_TOKEN pnpm build --filter @mbe/marketing --filter @mbe/rialto-web --filter @mbe/hospitality`.
  It exited 0 with `Tasks:    12 successful, 12 total`.
- **The plugin creates a release even without the `release` option.** The enabled plugin
  ran `sentry-cli releases new <git sha>`, so it detects the release from git by itself.
  Ship should therefore expect a release named after the deployed SHA. That fits the
  existing note that "release injection may start working as a side effect".
- **Trade-off for Review (not decided here).** When the plugin is enabled, a rethrowing
  handler turns any Sentry-side failure into a failed static deploy. That includes a Sentry
  outage, an expired token, and a token-scope error. It also applies to hotfixes. With the
  default handler, the same failures log an error and the deploy goes ahead. Possible
  mitigations, none of which is implemented:
  - an escape-hatch env var;
  - `continue-on-error` on the build. This is not equivalent, because it would also hide
    real build errors.

  The brief accepted making a failed upload loud.

### Item 3: post-build guard `scripts/verify-sentry-sourcemaps.mjs`

- **Red.** `scripts/__tests__/verify-sentry-sourcemaps.test.mjs` first failed with
  `Cannot find module '../verify-sentry-sourcemaps.mjs'`. Once the script existed, the run
  showed `Tests  3 failed | 9 passed (12)`; the 3 failures were
  `× deploy-marketing/hospitality/rialto-web`, because no workflow step existed yet.
- **Green.** After wiring the steps it returned `Tests  12 passed (12)`. These tests cover:
  - the injected and clean case;
  - a missing injection;
  - a leftover map, both under `assets/` and at the root;
  - collecting all problems in one run;
  - the no-chunks case (a wrong dist path);
  - PWA files at the root being exempt from injection;
  - a real fixture directory walked through `readDistFiles`;
  - a missing dist directory, which throws;
  - in each of the three jobs, the step sitting after the build, before `wrangler deploy`,
    and running under `set -euo pipefail`.
- **Real dists with the plugin enabled offline.** Each app was built with
  `SENTRY_URL=http://127.0.0.1:9 SENTRY_AUTH_TOKEN=sntrys_probe_invalid … pnpm exec vite build`.
  The vite build exits 1, because the handler rethrows. The guard then reported:
  - rialto-web: `all 199 chunk(s) carry a Sentry debug ID and no source maps remain.`
    (exit 0)
  - hospitality: `all 68 chunk(s) …` (exit 0)
  - marketing, first run:
    `::error::apps/marketing/dist/sw.js.map is a source map that was not deleted after upload, and would ship`
    (exit 1). Setting `workbox.sourcemap: false` fixed it (see the frontmatter
    assumption), and the re-run printed `all 18 chunk(s) …` (exit 0).
- **Observation for Review: maps get deleted even when the release step fails.** In these
  offline builds the maps were deleted although the release step failed. So a dist that
  passes the guard does not prove the upload succeeded. It proves only that the plugin was
  enabled and ran. Upload success rests on the `errorHandler` from item 2 and on Ship's
  check (a).
- **Real dists without a token.** After the tokenless build above, the guard exited 1 on all
  three apps:
  - marketing: `36 problem(s)`, that is 18 chunks without a debug ID and 18 maps, with no
    `sw.js.map`;
  - rialto-web: `397 problem(s)`;
  - hospitality: `135 problem(s)`.

  That build was `Cached: 11 cached, 12 total`. The turbo cache replayed tokenless `dist/`
  output over the enabled-plugin output, which is exactly the cache caveat recorded above,
  and the guard caught it.

- **paths-coverage allowlist.** The script was added to
  `scripts/check-workflow-paths-coverage.mjs` `ALLOWLIST["deploy-static.yml"]`, with the
  same reasoning as `require-deploy-secrets.mjs`. Before the entry, once the script was
  tracked (`git add -N`), the check failed with
  `FAIL: workflow paths-filter coverage — 1 issue(s) found`, citing
  `deploy-static.yml exercises scripts/verify-sentry-sourcemaps.mjs … paths filter can never fire`.
  After the entry it printed `PASS: workflow paths-filter coverage`.

### Gates

| Gate                                             | Result                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --dir scripts test`                        | `Test Files  248 passed (248)`, `Tests  4777 passed (4777)`                                                                       |
| `pnpm lint`                                      | exit 0. Only pre-existing warnings, for example an unused eslint-disable in `apps/marketing/src/pages/WeeklyIntakePage.test.tsx`. |
| `pnpm typecheck`                                 | exit 0, `Tasks:    52 successful, 52 total`                                                                                       |
| `node scripts/check-workflow-paths-coverage.mjs` | `PASS`                                                                                                                            |

**Neither `turbo.json` nor the scripts trigger a deploy.** `deploy-static.yml`'s push filter
does not include `turbo.json` or `scripts/**`, so merging this deploys nothing. Ship must
dispatch `deploy-static.yml`, as the brief authorizes.

### Pre-push ratchet (flagged for Review)

The first `git push` was rejected by the AI-antipattern ratchet with
`emptyCatch: 79 → 80 (+1)` and `consoleLogs: 717 → 718 (+1)`.

- **`emptyCatch`.** The extra hit came from the test fixture, which quoted the plugin's
  real snippet including its `catch(e){}`. The fixture now keeps only the
  `e._sentryDebugIdIdentifier="sentry-dbid-…"` assignment, and the count is back to 79.
- **`consoleLogs`.** The extra hit is the guard script's one success line. It is
  deliberate CLI output, the same shape as `require-deploy-secrets.mjs`. The baseline was
  raised to 718 with `node scripts/check-ai-antipatterns.mjs --update` rather than routing
  the line around the detector (`process.stdout.write`). Review may prefer to drop the
  success line instead.
