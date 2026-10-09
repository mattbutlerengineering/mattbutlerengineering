---
stage: review
run: maintenance:static-sourcemaps-confirm
date: 2026-10-04
head: 6014af295
assumptions:
  - "Maintenance-run scale: a lighter pass per the protocol's Run scale section. Verify's evidence (verification.md criteria 1-6) is the floor and was not re-run, except the scripts suite, lint and typecheck after this stage's own fix."
  - "No docs/standards.json exists in this repo, so no finding cites a standards slug."
  - "The fail-closed upload policy (rethrowing errorHandler) is DECIDED by Matt (autorun-brief.md § Decision). It is recorded as residual risk, not as a finding."
  - "The one major was fixed in-stage rather than routed back to Implement: it is a two-step workflow edit that reuses the existing require-deploy-secrets.mjs guard, test-first."
---

# Review: static-site source maps never reach Sentry

## Scope

`git diff origin/main...HEAD` on `fix/static-sourcemaps-confirm` (draft PR #6019), from
`8cfae875d` through `c6013a4ff`, plus this stage's fix commit `6014af295`.

- **Code:**
  - `turbo.json` (build-task `passThroughEnv`);
  - the three `apps/*/vite.config.ts` (rethrowing `errorHandler`; marketing's
    `workbox.sourcemap: false`);
  - `.github/workflows/deploy-static.yml` (post-build guard step, and now the presence
    guard);
  - `scripts/verify-sentry-sourcemaps.mjs`;
  - `scripts/check-workflow-paths-coverage.mjs`;
  - `metrics/ai-antipattern-baselines.json`;
  - three test files under `scripts/__tests__/`.
- **Docs:** `defect.md`, `verification.md`, `autorun-brief.md`, `docs/backlog.md` claim.
- **Read for context, not changed:**
  - `@sentry/bundler-plugins` 5.4.0 `build-plugin-manager.js` and `options-mapping.js`;
  - every workflow that references `SENTRY_*`;
  - `.github/actions/setup-workspace`, `preview-deploy.yml`;
  - `packages/sentry/src/config.ts`.

## Findings

### Major: an empty `SENTRY_ORG`, or hospitality's `SENTRY_PROJECT`, skips the upload silently and still passes the post-build guard

- **Scenario.**
  - `canUploadSourceMaps()` returns false with only `logger.warn("No org provided…")` when
    `org` is empty and the token is not an `sntrys_` org token. It does the same for
    `No project provided…` when `project` is empty.
  - `createRelease()` does the same.
  - Neither path calls `handleRecoverableError`, so the new `errorHandler` never fires.
  - Debug-ID injection (`renderChunk`) and `filesToDeleteAfterUpload` run whether or not
    an upload happened. The dist therefore has a debug ID in every chunk and no `.map`
    files, `verify-sentry-sourcemaps.mjs` exits 0, and wrangler deploys bundles nobody
    can symbolicate. That is the exact silent-no-upload class this run exists to close.
  - Triggers: `gh secret set SENTRY_ORG` with no `--body` (the repo's recorded footgun),
    or a deleted or renamed secret. Hospitality also reads `SENTRY_PROJECT` from a
    secret whose value the brief lists as unknown (hypothesis 3).
- Standard: none.
- **Decision: fixed in `6014af295`, test-first.**
  - The marketing and rialto-web "Require deploy secrets" steps now also require
    `SENTRY_AUTH_TOKEN` and `SENTRY_ORG`.
  - Hospitality gains a "Require deploy secrets" step for `SENTRY_AUTH_TOKEN`,
    `SENTRY_ORG` and `SENTRY_PROJECT`.
  - All of them run ahead of the build, using the existing presence-only
    `require-deploy-secrets.mjs`.
  - The new `deploy-static-sentry-env.test.mjs` block failed 3 of 3 before the edit, and
    the suite passes 4781 of 4781 after it.
  - A local probe with `SENTRY_ORG=` exits 1 with
    `SENTRY_ORG is defined but empty … Refusing to deploy`.
  - The secrets are only checked for presence. The workflow already sets all of them, so
    no credential was created, changed or read.
  - E-evidence from run 37096660655 shows all three as masked, which means non-empty.
    The new step should therefore not block today's deploys.

### Minor: a developer shell with `SENTRY_AUTH_TOKEN` exported now uploads from local builds

- **Scenario.**
  - Before this change, turbo's strict env mode stripped the token from every
    `pnpm build`.
  - With `passThroughEnv`, a developer who has the token exported (for example, for
    `sentry-cli`) and runs `pnpm build` creates a release and uploads artifacts named
    after their local HEAD SHA.
  - If that upload fails, the rethrowing `errorHandler` now fails the local build.
  - The brief records that no local token exists today.
- Standard: none.
- **Decision: deferred.**
  - There is no token locally, so no one is affected today.
  - Unsetting the token is the remedy, and the build error names it.
  - The alternative, gating on `CI`, would add a second switch the brief did not ask for.

### Minor: the `errorHandler` test is textual

- **Scenario.**
  - `static-sentry-vite-plugin.test.mjs` matches
    `errorHandler: (x) => { throw x; }` by regex.
  - An equivalent rewrite would fail the test while behaving correctly, for example
    method shorthand or `(e) => { throw new Error(…, { cause: e }) }`.
  - That is a false red, which fails in the safe direction. The behaviour itself is
    proved by Verify criterion 2: enabled-offline exits 1 for all three apps, and main's
    config exits 0.
- Standard: none.
- Decision: deferred. A false red cannot ship a regression. A behavioural test would
  need a vite build inside the scripts suite, which costs far more than the risk.

## Adjudicated questions (no finding)

1. **`passThroughEnv` scope.**
   - It sits on `tasks.build` only, not `globalPassThroughEnv`, so test, lint and
     typecheck do not receive it. Verify criterion 1(c) proved the token stays out of
     the task hash.
   - Only `deploy-static.yml` (push to main, and `workflow_dispatch`) sets
     `SENTRY_AUTH_TOKEN` on a build step.
   - `ci.yml` and `preview-deploy.yml` set no `SENTRY_*` and no `VITE_*`. PR builds stay
     tokenless, the plugin stays disabled, and `errorHandler` cannot run, so there are no
     PR-side uploads, releases or fail-closed blocks.
   - `sentry-heartbeat.yml` sets the token at job level, but it never builds.
     `setup-workspace` only installs. `sentry-triage.yml` maps it to
     `SENTRY_ACCESS_TOKEN`.
   - `apps/gen` uses the plugin too, but deploy-static never builds it.
2. **`workbox.sourcemap: false` on marketing.**
   - Safe. `sw.js` is generated workbox runtime with no Sentry SDK, so there is nothing
     to symbolicate.
   - Production already returns 404 for `.map` at the edge router (verification.md
     criterion 8), so no production debugging is lost.
   - Local `vite preview` loses the SW map. That is acceptable.
3. **Guard scope.**
   - The guard checks for debug IDs only in `assets/**/*.js`, and checks for `.map` files
     across the whole dist.
   - Against the real enabled-plugin dists it passed every chunk, lazy chunks included:
     18 for marketing, 199 for rialto-web and 68 for hospitality. Against the tokenless
     dists it failed all three (Verify criterion 3), so it neither false-passes nor
     false-fails on today's output.
   - None of the three apps emits worker bundles, and none has a `public/assets/*.js`.
     A future `new Worker(new URL(…))` chunk would land in `assets/` without a debug ID
     and fail the guard. That is loud, not silent, so it is acceptable.
   - Its documented limit: it proves the plugin ran, not that the upload succeeded. That
     part is covered by `errorHandler`, by the new presence guard, and by Ship's checks.
4. **Release naming.**
   - The plugin's default release is the git SHA (`releases new <sha>`, then
     `set-commits` with `shouldNotThrowOnFailure: true`, then `finalize`).
   - The marketing and rialto-web jobs run in parallel against the same org-level release
     and the same project. Hospitality adds its own project to the same release.
   - `releases new` on an existing version is idempotent in Sentry: it answers 208, and
     `finalize` re-sets `dateReleased`.
   - Debug-ID artifact bundles do not depend on the release. A conflict needs a
     simultaneous-create race that Sentry resolves server-side.
   - **Residual risk:** the first real multi-app run is at Ship. If it fails, it fails
     loudly (fail-closed), not silently.
   - Side effect worth knowing at Ship: release injection is on by default, and
     `packages/sentry` passes `release: undefined`. The browser SDK falls back to the
     injected `SENTRY_RELEASE.id`, so events from the redeployed apps should start
     carrying `release=<sha>`. That touches the out-of-scope release-tagging seed
     (environment stays wrong), and it helps symbolication rather than hurting it.
5. **Ratchet 717 → 718.**
   - The one new `console.log` is the guard's success line in a CI step. Its output is
     the point, and the error paths use `console.error`, which is not counted.
   - `node scripts/check-ai-antipatterns.mjs` reports `consoleLogs: 718 (baseline: 718)`,
     main is at 717, and no slack was granted.
   - Swapping it for `process.stdout.write` would game the metric. Accepted.
   - **Residual risk:** this bump is exact. Any other PR that adds a `console.log` must
     re-run the ratchet on the merge result before merging.

## Residual risk (decided, not findings)

- **Fail-closed upload policy (Matt, 2026-10-04).** A Sentry outage, or an expired or
  under-scoped token, blocks all three static deploys, hotfixes included, until it is
  fixed or the `errorHandler` line is reverted.
- **The new presence guard adds the same posture for empty secrets.** It is consistent
  with that decision and with the existing `VITE_SENTRY_DSN_MBE` guard.
- **Token scope and slug correctness are still unproven against sentry.io.** That is
  Ship's check 7.

## Repo reviewer subagent

The `reviewer` subagent reviewed the diff at `c6013a4ff`, before this stage's fix,
against `defect.md` work items 1-3. Its scratch dir was `review-6019-r1a7/`.

- **Verdict: PASS, score 8/10.**
- **Items 1-3: met.** All 58 tests in the four affected test files pass.
- **Hallucinations:** none. It checked `errorHandler`, the `sentry-dbid-` marker, workbox
  `sourcemap` and `passThroughEnv` against the 5.4.0 plugin source.
- **Regressions:** none. No PR-triggered path reaches `SENTRY_AUTH_TOKEN`.
- **Gate bypasses:** none. The 717→718 ratchet bump is one CLI success line.
- **One issue, which the subagent capped at minor:** the empty-org/project silent skip.
  It is the same defect as this review's Major. The subagent proposed the same fix, and
  it landed in `6014af295`, which closes the issue its score was capped for.

## Passes with no findings

- **Security:** clean.
  - The new guard reads the secrets by name from env and never echoes them. `argv`
    carries only the names.
  - No secret values were added, and `passThroughEnv` keeps the token out of turbo's
    hash and its remote-cache key.
  - There is no PR-reachable path to the token.
- **Design:** clean apart from the major above.
  - The changes match the existing patterns: the `require-deploy-secrets.mjs` gate,
    enumerated apps in the tests, textual YAML step parsing, the paths-coverage
    allowlist entry, and `set -euo pipefail` on each gate step.
- **Correctness:** one major, now fixed, and two minors, deferred.

## Verdict

**Ready to ship.** Of 3 findings, 1 is major and fixed, and 2 are minor and deferred
with reasons. No critical findings were raised, so none remain unfixed.

After `6014af295`:

- `pnpm --dir scripts test`: 4781 of 4781 pass.
- `pnpm lint`: exit 0, warnings only, all pre-existing.
- `pnpm typecheck`: exit 0.
- Prettier is clean on the changed files.

Next stage: Ship.

- First confirm the new "Require deploy secrets" steps pass on the real deploy.
- Then confirm check 7: the upload succeeds with the real token.
- Then confirm checks 8 and 9 (see `verification.md`).
- Also expect browser events to start carrying `release=<sha>`.
