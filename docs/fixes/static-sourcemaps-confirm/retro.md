---
stage: operate
run: maintenance:static-sourcemaps-confirm
date: 2026-11-07
users-observed: 0
signal-source: "gh pr view 6019 (MERGED 2026-10-04T05:09:36Z, squash 4402db761); gh api actions/workflows/deploy-static.yml/runs?created=2026-10-04T05:10:00Z..2026-11-07T20:00:00Z (619 runs: 556 success, 61 cancelled, 2 failure) and gh run view --log-failed on both failures; git log origin/main -- turbo.json apps/*/vite.config.ts scripts/verify-sentry-sourcemaps.mjs .github/workflows/deploy-static.yml; Sentry MCP (org mattbutlerengineering, us.sentry.io, read 2026-11-07): find_releases, search_issues is:unresolved 30d on projects hospitality and mattbutlerengineering, get_issue_details HOSPITALITY-D / HOSPITALITY-F / MATTBUTLERENGINEERING-F, search_errors 'stack.filename:*assets/* environment:production' 30d on both projects; gh issue/search for the run slug. No person is observed using a symbolicated trace: no issue, comment or note records Matt (or anyone) opening one."
assumptions:
  - "Population is 0. This is internal observability tooling. The only possible user is the Owner reading a stack trace in Sentry, and no record shows that. Sentry 'Users' counts (45 on HOSPITALITY-D, 31 on the heartbeat issues) are IP-keyed event senders, mostly the synthetic heartbeat and Azure/CI addresses, and are not counted as people."
  - "The brief's operate section names no minimum signal (autorun-brief.md has no `operate:` section); the check reported against is the one release.md left open for Operate: 'the first real browser error will be the proof, and Operate should check its frames'."
  - "'Frames resolve to source' is read as: the event's stack shows original file paths, function names and source lines, not minified `assets/index-*.js:L:C` positions. I checked event contents in Sentry; I did not re-run a build."
  - "Only `hospitality` and `mattbutlerengineering` browser events were searched. marketing and rialto-web both report into `mattbutlerengineering`; no rialto-web event was singled out."
---

# Retro: static-site source maps reach Sentry

## Gate

