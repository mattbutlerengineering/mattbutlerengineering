---
stage: verify
run: feature:auth-handshake-flows
date: 2026-08-30
tree: "main @ 500affc76 (origin/main at stage start; it advanced one commit past it during the stage — 607f3cdca #4766, an automated production-health metrics record with no source change); evidence timestamps are UTC 2026-08-31T04:55Z–05:15Z"
assumptions:
  - 'Graded against prd.md where the breakdown''s literal acceptance lines diverge from it: criterion 11 is judged on the PRD/architecture rule (''always two different sentences''), not on issue #4729''s contract that copied ux.md D2''s ''settled "Account created"'' row; and the #4725 line ''grep "Sign in again|couldn''t refresh" finds nothing'' is read as ''no leftover banner copy'', since its one hit is the designed S4 tagline from #4722.'
  - "The deployed target is production main@500affc76 as shipped by deploy-static run 33358630413 (completed success at 04:55Z); no staging surface exists, so every 'deployed' check below was run against https://mattbutlerengineering.com after that run finished."
  - "Criterion 9's 'the spec passes when the environment allows' is satisfied by CI, not locally: .github/workflows/e2e-screenshots.yml runs the full hospitality Playwright suite (testDir e2e/, setup project = auth.setup.ts) with the E2E_AUTH0_* secrets on every push to main touching apps/hospitality/**. Its runs on 3986a98e4 and 500affc76 are quoted as the evidence; no local Playwright run was attempted."
  - "Where a main-push CI run was 'cancelled' (concurrency superseded by the next merge — 9e1ff69e0, fb67f7b11, b8c552e39, ad18c502d, 8d0579abe), the PR-level `CI Gate` (SUCCESS on all eleven PRs, quoted below) is taken as the gate evidence, plus the local gates run here on 500affc76."
  - "packages/rialto was run only for the Handshake files and the a11y matrix, and apps/gen was not run locally (root `pnpm typecheck` covers its typecheck; its tests are covered by the PR CI `Test (Node 22)` job) — per the stage's allowed-command list; the rialto full suite is likewise covered by CI."
  - "Deployed sub-second phases (`/demos/signup` submitting at 1500 ms, `/demos/login` submitting/verifying at 900 ms) were not captured with the MCP browser (turn latency exceeds the window); their unit tests under fake timers are the evidence for those phases."
  - "`date:` is the local calendar date the stage ran (2026-08-30 PDT); every quoted CI/deploy timestamp is UTC on 2026-08-31."
surfaced:
  - "FAIL, routes to Implement: `/demos/signup` `created` phase gives the Handshake image label and the role=status line the same sentence ('Account created' / 'Account created') — SIGN_UP_PHASES.created in apps/rialto-web/src/pages/auth/SignUp.tsx:46-50, reproduced on the deployed page. PRD criterion 11 and architecture.md § Demo phase tables forbid it; ux.md D2 and issue #4729 specified it. The distinct label string is a UX/human choice (breakdown suggested 'Account created — your browser and Identity agree'); SignUp.test.tsx:278-282 currently pins the identical pair and ux.md D2 needs the same patch."
  - 'Pre-existing defect outside the run, found while probing: rialto `PinInput` renders zero cells when `value` is empty — packages/rialto/src/components/PinInput/PinInput.tsx:74 `value.padEnd(length, "")` is a no-op with an empty pad string, so `chars = []` and the `chars.map` render loop emits nothing. On the deployed `/demos/login` the ''Authenticator code'' group is an empty <div role=group>; the verification step cannot be driven, so the login demo''s `rejected`→failed and `verified`→settled phases were verifiable only by unit test (which mocks PinInput). Predates the run (last PinInput change #3220; the pre-run SignIn.tsx at 1d6189203 used the same `<PinInput value={code}>`); every rialto PinInput test passes a non-empty value, so nothing in CI sees it. Needs a capture/maintenance run — not fixed here.'
  - "Not exercisable from here: a real Auth0 sign-out round-trip (needs operator credentials and the tenant's Allowed Logout URLs, both outside the repo). Criterion 1 is verified by unit test and by loading the post-logout URL directly on production; whether Auth0 actually returns there remains the Maintainer step recorded in breakdown.md."
  - "The hospitality E2E job uses an aggregate reporter: the CI log shows `Running 71 tests using 1 worker` / `71 passed`, not per-spec lines, so auth.spec.ts's three tests are inferred from suite composition (auth.setup.ts is the `setup` project every other project depends on; auth.spec.ts is in testDir and not in testIgnore), not from a line naming them."
