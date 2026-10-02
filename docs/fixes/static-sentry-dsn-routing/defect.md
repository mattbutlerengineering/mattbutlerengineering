---
stage: capture
run: maintenance:static-sentry-dsn-routing
date: 2026-10-02
re-entry: implement
assumptions:
  - "Interview answers come from autorun-brief.md alone (Matt, 2026-10-02); no live interview was held."
  - "Source-map project for marketing and rialto-web is the literal slug `mattbutlerengineering`, not a new secret. A project slug is not a credential: the org slug is already a literal in scripts/sentry-heartbeat.mjs, and the brief allowed either. One fewer secret to provision before the deadline."
  - "The deploy-static marketing and rialto-web jobs gain a `node scripts/require-deploy-secrets.mjs VITE_SENTRY_DSN_MBE` step before their build. The brief asked whether an absent secret breaks the build. Measured: it does not. deploy-static.yml has no secrets guard (the script is wired only into deploy-services.yml), so an absent or empty secret would build an SDK that reports nothing, with no error. That is the exact silent failure #4927 / backend-observability-blackout was about. The guard is presence-only, already unit-tested, and adds one step per job."
  - "No backlog seed matched this defect. The closest, `maintenance:sentry-dsn-static-builds`, is the run that introduced the shared DSN and is already claimed. Nothing was claimed. Origin is Review finding M3 and alert #5941 from feature:sentry-silence-alert."
  - "Redeploy after merge is a `workflow_dispatch` of deploy-static.yml. That is still the CI deploy path, not manual wrangler (see Notes: a workflow-only change does not trigger the push deploy). Ship decides; recorded here so Ship does not wait for a deploy that never fires."
---

# Defect: marketing and rialto-web report to the hospitality Sentry project

## Defect

**Observed:** browser errors from marketing (`/`) and rialto-web (`/rialto/`) land in
the Sentry project `hospitality`. The `mattbutlerengineering` project, where the
heartbeat registry (`scripts/sentry-heartbeat-targets.mjs`) expects them, has received
0 events.

**Expected:** marketing and rialto-web report to `mattbutlerengineering`, with their
source maps uploaded to that same project. hospitality keeps reporting to
`hospitality`.

## Reproduction / Evidence

All of the following were **measured** on 2026-10-02 unless marked otherwise.

- **Deployed bundles carry the hospitality DSN.** `curl` of each live entry chunk,
  grepped for an ingest DSN:
  - `/assets/index-BHgqOM0i.js` (marketing) → `…7faccca5…@o4510650299842560.ingest.us.sentry.io/4511413547040768`
  - `/rialto/assets/index-ifu0gcSr.js` (rialto-web) → same DSN
  - `/hospitality/assets/index-BCZjMWsI.js` (hospitality) → same DSN
  - Sentry MCP `find_dsns` for project `hospitality` returns exactly that DSN
    (key `7faccca51daa0d1c8dae179686042ab8`, project id `4511413547040768`).
- **Heartbeat is red.** Runs 36819787202 (dispatch, 10-01), scheduled 10-01, and
  scheduled 10-02 report `mattbutlerengineering | FAIL | marketing: misrouted →
hospitality; rialto-web: misrouted → hospitality` (from the brief, and
  `docs/features/sentry-silence-alert/release.md` line 96). Alert issue #5941 is open.
- **Earlier evidence:** the hospitality project holds events tagged `app:marketing`
  (sentry-silence-alert autorun brief, line 107).
- **Regression test that already exists:** `scripts/sentry-heartbeat.mjs` and the
  `sentry-heartbeat.yml` workflow. A PASS for `mattbutlerengineering` after deploy is
  the end-to-end proof. The unit-level regression guard is the env-shape test (work
  item 1).

## Root cause

**Confirmed against the code and the deployed artifacts. This is not a hypothesis.**

- `.github/workflows/deploy-static.yml` passes one secret,
  `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}`, to all three build steps: marketing
  (line 148), hospitality (line 199), and rialto-web (line 232).
- Each app calls `initSentry({ appName, dsn: import.meta.env.VITE_SENTRY_DSN })` in
  `apps/*/src/main.tsx`. `packages/sentry/src/react.ts:36` sets the `app` tag from
  `appName`, so events are tagged correctly but sent to the wrong project.
- The secret holds the hospitality DSN, which the bundle grep above confirms.
  `gh secret list` shows `VITE_SENTRY_DSN` set on 2026-05-18, which matches the
  hospitality-only wiring.

**Source maps: a structural fact, with the exact value unmeasured.**