`release.md` records `status: SHIPPED`, merge `4402db761` (PR #6019). `gh pr view 6019` returns `MERGED` at 2026-10-04T05:09:36Z. The follow-up record PR is #6021. The run is 34 days past release. It is a maintenance run, so there is no population to grow; the question is state, recurrence, and the one signal Ship left PENDING.

## Did the defect recur?

No, on the evidence available (pattern, not proof).

- `main` still carries every piece of the fix (checked 2026-11-07): `turbo.json:38` has `"passThroughEnv": ["SENTRY_AUTH_TOKEN","SENTRY_ORG","SENTRY_PROJECT"]`; `errorHandler` is present in all three `apps/{hospitality,marketing,rialto-web}/vite.config.ts`; `scripts/verify-sentry-sourcemaps.mjs` exists and is invoked in `deploy-static.yml` (lines 200, 274 and the rialto-web job).
- Sentry `find_releases` (2026-11-07) returns a release `5e562c6daae8768bdf0b5f542cf9c54f226b7174` created 2026-11-07T18:29Z across `mattbutlerengineering` and `hospitality` (and the three backend projects), with `firstEvent` 18:49Z. Releases were `[]` before the fix.
- `search_errors` `stack.filename:*assets/* environment:production`, 30d: **no results** on `hospitality` and on `mattbutlerengineering`. No event in 30 days carries a raw `assets/` bundle filename in its stacktrace, which is the footprint the original defect left.
- Production deploys since the merge: 619 `deploy-static.yml` runs, 556 success, 61 cancelled, 2 failure. Neither failure was the post-build guard failing for missing debug IDs or a leftover map. One was Sentry-side (see Outcomes, criterion 4); one was `Deploy to Workers Static Assets` (run `40948538604`, 2026-10-29), unrelated to this fix.

No regression test, review finding or design constraint was missed that would produce a recurrence, so no preventive seed is raised on that basis. The seeds below are about what the fix cannot yet show.

## Outcomes vs. intent

Population is 0, so every outcome's signal is `unobserved` as to use. Where a state was measured it is recorded; the label stays `unobserved` for the claim that someone benefited. Targets are from `defect.md` § Expected and its work items.

### Each deploy-static build injects debug IDs, uploads its maps, and deletes them before deploy

- What happened: deploy-static has run 619 times since the merge and the guard step is still in all three jobs. `release.md` § (a)/(b) proved this at release (six jobs "Successfully uploaded source maps to Sentry"; wrangler listed 0 `.map` files; live chunks 4/5, 10/10, 11/11 carrying `sentry-dbid-`). Today's evidence is Sentry's own: a release for 2026-11-07's deploy with `mattbutlerengineering` and `hospitality` attached. I did not re-fetch the live chunks on 2026-11-07, so the `sentry-dbid-` count is from release time, not today.
- Signal strength: unobserved (state measured; no person observed relying on it)

### Production stack frames resolve to source (PENDING at Ship)

- What happened: this is now answered for hospitality. `HOSPITALITY-D`'s latest event (`147a67e6a3c0451c99cbee2aa7e76606`, 2026-11-07T19:04:10Z, `environment: production`, `release: 5e562c6d…`, `url: …/hospitality/onboarding`) carries a stacktrace whose frames are `packages/api-client/dist/client.js:176:16 (ApiClient.getOne)`, `…/client.js:90:25 (ApiClient.request)`, `packages/sentry/dist/react.js:70:9 (reportApiError)` and `@sentry/core/build/esm/exports.js:15:28 (captureMessage)`, each with its surrounding source lines. These are original file paths, function names and lines, not `assets/index-*.js` positions. The first-party app frames (`apps/hospitality/src/…`) are not in this stack, so symbolication of the app's own `.tsx` code is not seen in this event. The frames that did resolve land on `packages/*/dist/*.js`, the workspace packages' compiled output, not on their `.ts` sources; the `react.js` excerpt ends `//# sourceMappingURL=react.js.map`. Whether that is one hop short of `src/*.ts` was not checked.
- The heartbeat events (`MATTBUTLERENGINEERING-E`, `HOSPITALITY-C`) have culprit `sentryWrapped(@sentry+browser@11.10.0/node_modules/@sentry/browser/build/npm/esm/prod/helpers)`, also resolved. `defect.md` already says these prove little (Playwright-injected frames).
- Caveat on the event: `HOSPITALITY-D` is a handled 401 warning from `reportApiError` (`level: warning`), reported from `4.227.14.67` (Windows, Chrome 128). I cannot tell a person from automation. It is evidence that Sentry resolves a production event, not that anyone read it.
- Signal strength: pattern for "Sentry resolves production frames" (one inspected event, plus 30 days with zero raw-`assets/` stack filenames); unobserved for use.

### A failed upload fails the build, loudly

- What happened: it did, once. Run `39573191455` (2026-10-21T08:57Z, push, `c3371b5fe`): `Deploy Hospitality` failed at its build step with `SentryError: Failed to create release: 502 Bad Gateway` (the rethrowing `errorHandler` working as intended). The Sentry outage did not stop deploys for long: the next push run, `39575385865` at 09:14Z, succeeded, 17 minutes later, and 11 more consecutive runs through 12:21Z succeeded. That is the cost Matt accepted on 2026-10-04 (`autorun-brief.md` § Decision), measured: 1 blocked deploy in 619 runs, recovered by the next push, no hotfix was blocked that I found.
- Signal strength: measured (1 failed run in 619, logs read)

### The post-build guard cannot be bypassed by a silent skip (Review major, `6014af295`)

- What happened: the presence step (`require-deploy-secrets.mjs SENTRY_AUTH_TOKEN SENTRY_ORG SENTRY_PROJECT`) is on `main` and printed `All 3 required deploy secret(s) present` in the 2026-10-21 failed run's log, so it runs in production. No run in the window failed on it, so its fail path is untested in production; it is proved only by `deploy-static-sentry-env.test.mjs`.
- Signal strength: unobserved

### Browser events carry a real release (a side effect `release.md` flagged, not an intent)

- What happened: seen. `HOSPITALITY-D` events have `release: 5e562c6d…` and `environment: production`. That is delivered by the separate `maintenance:browser-sentry-env-release` run (PR #6035, merged 2026-10-04T20:03Z), not by this one. Recorded as the interaction `release.md` named, not credited here.
- Signal strength: pattern

### Not evidence

- `MATTBUTLERENGINEERING-F` (2026-10-10, release `ee8941d4…`, after this fix) shows raw frames such as `at Dt (…/vendor-react-Yl7_JAV3.js:9:68260)`, but only in `extra.componentStack`, which Sentry never symbolicates, and its stacktrace is "No stacktrace available" (a dynamic-import failure). `defect.md` E6 already classed this field as weak. It does not show a symbolication failure.

## Open debt

Issues the run itself filed: none. `gh issue list --search "static-sourcemaps-confirm"` returns `[]`, and no issue cites `review.md` or `verification.md` of this run.

Review deferrals recorded only as prose in `review.md` and never filed as issues (state: unfiled, so no issue to check):

- Minor 1: a developer shell with `SENTRY_AUTH_TOKEN` exported now creates a release and uploads from a local `pnpm build`, and a failed upload fails that local build. Still true on `main` (`turbo.json:38` passes the token on every `build`).
- Minor 2: the `errorHandler` test is textual (`static-sentry-vite-plugin.test.mjs` regex), so an equivalent rewrite goes falsely red.

Also: the backlog line this run claimed (`docs/backlog.md:43`, "Confirm source maps upload…") still reads `(claimed: maintenance:static-sourcemaps-confirm)` with no shipped marker. Left to whoever curates the backlog; this retro does not edit it.

## Run retrospective

- Keep: Capture measured before fixing (E1 to E7: 0 of 25 live chunks injected, the `*.map` 404 shown to be the edge router and not deletion, `SENTRY_*` absent under strict env). The brief's hypotheses 2 and 3 were credentials; the real cause was a turbo allowlist. Implement then observed the missing link directly with a one-line env probe (`token-set=false` then `true`).
- Keep: the guard has real teeth. It caught marketing's `sw.js.map` (workbox writes it after the plugin's delete) before any deploy did, and it is the reason the Review major (empty `SENTRY_ORG` skipping upload) was found: the reviewer asked what the guard cannot see.
- Keep: stopping short of the credential. No `gh secret set`, no token change, as the brief required, and none was needed.
- Change: Ship's proof stopped one step short of the stated goal. The goal was "readable stack traces"; Ship proved upload and debug-ID injection and left symbolication PENDING, correctly. It then took until Operate to find one event. A maintenance run whose goal is symbolication should include, in scope, one deliberate throw from a production page (`defect.md` § Scope excluded it), or name the post-deploy query that will resolve the question and when. As it stood, Operate resolved it by luck of a 401 warning.
- Change: `defect.md`'s claim "merging this deploys nothing" was wrong (the push filter covers `apps/*/vite.config.ts`). It cost nothing here but the same belief could skip a rollback plan. State the deploy trigger by reading `paths:` in `deploy-static.yml`, not from the file categories touched.
- Stop: nothing. The run was proportionate to a low-severity observability defect.

## Environment

One row per mistake the run recorded. Sources: `defect.md` § Root-cause hypothesis and § Implement notes, `verification.md` § Failures ("None") and § Not verified, `review.md` § Findings, `release.md` § Release log item 4.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` were stripped by turbo's strict env mode, so the plugin was a no-op and nothing noticed for months (silent: zero releases, maps shipped) | `defect.md` E1, E4 | mechanical | Now caught. `scripts/__tests__/deploy-static-sentry-env.test.mjs` asserts the three names reach the build task; `scripts/verify-sentry-sourcemaps.mjs` fails the deploy job if the plugin did not run. Both run in CI: the test via `pnpm turbo test:coverage` in the `Test (rest)` leg of `ci.yml` (`@mbe/scripts` has a `test:coverage` script), the guard in `deploy-static.yml`. |
| marketing's service-worker map (`sw.js.map`) was written by workbox after the plugin's delete, so the first guarded build would have failed every marketing deploy | `defect.md` assumption 5 (Implement) | mechanical | `scripts/verify-sentry-sourcemaps.mjs` in `deploy-static.yml` (it measured this itself). |
| An empty `SENTRY_ORG`, or hospitality's `SENTRY_PROJECT`, skipped the upload with only a warning and still passed the guard | `review.md` § Findings, Major | mechanical | `scripts/require-deploy-secrets.mjs` step in all three `deploy-static.yml` jobs (present on `main`; ran in the 2026-10-21 failed run). Its fail path has no production firing. |
| `defect.md` said merging deploys nothing; the vite-config change matched the push `paths:` filter and deployed twice | `release.md` § Release log item 4 | judgement | No deterministic carrier. The `paths:` filter in `.github/workflows/deploy-static.yml` is the fact to read; I did not verify that any check reasons from it about a given PR's deploy impact. |
| A local shell with `SENTRY_AUTH_TOKEN` exported now uploads releases and can fail a local build (deferred, never filed) | `review.md` § Findings, first Minor | judgement | None. `turbo.json` passes the token on every `build` task; no hook or CI job covers local builds. Finding: deferred Minors are prose only, so nothing tracks it. |
| The `errorHandler` test matches source text, not behaviour | `review.md` § Findings, second Minor | judgement | `scripts/__tests__/static-sentry-vite-plugin.test.mjs` is the existing carrier; behaviour was only proved once by hand (`verification.md` criterion 2). |
| The guard proves the plugin ran, not that sentry.io accepted the maps (a passing enabled dist survived a failed release step offline) | `verification.md` criterion 3 caveat | mechanical | `errorHandler` rethrow in the three `vite.config.ts` plus the presence step cover the failure modes known. No check reads Sentry after deploy to confirm the live debug IDs have artifacts. A `sentry-cli`-style post-deploy query would need a token in a job that does not have one today; not verified to exist. |

Finding: the check commands that guard this fix run in CI (`Test (rest)` for the scripts suite; `deploy-static.yml` for the guard and presence steps). `deploy-static.yml` runs only on push to `main` and `workflow_dispatch`, so the guard has no PR-time run; a PR that breaks it is caught by the scripts suite, not by the guard itself.

## Idea seeds

- Raise one deliberate browser error from each static app's production bundle (marketing, rialto-web, hospitality) after a deploy and record in Sentry whether the event's first-party frame resolves to `apps/<app>/src/*.tsx` rather than `packages/*/dist/*.js`; the only resolved event seen (`HOSPITALITY-D`) has package frames only, so app-code symbolication is still unobserved (from: maintenance:static-sourcemaps-confirm)
- Check whether workspace-package frames stop at `packages/*/dist/*.js` because the package builds emit no usable `.js.map`, by reading `HOSPITALITY-D`'s frame source links and a package's `dist/*.js.map`; measure the share of frames in the next 20 production events that resolve to `.ts`/`.tsx` (from: maintenance:static-sourcemaps-confirm)
- Count how often the fail-closed upload policy blocks a deploy and for how long: 1 blocked run of 619 since 2026-10-04 (Sentry 502 on release create, 17 minutes to the next successful deploy); re-count from `gh run list --workflow deploy-static.yml` at 90 days, and decide on a retry only if the count or the recovery time grows (from: maintenance:static-sourcemaps-confirm)
- Add a post-deploy check that a live chunk's `sentry-dbid-` is known to Sentry (an artifact bundle exists for it), so "upload succeeded" is observed after the deploy and not inferred from the plugin's exit; measure with one `sentry-cli` or API query per deploy and its failure count (from: maintenance:static-sourcemaps-confirm)
- File the two deferred Review minors of this run (local-token upload on `pnpm build`; textual `errorHandler` test) or drop them: they sit as prose in `review.md` with no issue, 34 days on (from: maintenance:static-sourcemaps-confirm)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. Existing seeds not duplicated: `docs/backlog.md:42` (backend release), `:43` (this run's claimed origin line).