---

# Verification: Auth handshake flows

## Summary

**11 of 12 PRD criteria PASS, 1 FAIL (criterion 11), 0 unverifiable** — _re-verified 2026-08-31 after fix #4770 / PR #4772 merged as `14af05e3c`: criterion 11 now PASS, 12 of 12 (see § Re-verification below)_ — plus every breakdown-only acceptance line PASS. The one failure is the known `/demos/signup` `created`-phase duplicate sentence; it routes back to Implement. Deployed-site checks confirmed the signed-out landing, the in-place failure with a working retry to Auth0, and all four rialto-web demos on production at `500affc76`; the one thing production could not demonstrate is the login demo's rejected/verified phases, blocked by a pre-existing rialto `PinInput` bug (surfaced above, out of run scope).

Gates run locally on `main @ 500affc76` (all `rc=0`):

```
packages/auth            Test Files  10 passed (10)   Tests  165 passed (165)
packages/rialto Handshake Test Files   2 passed (2)   Tests   16 passed (16)
packages/rialto a11y-matrix Test Files 1 passed (1)   Tests   88 passed (88)
apps/hospitality         Test Files 134 passed (134)  Tests 1698 passed (1698)
apps/rialto-web          Test Files  54 passed (54)   Tests  698 passed (698)
apps/hospitality lint    ✖ 124 problems (0 errors, 124 warnings)
apps/rialto-web lint     ✖ 151 problems (0 errors, 151 warnings)
pnpm typecheck (root)    Tasks: 48 successful, 48 total
pnpm regen --check       All generated artifacts are up to date.
```

## Criteria & evidence

### 1. Sign-out lands on a signed-out state