- All three builds pass `SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}` into
  `sentryVitePlugin({ project: process.env.SENTRY_PROJECT, … })`. That is
  `apps/{marketing,rialto-web,hospitality}/vite.config.ts`.
- One value cannot be correct for both the `hospitality` and the
  `mattbutlerengineering` projects. Once the events move, marketing and rialto-web
  source maps must upload to `mattbutlerengineering`, or traces stay minified. This is
  a structural fact.
- **Not measured:** the secret's actual value. GitHub masks it, and the build log
  prints no plugin output that names the project. That it is `hospitality` is an
  inference.

**The existing guard pins the wrong shape.**
`scripts/__tests__/deploy-static-sentry-env.test.mjs` only asserts that the four keys
are _assigned_ (`assignsEnv`). It never checks _which_ secret or value each app gets,
so it passes on the misrouted shape and must be tightened.

## Blast radius

- **Who is affected:** marketing and rialto-web production errors are triaged under
  `hospitality`, mixed with a different app's errors. Source maps for those apps
  probably do not resolve, but this is unmeasured. No user-facing behavior changes.
  hospitality itself is unaffected.
- **Since when:** 2026-05-18 for marketing. rialto-web's build had no Sentry env at all
  until `maintenance:sentry-dsn-static-builds`. Both were wired to the shared secret
  then.
- **Hard deadline:** before **2026-10-04 ~07:00Z**. The heartbeat is red on every
  scheduled run. At the 3rd red scheduled run, `scheduled-workflow-health` files a
  `ci-fix` + `ready` issue at 2026-10-04 08:00Z. implement-queue could then "fix" that
  issue by retargeting the heartbeat to `hospitality`, which would hide this defect.
- **Scale:** two deploy jobs in one workflow, one test file, and one new repo secret.

## Ruled out

- **The apps are not blind.** Events arrive, but in `hospitality` (measured during
  sentry-silence-alert). The earlier "no DSN at all" defect
  (`maintenance:sentry-dsn-static-builds`) is fixed.
- **The `app` tag is not wrong.** `initSentry` tags `marketing` and `rialto-web`
  correctly. The heartbeat's `misrouted` verdict depends on that tag.
- **CSP is not blocking the static apps' events.** All three use the same org ingest
  host `o4510650299842560.ingest.us.sentry.io`. The new DSN uses that same host, so
  `connect-src` needs no change. Ship still verifies this after deploy.
- **There is no in-flight duplicate.** The orchestrator checked open PRs #5989, #5988,
  #5985, #5984, #5982, #5980, #5977, #5972, #5967 and #5966 on 2026-10-02. None of
  them touches Sentry DSNs or `deploy-static.yml`. _Nothing matches._

## Work items

- [x] **1. Failing test first: pin per-app DSN and project routing.** Extend
      `scripts/__tests__/deploy-static-sentry-env.test.mjs` so it asserts the _value_
      of each key, not just that the key is present:
  - marketing and rialto-web assign
    `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN_MBE }}` and
    `SENTRY_PROJECT: mattbutlerengineering`.
  - hospitality assigns `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}` and keeps
    `SENTRY_PROJECT: ${{ secrets.SENTRY_PROJECT }}`.
  - All three keep `SENTRY_ORG` and `SENTRY_AUTH_TOKEN`.
  - Value comparison stays exact-equality on parsed lines, never an interpolated regex
    (CodeQL, same as `assignsEnv`), and skips comment lines.
  - Accept: run against the unchanged workflow, the new cases FAIL and name the app and
    the wrong value. The existing presence cases still pass.
- [x] **2. Route marketing and rialto-web to `mattbutlerengineering`.** In
      `.github/workflows/deploy-static.yml`, change the marketing and rialto-web build
      steps to `VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN_MBE }}` and
      `SENTRY_PROJECT: mattbutlerengineering`. Leave hospitality untouched. Update the
      step comments: they currently say the steps are "kept in step with the hospitality
      build", which is no longer true for the DSN or project.
  - Accept: item 1's test passes. `git diff` shows no change to the hospitality job.
- [x] **3. Fail closed when the new secret is absent.** Add a step before the build in
      the marketing and rialto-web jobs:
      `node scripts/require-deploy-secrets.mjs VITE_SENTRY_DSN_MBE`, with the secret in
      that step's `env:`. Put `set -o pipefail` in front if the step pipes anything.
      Pin it with a test assertion in the same test file.
  - Accept: the test asserts the guard step exists in both jobs, ahead of the build
    step.
  - Accept: a local run of `node scripts/require-deploy-secrets.mjs VITE_SENTRY_DSN_MBE`
    with the variable unset exits non-zero. With it set, it exits 0.
