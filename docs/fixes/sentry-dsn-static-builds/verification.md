---
stage: verify
run: maintenance:sentry-dsn-static-builds
date: 2026-08-17
---

# Verification: Sentry build env for the marketing and rialto-web deploys

## Summary

2 of 3 criteria PASS. The third — the deployed-surface confirmation — is
**deliberately still open**, not failed: it cannot run until the change has
merged and both sites have redeployed, so it executes as the Ship stage's
post-release step. No criterion failed.

The regression evidence is the centerpiece here, per the protocol's rule that
Verify never scales away on a maintenance run: the guard was watched failing
for the right reason before the fix existed.

## Criteria & evidence

### 1. Guard test fails before the workflow change, naming both dark apps

_(Work item 1 Accept: "the test fails before any workflow change, and its
failure message names both `marketing` and `rialto-web`.")_

- Check: added `scripts/__tests__/deploy-static-sentry-env.test.mjs`, then ran
  it against the **unmodified** `deploy-static.yml`.
- Evidence:

  ```
   FAIL  scripts/__tests__/deploy-static-sentry-env.test.mjs > ... > passes the full Sentry env to the rialto-web build
  AssertionError: rialto-web build step is missing: VITE_SENTRY_DSN, SENTRY_ORG, SENTRY_PROJECT, SENTRY_AUTH_TOKEN: expected [ 'VITE_SENTRY_DSN', …(3) ] to deeply equal []

  - Expected
  + Received

  - []
  + [
  +   "VITE_SENTRY_DSN",
  +   "SENTRY_ORG",
  +   "SENTRY_PROJECT",
  +   "SENTRY_AUTH_TOKEN",
  + ]

   Test Files  1 failed (1)
        Tests  2 failed | 2 passed (4)
  ```

  Four tests: the enumeration guard, plus one per app. The two that failed are
  `marketing` and `rialto-web`; `hospitality` and the enumeration guard passed,
  which is what confirms the test discriminates rather than failing blanket.

- Result: **PASS** (failed for the intended reason, naming the apps and the
  exact missing variables)

### 2. Guard passes after the fix, and the suite is green

_(Work item 2 Accept: "the guard test from item 1 passes, and
`pnpm --dir scripts test` is green.")_

- Check: added the four Sentry variables to the marketing and rialto-web build
  steps; re-ran the single test, then the whole `scripts` suite.
- Evidence:

  ```
   ✓ scripts/__tests__/deploy-static-sentry-env.test.mjs (4 tests) 3ms
   Test Files  1 passed (1)
        Tests  4 passed (4)
  ```

  ```
   Test Files  121 passed (121)
        Tests  2214 passed (2214)
  ```

  The suite was 2210 tests across 120 files before this change, so the delta is
  exactly the 4 new tests and nothing regressed.

- Result: **PASS**

### 3. Deployed bundles report Sentry

_(Work item 3 Accept: "the marketing and rialto-web bundles each report ≥1
occurrence of `ingest.us.sentry.io`, up from 0, with hospitality unchanged at
≥1.")_

- Check: not yet runnable. The fix is a build-time environment change, so it
  can only be observed in a bundle produced by a build that has the new
  environment — i.e. after merge **and** after a deploy.
- Evidence (the pre-fix baseline this will be compared against, measured live
  against production):

  ```
  /assets/index-BX5NGZF2.js             -> sentry-ingest occurrences: 0    (marketing)
  /rialto/assets/index-q8BxDpz1.js      -> sentry-ingest occurrences: 0    (rialto-web)
  /hospitality/assets/index-DrccHO7c.js -> sentry-ingest occurrences: 1    (hospitality)
  ```

- Result: **OPEN** — routes to Ship's post-release step, not to Implement.

## Failures

None. No criterion evaluated to FAIL.

## Not verified

- **That Sentry actually ingests an event from these two apps.** The criterion
  above proves the DSN reaches the bundle; it does not prove an error envelope
  is accepted end-to-end. The CSP path is already known-good (production
  `connect-src` includes the ingest origin, verified live during Capture) and
  hospitality demonstrates the same code path working, so the residual risk is
  low — but "DSN present in bundle" and "event visible in Sentry" are different
  claims and only the first is verified here.
- **Source-map upload.** The three `SENTRY_*` variables are asserted present in
  the workflow, and `sentryVitePlugin` self-disables without
  `SENTRY_AUTH_TOKEN`, so supplying them should enable upload. Whether a
  readable, symbolicated stack trace actually appears in Sentry is unverified —
  it needs a real error from a real deployed build.
- **The `verify` job's own post-deploy assertions.** `deploy-static.yml` has a
  `verify` job that smoke-checks each site after deploy. It was not exercised
  locally; it will run as part of the dispatched deploy during Ship.
- **Behavior of the guard against a hypothetical fourth app.** The enumeration
  is a hand-maintained constant, by design (a glob would fail silently in the
  direction that hides a missing app). The test asserts every listed app has a
  build step, so a renamed app fails loudly — but an app added to the workflow
  and _not_ added to `STATIC_APPS` would not be caught. That trade-off is
  deliberate and documented in the test.