- Check: `App.test.tsx` case for `/hospitality/callback`, empty search, `isLoading=false`, `isAuthenticated=false`; then loaded the production post-logout URL with no params in a real browser.
- Evidence — unit (`apps/hospitality/src/App.test.tsx:179-193`, in the 1698 passing):
  ```
  it("renders the signed-out login gate when a sign-out round-trip lands on /callback with no OIDC params", () => {
    window.history.replaceState({}, "", "/hospitality/callback");
    ...
    expect(screen.getByTestId("login-prompt")).toBeDefined();
    expect(screen.getByText("You're signed out. Sign in again whenever you're ready.")).toBeDefined();
    expect(screen.queryByTestId("callback-page")).toBeNull();
    expect(screen.getByRole("button", { name: "Sign In" })).toBeDefined();
  ```
  Evidence — deployed (`page.evaluate` on https://mattbutlerengineering.com/hospitality/callback, 04:57Z):
  ```
  { "loginPrompt": true, "callbackPage": false, "authLayout": false,
    "signInButton": true, "signInButtonName": "Sign In",
    "bodyHasVerifying": false, "bodyHasSignedOut": true,
    "mainText": "Hospitality\n\nYou're signed out. Sign in again whenever you're ready.\n..." }
  ```
  The gate is synchronous — `App.tsx:96-101` branches on `hasAuthParams(window.location)` at render; no timer exists in the file.
- Result: **PASS** (in-repo behaviour; the Auth0 round-trip itself is NOT verified — see Not verified).

### 2. The real callback is untouched

- Check: existing "session lifecycle" cases plus the params-present-and-not-loading case.
- Evidence (`App.test.tsx:157-177`, passing): `"renders the callback handshake instead of the generic loader while OIDC finishes on /callback"` (isLoading=true, `?code=abc&state=xyz` → `callback-page`, no `loading-page`) and `"keeps the callback handshake up after loading settles but before the user lands"` (isLoading=false, params present → `callback-page`, no `login-prompt`). Deployed: with `?code=…&state=…` present the page rendered `AuthFailurePage` (the provider consumed the bogus state), and `callbackPage:false, loginPrompt:false` — i.e. the no-params branch did not fire when params were present.
- Result: **PASS**

### 3. A failed exchange fails in place

- Check: `AuthFailurePage.test.tsx` over all four `describeAuthError` categories × both lanes; a forced failure on production.
- Evidence — unit (`apps/hospitality/src/pages/AuthFailurePage.test.tsx:57-108`): `describe.each` over `access denied` (`error: "access_denied"`, `canRetry: false`), `expired flow` ("No matching state found in storage"), `network` ("Failed to fetch"), `default` ("Auth Failed"); for each, `it.each([0, 1])("renders the failed handshake in place for lane %i")` asserts `getByRole("img", { name: "Your sign-in could not be verified" })` has `data-state="failed"` and `data-lane=String(lane)`, the category title, and the raw message inside the `Technical details` `<details>`; `"shows/omits the \"Try again\" retry action"` asserts presence iff `canRetry`. Whole file in the 1698 passing.
  Evidence — deployed (https://mattbutlerengineering.com/hospitality/callback?code=bogus-verify-probe&state=bogus-verify-probe, 04:58Z):
  ```
  { "authFailure": true, "callbackPage": false, "loginPrompt": false,
    "handshake": { "label": "Your sign-in could not be verified", "state": "failed", "lane": "1",
                   "stations": ["Browser:neutral", "Identity:danger", "API:danger"] },
    "statusText": "The exchange didn't go through",
    "title": "That sign-in link expired",
    "body": "Sign-in links are single-use. Start again and it should go through.",
    "buttons": ["Try again"], "detailsSummary": "Technical details",
    "technicalMessage": "No matching state found in storage" }
  ```
- Result: **PASS**

### 4. Retry restarts sign-in

- Check: unit test on the retry handler; clicking "Try again" on the production failure page.
- Evidence — unit (`AuthFailurePage.test.tsx:117-122`): `"calls signIn exactly once with no arguments when Try again is clicked"` → `expect(signIn).toHaveBeenCalledTimes(1); expect(signIn).toHaveBeenCalledWith();`. The bare call inherits the `@mbe/auth` rule (`packages/auth/src/react/hooks.test.tsx:166`, `"derives returnTo as / when signIn is invoked from the callback path"` → `signinRedirect` called with `{ state: { returnTo: "/" } }`; `return-to.test.ts` has the three callback-path cases at lines 99-118), all in the 165 passing.
  Evidence — deployed: `page.locator('[data-testid="auth-failure"] button').click()` →
  ```
  Page URL: https://dev-ytbgmz5ls3wh4xdx.us.auth0.com/u/login?state=hKFo2SBRNTNhejZCUzZDRHRhNkhtVzFYQjRPVk96dGxEVWJ4eaFur3VuaXZlcnNhbC1sb2dpbqN0aWTZIFRRM2ZpWE82azRyM3dzQjR5TVBDMy1zbDUzVm5zSjNXo2NpZNkgNHpXVHlHc2dHWm9rMkdZQWdYRkIwaXM0Y09FU0dRZHU
  Page Title: Log in | mattbutlerengineering-hospitality
  ```
- Result: **PASS**

### 5. Banner and gate share one voice

- Check: one shared source read by both components; both test files assert the same action label; banner stays non-blocking.
- Evidence — source: `apps/hospitality/src/constants/session-lapse-copy.ts` exports the frozen `SESSION_LAPSE_COPY` (`heading`, `body`, `refreshFailedLead`, `action: "Sign back in"`, `actionBusy`); `SessionExpiredGate.tsx:39,42,51,53` and `DashboardLayout.tsx:333,337` read from it (no other string literals for those slots).
  Evidence — tests (both in the 1698 passing): `SessionExpiredGate.test.tsx:68-69` `getByRole("button", { name: SESSION_LAPSE_COPY.action })` / `toHaveAccessibleName(SESSION_LAPSE_COPY.action)`; `DashboardLayout.test.tsx:399-401` banner `toHaveTextContent(\`${SESSION_LAPSE_COPY.refreshFailedLead} ${SESSION_LAPSE_COPY.body}\`)`, `:437-438`same action-label assertion;`"hides the banner when dismissed"`still green (dismissible,`Banner variant="warning"`, dashboard rendered beneath — `DashboardLayout.tsx:327-339`).
Leftover-copy grep over `apps/hospitality/src`(non-test):`couldn't refresh`→ 0 hits;`Sign in again`→ 1 hit,`LoginGate.tsx:19` `SIGNED_OUT_TAGLINE = "You're signed out. Sign in again whenever you're ready."` — the designed S4 tagline (#4722), not banner copy (see assumptions).
- Result: **PASS**

### 6. `failed` and `settled` each have a product surface

- Check: grep under `apps/` excluding tests and the showcase; unit tests asserting `data-state`.
- Evidence — grep (`state=` or `state:` forms, per architecture.md § Traceability):
  ```
  apps/hospitality/src/pages/AuthFailurePage.tsx:52:              state="failed"
  apps/rialto-web/src/pages/auth/SignUp.tsx:48:    state: "settled",
  apps/rialto-web/src/pages/auth/authFlowMachine.ts:176:  ... ? "failed" : "negotiating";
  apps/rialto-web/src/pages/auth/SignIn.tsx:53:    state: "failed",
  apps/rialto-web/src/pages/auth/SignIn.tsx:58:    state: "settled",
  ```
  (the showcase `pages/data/HandshakePage.tsx` is the only other hit). `grep -c 'state: "settled"'` / `'state: "failed"'` in `SignIn.tsx` = 1 / 1.
  Evidence — tests: `SignIn.test.tsx:291-307` `"rejects the demo reject code..."` → `getByRole("img")` `data-state="failed"`, status "The exchange didn't go through"; `:310-330` `"accepts any other complete code and fires the success toast after settling"` → `data-state="settled"`, status "Verified", toast only after the 700 ms beat (13/13 passing); AuthFailurePage tests above for `failed`. Deployed: `/hospitality/callback?code=…` showed `data-state="failed"`; `/demos/signup` showed `data-state="settled"` after submit (04:01Z, see criterion 7).
- Result: **PASS**

### 7. rialto-web demos use the instrument

- Check: `SignIn.test.tsx`, `SignUp.test.tsx`, `SessionExpired.test.tsx` assert `data-state` per phase under fake timers; production pages probed.
- Evidence — tests (`pnpm --dir apps/rialto-web test`):
  ```
  ✓ src/pages/auth/SignUp.test.tsx (14 tests) 914ms
  ✓ src/pages/auth/SignIn.test.tsx (13 tests) 1035ms
  ✓ src/pages/auth/SessionExpired.test.tsx (3 tests) 250ms
  ```
  Named cases: SignIn `"shows the sign-in exchange at rest on load, with an empty status line"`, `"negotiates while credentials are submitting, before the network delay elapses"`, `"negotiates while a code is verifying..."`, the rejected/settled cases quoted under criterion 6; SignUp `"rests idle with an empty status line on load"`, `"negotiates with disabled inputs while the account is being created"`, `"settles with 'Account created' once the exchange completes"`, two `"leaves the Handshake idle when ... blocks submission"`; SessionExpired `"shows the Handshake idle beside the warning StatusLED"`, `"routes back to the sign-in demo from the primary action"`.
  Evidence — deployed (04:00Z–05:04Z):
  ```
  /rialto/demos/login    idle:    { label: "Sign-in exchange at rest", state: "idle", stations: ["Browser","Identity"] }, status ""
  /rialto/demos/signup   idle:    { label: "Sign-up exchange at rest", state: "idle" }, status ""
                         after "Create account": { label: "Account created", state: "settled", lane: "0" }, status "Account created"
  /rialto/demos/session-expired: { label: "Session with Identity has lapsed", state: "idle" };
                         StatusLED <span role="img" aria-label="Session expired" class="_led… _lg… _warning… _pulse…">;
                         heading "Your session ended"; body "Sign back in to pick up where you left off."; hasPreservedClaim: false; buttons ["Sign back in"]
  ```
  The login demo's rejected/verified phases could not be reached on production (PinInput renders no cells — surfaced); they are covered by the unit tests above.
- Result: **PASS** (deployed coverage partial — see Not verified)

### 8. The walkthrough no longer hand-rolls motion

- Check: grep the CSS; page and machine tests; production page driven through idle → Next → error toggle.
- Evidence — greps: `grep -ciE 'pulse|groove|@keyframes|animation' AuthFlowPage.module.css` → exit 1 (no match); `grep -cE '\.(pulse|groove|lane|laneIdp|laneApi|laneLabel)\b'` → 0; `grep -c framer-motion AuthFlowPage.tsx` → 0. Remaining rules are layout only (`.page .header .panel .stations .station .stationName .handshake .readoutRow .caption .controls .errorToggle` + one media query).
  Evidence — tests: `✓ src/pages/auth/AuthFlowPage.test.tsx (7 tests)` — `"renders all three stations"`, `"shows an idle handshake on the first step, negotiating lane 0 after one Next"`, `"starts at the first step and advances on Next"`, `"play/pause toggles the control label"`, `"the error toggle replays the callback as a rejected state with a danger LED"`, `"reset returns to the first step"`, `"pauses when the document becomes hidden"`; `✓ src/pages/auth/authFlowMachine.test.ts (29 tests)` including the `handshakeFor` table (`it.each(ALL_STEPS)("projects step $id per the contract")` over all eight steps, `authFlowMachine.test.ts:177-197`).
  Evidence — deployed (`/rialto/demos/auth-flow`): load → `{ state: "idle", stepId: "authorize", stations: ["Identity:off","Browser:off","API:off"] }`, legend `["Identity station","Browser station","API station"]`, `stylesheetsHaveGroovePulse: false`; Next → `{ state: "negotiating", lane: "0", stepId: "redirect", stations: ["Identity:accent","Browser:accent","API:neutral"] }`; "Simulate tampered state" on → `{ switchChecked: "true", state: "failed", lane: "0", stepId: "state-mismatch", stations: ["Identity:danger","Browser:danger","API:neutral"] }`.
- Result: **PASS**

### 9. E2E contract intact

- Check: source greps for the three selectors; `LoginGate.test.tsx` contract cases; diff-stat on both E2E files across the run; the spec's CI runs.
- Evidence — source: `apps/hospitality/src/components/LoginGate.tsx:49` `data-testid="login-prompt"`; `:90` `Sign In` (Button text, resting name); `apps/hospitality/src/App.tsx:125` `data-testid="auth-layout"`.
  Evidence — tests (`LoginGate.test.tsx`, passing): `"keeps the login-prompt E2E testid contract"`, `"renders a button with the exact accessible name 'Sign In'"`, `"keeps the login-prompt testid and the Sign In button contract"` (signedOut branch).
  Evidence — files:
  ```
  $ git log --oneline -3 -- apps/hospitality/e2e/auth.spec.ts apps/hospitality/e2e/auth.setup.ts
  925a6c35d fix(hospitality-e2e): give the unauthenticated auth.spec.ts test a truly logged-out context (#2850)
  fc753d193 fix(e2e): add pre-flight auth validation and retry with backoff (closes #1763) (#1788)
  ece94b01f fix(e2e): save storageState in auth setup, share across tests (#1761)
  $ git diff --stat 1d6189203..500affc76 -- apps/hospitality/e2e/auth.spec.ts apps/hospitality/e2e/auth.setup.ts
  (empty)
  ```
  Evidence — spec run in CI (`E2E Screenshots`, `pnpm --dir apps/hospitality test:e2e` with the `E2E_AUTH0_*` secrets, `Verify E2E secrets` step success): run 33358153810 on `3986a98e4` and run 33358630405 on `500affc76`, both `completed success`; job logs:
  ```
  Running 71 tests using 1 worker
    71 passed (2.7m)        # 3986a98e4
  Running 71 tests using 1 worker
    71 passed (2.6m)        # 500affc76
  ```
- Result: **PASS**

### 10. Visual job green

- Check: CI job conclusions on every rialto-web PR and main push in the run; diff-stat on baselines.
- Evidence — `gh run list --workflow=rialto-web-e2e.yml`: `completed success` for PR heads `8149ace40` (#4734), `6d66cec19` (#4747), `aded9e461` (#4749), `cac7c6ffd` (#4750) and for main `e97d1db03`, `ad18c502d`, `5c102dfc3`, `8d0579abe`; PR rollups show `Visual Regression (rialto-web):SUCCESS` on #4734/#4747/#4749/#4750 and `Visual Tolerance Change Check:SUCCESS` on all eleven PRs.
  ```
  $ git diff --stat 1d6189203..500affc76 -- apps/rialto-web/e2e
  (empty)   # zero baseline churn, as the PRD predicted
  ```
- Result: **PASS**

### 11. Accessible and motion-safe

- Check: every new `Handshake` carries a required label; live-region sentence differs from the label on every surface; reduced-motion parks the pulse; a11y matrix green.
- Evidence — label/status pairs read from source:
  | Surface                                                                   | `aria-label`                                                                                                                                               | `role="status"` text                                                                              | distinct?                                             |
  | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
  | `AuthFailurePage` failed                                                  | "Your sign-in could not be verified"                                                                                                                       | "The exchange didn't go through"                                                                  | yes (test `:111-115` asserts)                         |
  | `AuthFailurePage` retrying                                                | "Connecting your browser to Identity"                                                                                                                      | "Starting a fresh sign-in"                                                                        | yes                                                   |
  | `SignOutPage`                                                             | "Ending your session with Identity"                                                                                                                        | "Signing you out"                                                                                 | yes (`SignOutPage.test.tsx:35-41` asserts `not.toBe`) |
  | `SignIn` submitting / verifying / rejected / verified                     | "Sending your credentials to Identity" / "Checking your code with Identity" / "Identity rejected the code" / "Signed in — your browser and Identity agree" | "Sending your credentials" / "Checking your code" / "The exchange didn't go through" / "Verified" | yes ×4                                                |
  | `SignUp` submitting                                                       | "Creating your account with Identity"                                                                                                                      | "Creating your account"                                                                           | yes                                                   |
  | **`SignUp` created**                                                      | **"Account created"**                                                                                                                                      | **"Account created"**                                                                             | **NO**                                                |
  | `SessionExpired` demo                                                     | "Session with Identity has lapsed"                                                                                                                         | (no status line; LED label "Session expired")                                                     | n/a                                                   |
  | `AuthFlowPage`                                                            | "Authorization-code exchange between Identity, Browser, and API"                                                                                           | caption (`aria-live`) per step                                                                    | yes                                                   |
  | Source of the failure, `apps/rialto-web/src/pages/auth/SignUp.tsx:46-50`: |
  ```ts
  created: {
    state: "settled",
    status: "Account created",
    ariaLabel: "Account created",
  },
  ```
  Reproduced on production (`/rialto/demos/signup` after submit, 05:01Z): `{ "handshake": { "label": "Account created", "state": "settled" }, "statusText": "Account created" }`. `SignUp.test.tsx:278-282` pins the identical pair (`getByRole("img", { name: "Account created" })` and `getByRole("status")` `toHaveTextContent("Account created")`), so the suite is green while the criterion is violated.
  Evidence — motion: `Handshake.module.css:155-167` `.reduced .pulse { animation: none; … }` and `@media (prefers-reduced-motion: reduce) { .pulse { animation: none; … } }`; `Handshake.test.tsx:115` `"flags the reduced-motion branch"` and `Handshake.motion.test.tsx` (16/16 passing); the run added no motion CSS (criterion 8). Every `Handshake` in the run passes `aria-label` (the prop is required by `HandshakeProps`, so typecheck — 48/48 — enforces it). a11y matrix: `✓ src/test/accessibility/a11y-matrix.test.tsx (88 tests)` with the `Handshake` fixture at `component-fixtures.tsx:495`.
- Result: **FAIL** — one surface (`/demos/signup` `created`) repeats the sentence.

### 12. Gates and docs

- Check: local gates; `regen --check`; changeset rule; the two CLAUDE.md paragraphs; CI.
- Evidence — local gates: the block in Summary (auth 165/165, hospitality 1698/1698, rialto-web 698/698, Handshake 16/16, a11y 88/88, both lints 0 errors, typecheck 48/48, `All generated artifacts are up to date.`).
  Evidence — changeset rule: `git log --oneline 1d6189203..500affc76 -- packages/rialto/src` → only `ce6aab04a … (#4732)` (out-of-run WatchLoader fix, with its own `.changeset/watch-loader-movement.md`); none of the run's eleven PRs touched `packages/rialto/src` and none added a changeset — consistent with "iff".
  Evidence — docs: `apps/hospitality/CLAUDE.md:9` reads `Gate order in App.tsx: isLoading (→ SignOutPage when activeNavigator === "signoutRedirect", else CallbackPage on /callback, else LoadingPage) → error (→ AuthFailurePage) → callback-in-progress (→ CallbackPage when hasAuthParams(window.location), else LoginGate signedOut — a sign-out round-trip landed back on /callback with no OIDC params) → sessionExpired (→ SessionExpiredGate) → LoginGate → dashboard …` — matches `App.tsx:77-121` branch for branch. `packages/auth/CLAUDE.md:49` adds the `hasAuthParams(location?)` row and `:59` the callback-path `returnTo` sentence; `packages/auth/src/react/index.ts` ends with `export { hasAuthParams } from "react-oidc-context";`.
  Evidence — CI: PR-level `CI Gate=SUCCESS` on #4736 #4737 #4733 #4748 #4755 #4765 #4747 #4734 #4750 #4749 #4735; #4765's run 33357754704 jobs `CI Gate, Integrity, Test (Node 22), Typecheck, Lint, Build, Architecture Audit` all `success`. Main-push CI on `500affc76` (run 33358630401) `completed success` at 2026-08-31T05:15:17Z — `CI Gate, Integrity, Test (Node 22), Build, Typecheck, Lint, Architecture Audit, Dependency Sync, AI Antipattern Ratchet, Validate Migrations` all `success` (only the path-gated `Migration Dry-Run`, `Visual Tolerance Change Check`, `Accessibility AI Attribution` skipped).
- Result: **PASS**

## Breakdown-only acceptance criteria

All ten items are checked in `breakdown.md`; the acceptance lines not already covered above:

| Item                   | Acceptance line                                                                                                                     | Evidence                                                                                                                                                            | Result                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| #4721 `deriveReturnTo` | callback path → `"/"` ignoring search/hash; `hooks.test.tsx` bare `signIn()` on `/hospitality/callback?code=…`                      | `return-to.test.ts:99-118` three cases + `hooks.test.tsx:166-180` (`{ state: { returnTo: "/" } }`), 165/165                                                         | PASS                                                                             |
| #4721 `hasAuthParams`  | is react-oidc-context's own function                                                                                                | `packages/auth/src/react/index.ts` re-export; `App.tsx:5` imports from `@mbe/auth/react`                                                                            | PASS                                                                             |
| #4722 LoginGate        | signed-out tagline swaps, default unchanged, contract kept                                                                          | `LoginGate.test.tsx:135-150` three cases                                                                                                                            | PASS                                                                             |
| #4723 retrying variant | negotiating / lane 0 / "Connecting your browser to Identity" / "Starting a fresh sign-in" / busy "Heading to sign-in"               | `AuthFailurePage.tsx:41-48,62,79-80`; test `:124` `"switches to a negotiating variant while a retry is in flight"`                                                  | PASS                                                                             |
| #4724 SignOutPage      | img "Ending your session with Identity", negotiating, lane 0, "Browser Identity", status "Signing you out", `sign-out-page`         | `SignOutPage.test.tsx:27-41` (2/2)                                                                                                                                  | PASS                                                                             |
| #4728 App              | `grep "Try Again"` empty; `.errorDetails` gone from `App.module.css`; `signoutRedirect` → `sign-out-page`                           | greps exit 1 / exit 1; `App.test.tsx:195-205`                                                                                                                       | PASS                                                                             |
| #4726 auth-flow        | `handshakeFor` table; `HANDSHAKE_STATIONS` hub order; no `.png` diff                                                                | `authFlowMachine.test.ts:177-197`; `git diff --stat … -- apps/rialto-web/e2e` empty                                                                                 | PASS                                                                             |
| #4727 login demo       | `.instrumentSlot`, `.statusLine` in `AuthLayout.module.css`                                                                         | `grep -oE '^\.(instrumentSlot                                                                                                                                       | statusLine                                                                       | lapse)\b'`→`.instrumentSlot .statusLine .lapse` | PASS |
| #4729 signup demo      | `AuthLayout.module.css` unchanged in the PR                                                                                         | `git show --stat 8d0579abe -- …/AuthLayout.module.css` → empty                                                                                                      | PASS (the item's "settled 'Account created'" line is what criterion 11 fails on) |
| #4730 session-expired  | `grep -c 'sessionExpired\|sessionCopy' SessionExpired.tsx` = 0; body exact; "this page is preserved" absent; button → sign-in route | grep → 0; deployed body "Sign back in to pick up where you left off.", `hasPreservedClaim: false`; test `"routes back to the sign-in demo from the primary action"` | PASS                                                                             |

## Failures

1. **Criterion 11 — `/demos/signup` `created` phase: image label and live-region sentence are identical ("Account created").** _RESOLVED by #4770 → PR #4772 (`14af05e3c`); see § Re-verification._ File: `apps/rialto-web/src/pages/auth/SignUp.tsx:46-50` (`SIGN_UP_PHASES.created.ariaLabel`). Reproduced on production. The worker matched issue #4729's contract, which copied ux.md D2; prd.md criterion 11 and architecture.md § Demo phase tables ("always two different sentences") are the governing rule. **Routes to Implement**: give `created.ariaLabel` a distinct sentence (breakdown suggests "Account created — your browser and Identity agree", mirroring SignIn's `verified`), update `SignUp.test.tsx:278` to the new label and add a `not.toBe` assertion like `SignOutPage.test.tsx:39`, and patch the ux.md D2 aria-label line. Everything else in this run is unaffected by the fix.

## Re-verification (2026-08-31, `main` @ `14af05e3c`)

The single FAIL above routed to Implement as issue **#4770** → PR **#4772** (`fix/auth-handshake-signup-created-label`, review gate pass 10/10, CI Gate green, squash-merged 2026-08-31T05:46:15Z as `14af05e3c`). Re-run of the one affected surface, from the merged tree — real output, not the worker's report:

```
$ git rev-parse --short HEAD
14af05e3c
$ grep -n 'ariaLabel: "Account created' apps/rialto-web/src/pages/auth/SignUp.tsx
50:    ariaLabel: "Account created — your browser and Identity agree",
$ pnpm --dir apps/rialto-web test -- SignUp
 ✓ src/pages/auth/SignUp.test.tsx (16 tests) 343ms
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

- **Criterion 11 → PASS.** `SIGN_UP_PHASES.created` is now `status: "Account created"` / `ariaLabel: "Account created — your browser and Identity agree"`; `SignUp.test.tsx` gained a `describe.each` over the exported table asserting `ariaLabel !== status` for every phase with a non-empty status (`submitting`, `created`; `idle` excluded), and the settled-phase test asserts `status.textContent` is `not.toBe(label)` (mirrors `SignOutPage.test.tsx:39`). The suite grew 698 → 700 in CI on PR #4772.
- `ux.md` D2 (line 523) amended to the same label with a dated note, so the design doc and the code agree again.
- Not re-probed on production: deploy-static for `14af05e3c` runs on the merge; the label is a static string with no runtime branch, and the unit assertion above is the evidence. The Ship stage's post-deploy probe covers the deployed page.

**Result after re-verification: 12 of 12 PRD criteria PASS, 0 FAIL.** The `PinInput` production defect surfaced above is tracked separately as #4771 (PR #4775 in review at the time of writing) and remains out of this run's scope.

## Not verified

- **A real Auth0 sign-out round-trip on production** (criterion 1's "one manual sign-out on the deployed app"). Requires operator credentials and the tenant's Allowed Logout URLs (the Maintainer step in breakdown.md § Notes); neither is available here. Verified instead: the unit test and a direct load of the post-logout URL on production. Whether Auth0 returns to that URL at all is unknown.
- **Hospitality Playwright E2E locally.** `E2E_AUTH0_*` secrets are not available in this session; the CI `E2E Screenshots` runs on `3986a98e4` and `500affc76` (71/71 with secrets) stand in. The `e2e.yml` workflow (the PR-scoped `Hospitality E2E` job) last ran on main in May and did not run for these PRs' base — not used as evidence.
- **`/demos/login` rejected → `failed` and verified → `settled` on production.** Blocked by the pre-existing rialto `PinInput` empty-value bug (no cells rendered, surfaced above). Unit-tested only (`SignIn.test.tsx:291-330`, PinInput mocked).
- **Sub-second `submitting`/`verifying` phases on production** (`/demos/signup` 1500 ms, `/demos/login` 900 ms): the MCP browser's turn latency exceeded the window; the fake-timer unit tests are the evidence. The observed post-window states (login back to `idle` on the verification step, signup at `settled`) match the phase tables.
- **`packages/rialto` full suite and `apps/gen` tests locally** — outside the stage's allowed-command list; covered by the PR CI `Test (Node 22)` job (success on #4765's run 33357754704) and root `pnpm typecheck` (48/48, includes `apps/gen`).
- **Production frequency** of the signed-out callback, failed exchange, and refresh failure: still unmeasured (no Sentry/analytics event exists) — carried from prd.md/breakdown.md surfaced items; a candidate Operate backlog seed.

Next stage: **Implement** (fix the criterion 11 failure), then re-verify that one surface and proceed to Review.