- [ ] **4. Gates.** Run the following in the worktree and confirm they pass:
  - `pnpm install --frozen-lockfile`
  - the scripts test suite, including `deploy-static-sentry-env.test.mjs` and
    `require-deploy-secrets.test.mjs`
  - `scripts/check-workflow-paths-coverage.mjs`
  - `pnpm lint`
  - Accept: all green locally. No stray files are staged; stage by explicit path only.

Release-side steps belong to Ship and are deliberately not checkboxes here:

1. Create the `VITE_SENTRY_DSN_MBE` secret with `gh secret set … --body`, before merge,
   so the guard from item 3 passes.
2. Squash-merge on reviewer PASS + green `CI Gate`.
3. Redeploy marketing and rialto-web through CI. See Notes: this probably needs a
   `workflow_dispatch`.
4. Dispatch `sentry-heartbeat.yml` once. Expect 5/5 PASS and #5941 to self-close.
   Never close #5941 by hand.

## Notes

- **Merging alone will not deploy the fix.** This was measured from the push
  `paths:` filter in `deploy-static.yml`:
  - The filter lists `apps/{marketing,hospitality,rialto-web}/**`, `packages/rialto/**`,
    `packages/rialto-catalog/**` and `packages/auth/**`. It does not list `.github/**`.
  - So a change that touches only the workflow and `scripts/` triggers no deploy on
    merge.
  - `workflow_dispatch` sets all three apps to `true` in `detect-changes`, so a
    dispatch redeploys hospitality too. That is harmless: its env is unchanged.
  - The backlog already has an unclaimed seed for this class ("Make a change to a
    deploy workflow deploy itself"). This run leaves that seed unclaimed.
- **Out of scope (from the brief):**
  - browser `environment: development` / null release (backlog seed exists)
  - the `packages/sentry/**` paths-filter gap (seed exists)
  - `scheduled-workflow-health` changes
  - the hospitality CSP `eval` violation (seed appended to `docs/backlog.md` this stage)
- **For Verify:** check that symbolication works on a `mattbutlerengineering` event
  after deploy. That depends on the "confirm source maps upload" backlog seed.
  Optional for this run. The heartbeat PASS is the required proof.
- **Tracker:** #5941 is the alert this run closes, and it closes itself on a green
  heartbeat. It is not an `intake:` issue: it was filed by automation and is not
  intake-marked.

### Implement log (2026-10-02)

- **Item 1 — RED, measured.** Added `envValue()` + `EXPECTED_SENTRY_ROUTING` to
  `scripts/__tests__/deploy-static-sentry-env.test.mjs` (exact equality on parsed,
  non-comment lines; no interpolated regex). Run against the unchanged workflow:
  `Tests 2 failed | 6 passed (8)`. Failures named the app and the wrong value:
  `marketing build step: VITE_SENTRY_DSN is ${{ secrets.VITE_SENTRY_DSN }}, expected
${{ secrets.VITE_SENTRY_DSN_MBE }}; SENTRY_PROJECT is ${{ secrets.SENTRY_PROJECT }},
expected mattbutlerengineering`, and the same for `rialto-web`. The four presence
  cases and the hospitality routing case passed.
- **Item 2 — GREEN, measured.** Changed only the marketing and rialto-web build-step
  env in `deploy-static.yml` (plus their comments). Same test file: `Tests 8 passed (8)`.
  `git diff -U0` hunks sit at lines 145–154 (marketing) and 230–239 (rialto-web); the
  `deploy-hospitality` job has no hunk.
- **Item 3 — RED then GREEN, measured.** Added `jobBlock()`, `runsSecretGuard()` and a
  per-job assertion (guard step in `deploy-marketing` and `deploy-rialto-web`, with
  `VITE_SENTRY_DSN_MBE: ${{ secrets.VITE_SENTRY_DSN_MBE }}` in its env, at a lower step
  index than the build). Against the item-2 workflow: `Tests 2 failed | 8 passed (10)`,
  `deploy-marketing has no VITE_SENTRY_DSN_MBE guard step` and the same for rialto-web.
  Added a `Require deploy secrets` step right after checkout in both jobs (the
  `deploy-services.yml` placement, before setup-node; the script imports only
  `node:url`), with `set -euo pipefail`. Then `Tests 10 passed (10)`. Local guard run:
  unset → `exit 1` (`is not defined in the step's env block`), empty → `exit 1`
  (`defined but empty`), set → `exit 0`.
  - Deviation (2026-10-02): the guard sits before install, not merely "before the
    build", following the deploy-services precedent of failing before any work.
