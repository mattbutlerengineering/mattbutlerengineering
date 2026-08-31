---
stage: architect
run: feature:auth-handshake-flows
date: 2026-08-30
assumptions:
  - "Q1 (`/demos/auth-flow`): reading (b) — the walkthrough is simplified onto today's `Handshake` with hub station order Identity — Browser — API and a pure `handshakeFor(step)` projection; `packages/rialto/src` is not touched, so no changeset, no `registry.json`/exports regeneration. The TOKENS step is projected as negotiating on lane 0 (not settled) to avoid the API-green over-claim; REJECTED lights both endpoints of the failed leg (instrument semantics) with the caption carrying blame; `direction` is not rendered. Loser (a) recorded in Decisions."
  - "The `returnTo` loop is closed at the write side only: `deriveReturnTo` in `packages/auth/src/react/return-to.ts` returns `\"/\"` when the current pathname equals the callback path derived from `redirectUri`. The read side (`extractReturnTo` → `CallbackRedirect`) keeps `isSafeReturnTo` alone, because OIDC `state` data is stored client-side keyed by state id and is not URL-injectable."
  - "Post-logout URL is the existing provider fallback (`post_logout_redirect_uri: config.postLogoutRedirectUri ?? config.redirectUri`), i.e. `https://mattbutlerengineering.com/hospitality/callback` in production. No new env var, no new route; `App` gains a no-params branch on `/callback`."
  - "The no-params predicate is react-oidc-context's own `hasAuthParams(location?)` (verified exported at 3.3.1: `dist/types/react-oidc-context.d.ts:231`), re-exported from `@mbe/auth/react` rather than re-implemented. This is a public-API addition to `@mbe/auth`, so `packages/auth/CLAUDE.md` and the llms regen are in scope."
  - "Retry after a failed exchange goes home: the pre-failure deep link is unrecoverable because oidc-client-ts removes the stored state entry before the token exchange (`processSigninResponse`, `removeState=true`). No pre-redirect store is added — it would be speculative."
  - "S7 (signing out) is in scope and keyed on `activeNavigator === \"signoutRedirect\"` inside the existing `isLoading` branch; `useAuth()` already keeps `isLoading` true for sign-out navigators, so no `@mbe/auth` change is needed for it."
  - "Hospitality gets no `settled` beat: after a successful exchange `isAuthenticated` flips and `CallbackRedirect` renders `<Navigate>` in the same render pass — there is no natural zero-cost interval. The rialto-web sign-in demo (D1) carries `settled`, per the orchestrator's ruling."
  - "`SessionExpiredGate`'s instrument is unchanged (no warning `StatusLED` added); only its copy moves to the shared constant. Criterion 7's 'matching hospitality's gate' is satisfied on the `Handshake` idle state and the shared copy; the demo's warning LED remains demo-only."
  - "`AuthLayout.module.css`: only the classes the new demo markup needs are defined (`.instrumentSlot`, `.statusLine`, `.lapse` — layout-only, tokens only). The remaining never-defined classes (`.atmosphere`, `.grain`, `.verifyPanel`, `.verifyIntro`, `.stepsIndicator`, `.backButton`, `.passkeyButton`, `.strength*`, `.checklist*`, `.termsRow`, `.termsText`, `.sessionExpired`, `.sessionCopy`) are out of criterion 8 and deferred; `docs/backlog.md` is not edited by this stage."
  - "Q7: rialto-web demos keep their own phase vocabulary (no `useAuth` names — no redirect exists in a demo). Each demo's booleans collapse into one `phase` union with a render-time lookup table; timing constants (`SIMULATED_NETWORK_MS`, `VERIFIED_SETTLE_MS`, sign-up 1500 ms) are unchanged."
  - "Shared session-lapse copy lives in `apps/hospitality/src/constants/session-lapse-copy.ts` and is consumed by `SessionExpiredGate` and the `DashboardLayout` banner; the rialto-web D3 demo uses the ux.md `LAPSE_BODY_DEMO` literal because rialto-web has no dependency on hospitality and the body sentence differs."
  - "The `DashboardLayout` refresh-failure banner keeps its structure (`Banner variant=\"warning\" dismissible` with a secondary action button, dashboard rendered beneath); only its copy changes."
  - "`authFlowMachine`'s `leds` and `direction` fields are kept as tested protocol facts even though the rewritten page no longer renders them; deleting them is a separate cleanup, not part of this run (surgical-change rule)."
  - "`AuthFailurePage` follows the house pattern of `LoginGate`/`SessionExpiredGate` and reads `signIn`/`activeNavigator` from `useAuth()` itself; only `error` and `lane` are props. Consistency with sibling gates was chosen over a fully presentational component."
  - "`useAuth()`'s return shape does not change, so `apps/gen/src/hooks/useApi.test.ts` needs no widening; `apps/gen` is still run through its gates for criterion 12."
  - "No new rialto-web pages: the auth demos are registered in `apps/rialto-web/src/routes.tsx` (lines 110–117) and `nav-sections.ts`, not in `page-registry.ts`; neither registry changes."
  - "Stale `?code=&state=` params are left in the URL on the failure screen (the provider only `replaceState`s on success). A reload re-runs the callback with a consumed code and lands on the same screen — a stable state, not a loop."
  - "The optional confirmatory sign-out E2E (a new spec, never a change to `auth.spec.ts`/`auth.setup.ts`) is not required for the run to close; unit tests carry criterion 1."
  - "ADR-003's description of the frontend auth stack (`@auth0/auth0-react`) is stale relative to `@mbe/auth`/react-oidc-context; this run does not amend it."
surfaced:
  - "Auth0 tenant configuration (Maintainer, cannot be verified from the repo): the hospitality application on tenant `dev-ytbgmz5ls3wh4xdx.us.auth0.com` must list `https://mattbutlerengineering.com/hospitality/callback` (production) and `http://localhost:3002/hospitality/callback` (dev/E2E) in Allowed Logout URLs, and the tenant's `.well-known/openid-configuration` must expose `end_session_endpoint`. Until then, sign-out clears the local session and stops on an Auth0 error page instead of returning to the app."
  - "ADR-003 (auth architecture) is stale — it names `@auth0/auth0-react` as the frontend SDK while the code uses react-oidc-context via `@mbe/auth`. Whether to amend or supersede it is a human decision outside this run."
---

# Architecture — Auth handshake flows

**State update.** PR #4720 has merged as squash `1d6189203` on `main`
(`feat(auth): model session lifecycle in useAuth and visualise it with a rialto
Handshake`). The tree is clean apart from the untracked run directory. Implement
branches from `main`; every file path below is read against that commit.

This artifact draws on `idea.md`, `prd.md` (12 success criteria, 7 stories,
8 open questions), `ux.md` (screens S1–S7, D1–D4, shared copy table, string
inventory), and the code at `1d6189203`. No interview was conducted; each
trade-off carries the recommendation taken and is logged in `assumptions:`.

## Approach

The feature is a state-routing problem, not a new subsystem. `useAuth()` already
exposes every lifecycle fact the screens need (`isLoading`, `activeNavigator`,
`error`, `sessionExpired`, `isAuthenticated`, `refreshError`), and the instrument
(`Handshake`, `StatusLED`) already exists in rialto. What is missing is (1) two
lifecycle states with no screen — *signed out on the callback path* and *sign-out
in flight* — (2) the failed state rendered in place instead of a text page,
(3) one voice for the lapse copy, and (4) the rialto-web demos and walkthrough
using the instrument they are supposed to be teaching.

Two shapes were weighed:

- **Shape 1 — route lifecycle to screens in `App.tsx`, keep `@mbe/auth` thin.**
  `App.tsx` stays the single policy point that maps `useAuth()` facts plus the URL
  to a screen. `@mbe/auth` gains exactly two things: a rule in `deriveReturnTo`
  (the loop hazard) and a re-export of `hasAuthParams` (the no-params seam).
  Everything else is hospitality- or rialto-web-local. **Chosen.**
- **Shape 2 — push the states into `@mbe/auth`** (e.g. a `useAuth().signedOut`
  flag, a `postLogoutRedirectUri` env var and a `/signed-out` route). Lost: it
  widens a shared package's public API for a concern one app has, forces the
  `apps/gen` `useAuth` mock to grow, adds a route and a second Auth0 allow-list
  entry, and still needs the `App.tsx` change. One adapter is hypothetical.

The depth of Shape 1 is in two seams: `deriveReturnTo` (one owner for "where do
we go after sign-in", now also "never back to the callback"), and the `App.tsx`
gate order (one owner for "which screen for which lifecycle state"). Every new
screen is a leaf beneath those two.

## Components

Grouped by package. "New" means a new file; otherwise the file exists at
`1d6189203`.

### `packages/auth` (`@mbe/auth`)

1. **`deriveReturnTo` callback-path rule** — `src/react/return-to.ts`. Adds one
   rule to the existing function: if `location.pathname` (search and hash
   ignored) equals the callback path derived from `redirectUri`, return `"/"`.
   Seam: `src/react/return-to.test.ts` (`describe("deriveReturnTo")`) plus one
   `hooks.test.tsx` case in the existing "defaults returnTo…" style at
   `/hospitality/callback?code=abc&state=xyz`.
2. **`hasAuthParams` re-export** — `src/react/index.ts` adds
   `export { hasAuthParams } from "react-oidc-context";`. Public-API addition:
   `packages/auth/CLAUDE.md` React API table gains a row, and
   `packages/auth/llms.txt` / `llms-full.txt` are regenerated (both are in
   `scripts/regen-manifest.mjs` `FAMILIES`). Check whether the root
   `src/index.ts` barrel re-exports `./react` and mirror it if so.

### `apps/hospitality`

3. **`App.tsx` gate order (policy)** — the router of lifecycle states to
   screens. New order (see Interfaces for the exact predicate):
   `isLoading` → (sign-out navigator ? `SignOutPage` : `/callback` ?
   `CallbackPage` : `LoadingPage`) → `error` → `AuthFailurePage` →
   `/callback && !isAuthenticated` → (`hasAuthParams(window.location)` ?
   `CallbackPage` : `LoginGate signedOut`) → `sessionExpired` →
   `SessionExpiredGate` → `!isAuthenticated` → `LoginGate` → `<Outlet/>`.
   The inline error JSX and `App.module.css .errorDetails` move into
   `AuthFailurePage`. Seam: `src/App.test.tsx` (its `vi.mock("@mbe/auth/react")`
   factory must expose the real `hasAuthParams` — use
   `async (importOriginal) => ({ ...(await importOriginal()), useAuth: mockUseAuth })`
   — and its `"Try Again"` assertions at lines 80/93 become `"Try again"`).
4. **`AuthFailurePage` (S3, new)** — `src/pages/AuthFailurePage.tsx` +
   `.module.css` + `.test.tsx`. `Handshake` `state="failed"` on the given lane
   with stations `["Browser","Identity","API"]` (same as `CallbackPage`),
   aria-label "Your sign-in could not be verified", `role="status"` line "The
   exchange didn't go through", `describeAuthError(error)` title/body, "Try
   again" iff `canRetry`, "Technical details" disclosure. Retrying variant
   (when `activeNavigator === "signinRedirect"`): instrument negotiating on
   lane 0, aria-label "Connecting your browser to Identity", status "Starting
   a fresh sign-in", button busy. Composes `LoginGate.module.css` stage
   classes like its siblings.
5. **`SignOutPage` (S7, new)** — `src/pages/SignOutPage.tsx` + `.module.css`
   + `.test.tsx`. No props. `Handshake` negotiating lane 0, stations
   `["Browser","Identity"]`, aria-label "Ending your session with Identity",
   status line "Signing you out". Rendered only while the sign-out navigator is
   in flight; the browser leaves the page when Auth0 responds.
6. **`LoginGate` `signedOut` prop (S4)** — `src/components/LoginGate.tsx`.
   `signedOut?: boolean` swaps the tagline to "You're signed out. Sign in again
   whenever you're ready." Nothing else moves: `data-testid="login-prompt"`,
   the button named exactly "Sign In", the DepartureBoard ↔ Handshake swap on
   `signinRedirect`. Seam: `LoginGate.test.tsx` (contract tests + one
   `signedOut` case).
7. **`SESSION_LAPSE_COPY` (new)** — `src/constants/session-lapse-copy.ts`
   exporting the ux.md shared copy as one frozen object (`heading`, `body`,
   `refreshFailedLead`, `action`, `actionBusy`). The one source for criterion 5.
8. **`SessionExpiredGate`** — `src/components/SessionExpiredGate.tsx`. Copy
   read from `SESSION_LAPSE_COPY`; instrument and the bare `signIn()` call
   unchanged. Seam: `SessionExpiredGate.test.tsx` (asserts the action label
   equals `SESSION_LAPSE_COPY.action`; the existing no-args `signIn` assertion
   stays).
9. **`DashboardLayout` banner** — `src/components/DashboardLayout.tsx` lines
   325–338. Text becomes `${refreshFailedLead} ${body}`, action label
   `SESSION_LAPSE_COPY.action`; `handleSignInAgain` and the dismiss logic are
   untouched. Seam: `DashboardLayout.test.tsx` lines 380–440 — the
   `/session couldn't refresh/i` and `/sign in again/i` regexes change to the
   new copy, plus one assertion against `SESSION_LAPSE_COPY.action`.
10. **`apps/hospitality/CLAUDE.md` gate-order paragraph** (line 9) — rewritten
    to the order in component 3, naming the signed-out branch, the failed
    state, and the sign-out screen.

Unchanged on purpose: `CallbackPage.tsx`, `CallbackRedirect` in `App.tsx`,
`return-to-store.ts`, `describe-auth-error.ts`, `constants/auth.ts`, `main.tsx`,
`LoadingPage.tsx`, `wrangler.toml`, `deploy-static.yml`, and both E2E files.

### `apps/rialto-web`

11. **`authFlowMachine.ts` — `handshakeFor(step)` projection + display order**
    — `src/pages/auth/authFlowMachine.ts`. Adds a pure function and the
    display constant `HANDSHAKE_STATIONS = ["Identity","Browser","API"]`
    (hub order; machine ids stay `["browser","idp","api"]`). Seam:
    `authFlowMachine.test.ts` gains a table test over `HAPPY_PATH` and
    `ERROR_STEP`; existing protocol tests untouched.
12. **`AuthFlowPage.tsx` rewrite** — replaces the hand-rolled `ChannelLane`
    (framer-motion `left` animation) with one `<Handshake size="lg">` driven by
    `handshakeFor(currentStep(state))`. Station cards stay as legends (no LEDs),
    renamed "Identity" per ux.md, reordered to hub order. Play/pause, step
    advance, error toggle, reset, and pause-when-hidden logic are unchanged.
    `AuthFlowPage.module.css` drops `.lane`, `.laneIdp`, `.laneApi`,
    `.laneLabel`, `.groove`, `.pulse`; layout rules (`.page`, `.header`,
    `.panel`, `.stations`, `.station`, `.stationName`, `.readoutRow`, `.caption`,
    `.controls`, `.errorToggle`) remain. Seam: `AuthFlowPage.test.tsx` — the
    `getByRole("group", { name: /identity provider/i })` assertion becomes
    `/identity/i`, and `getByLabelText("Browser status: danger")` becomes an
    assertion on `[data-station="Browser"][data-variant="danger"]` inside the
    `Handshake` root on the error step (real `RialtoProvider`, as today).
13. **`SignIn.tsx` (D1)** — the four booleans collapse into
    `phase: "idle" | "submitting" | "verifying" | "rejected" | "verified"`;
    a `SIGN_IN_PHASES` lookup (state, status, aria-label per ux.md D1) drives a
    fixed `Handshake` slot (`size="md"`, stations `["Browser","Identity"]`) and
    a `role="status"` line. The `verifiedRow` block is removed (the "Verified"
    status line replaces it). Timing unchanged. Seam: `SignIn.test.tsx` (fake
    timers; asserts `data-state` per phase).
14. **`SignUp.tsx` (D2)** — `phase: "idle" | "submitting" | "created"` with a
    `SIGN_UP_PHASES` lookup; same slot and status line; `created` renders
    `settled` with "Account created" before the toast. Seam: `SignUp.test.tsx`.
15. **`SessionExpired.tsx` (D3)** — `Handshake` idle (`["Browser","Identity"]`,
    `size="md"`, aria-label per ux.md) above the existing warning `StatusLED`
    (`pulse`), heading "Your session ended", body `LAPSE_BODY_DEMO`, button
    "Sign back in" → `DEMO_ROUTES.signIn`. Seam: `SessionExpired.test.tsx` —
    the `/sign in/i` click at line 73 becomes `/sign back in/i`; the
    warning/pulse assertions at lines 64–68 stay.
16. **`AuthLayout.module.css` bounded additions** — `.instrumentSlot`
    (fixed `min-block-size` so the form does not jump between phases),
    `.statusLine`, `.lapse` (D3 stack). Tokens only; no motion. Everything else
    in the never-defined list is deferred (see Decisions).

Not touched: `packages/rialto/**` (no changeset), `routes.tsx`,
`page-registry.ts`, `nav-sections.ts`, `demo-routes.ts`, `visual.spec.ts`
baselines.

## Data model

Nothing is persisted by this feature. The screens are pure functions of four
read-only sources; the table records each source, its owner, and who reads it.

| Source | Owner | Read by | Notes |
| --- | --- | --- | --- |
| Lifecycle flags: `isLoading`, `activeNavigator`, `error`, `sessionExpired`, `isAuthenticated`, `refreshError` | `useAuth()` (`packages/auth/src/react/hooks.ts`) | `App.tsx`, `AuthFailurePage`, `LoginGate`, `SessionExpiredGate`, `DashboardLayout` | Shape unchanged by this feature. |
| URL: `pathname`, OIDC params (`code`/`error` + `state` in search or hash) | the browser | `App.tsx` via `pathname.endsWith("/callback")` and `hasAuthParams(window.location)` | Synchronous; no timer (criterion 1). |
| `returnTo` | written by `deriveReturnTo` into OIDC `state`; read by `extractReturnTo` → `rememberReturnTo` module store → `CallbackRedirect` | `CallbackRedirect` | Stored client-side by oidc-client-ts keyed by state id; consumed by `processSigninResponse` before the token exchange, so it is gone after a failed exchange. |
| `SESSION_LAPSE_COPY` | `apps/hospitality/src/constants/session-lapse-copy.ts` | `SessionExpiredGate`, `DashboardLayout` | Frozen object; the single voice for criterion 5. |
| Demo phase tables (`SIGN_IN_PHASES`, `SIGN_UP_PHASES`) | each demo file | the demo's render | Render-time derivation; no `setState` in `useEffect`. |
| `FlowStep` (`channel`, `direction`, `carries`, `leds`) | `authFlowMachine.ts` | `handshakeFor(step)` reads `channel` + `carries`; captions read `id`/copy | `leds`/`direction` stay as tested protocol facts, unrendered after this change. |

Access patterns are all "read the current value on render". There are no
writes beyond the two that already exist (`returnTo` into OIDC state; the
module store on callback).

## Interfaces & contracts

### `deriveReturnTo(location: Pick<Location, "pathname" | "search" | "hash">, redirectUri: string): string`

- **Inputs:** the current location and the configured OIDC `redirectUri`.
- **Output:** the app-relative path to return to after sign-in.
- **Rule added:** when `location.pathname` equals the pathname of `redirectUri`
  (the callback path — e.g. `/hospitality/callback`), return `"/"`, ignoring
  search and hash. Otherwise the existing behaviour: strip `appBasePath`, fall
  back to `"/"`, gate through `isSafeReturnTo`.
- **Failure modes:** none new — the function is total. The only way to
  round-trip to `/callback` remains an explicit `signIn({ returnTo })` from a
  caller, which no caller does (the banner passes dashboard paths).
- **Why here:** this is the one function every bare `signIn()` goes through
  (`hooks.ts` `signIn`), so the signed-out gate, the failure screen, and
  `SessionExpiredGate` all inherit the rule without knowing it exists.

### `hasAuthParams(location?: Location): boolean` (re-export)

- **Input:** a `Location` (defaults to `window.location`).
- **Output:** `true` iff `(code || error) && state` is present in the search
  string or, failing that, in the hash. Exactly the predicate react-oidc-context
  uses on mount to decide whether to run `signinCallback`, so `App` and the
  provider can never disagree about whether a callback is in progress.
- **Failure modes:** none; pure.

### `App.tsx` gate order (policy)

```
if (isLoading)
  activeNavigator === "signoutRedirect" ? <SignOutPage/>
  : isCallback ? <CallbackPage/>
  : <LoadingPage/>
else if (error)            <AuthFailurePage error={error} lane={isCallback ? 1 : 0}/>
else if (isCallback && !isAuthenticated)
  hasAuthParams(window.location) ? <CallbackPage/> : <LoginGate signedOut/>
else if (sessionExpired)   <SessionExpiredGate/>
else if (!isAuthenticated) <LoginGate/>
else                       <div data-testid="auth-layout"><Outlet/></div>
```

`isCallback` is the existing `window.location.pathname.endsWith("/callback")`.
Ordering invariants: `error` outranks the callback branch (a failed exchange on
`/callback` renders S3, never a signed-out gate); the sign-out check sits inside
`isLoading` because `useAuth()` deliberately keeps `isLoading` true for sign-out
navigators (documented in `packages/auth/CLAUDE.md`).

### `AuthFailurePage` — `{ error: Error; lane: 0 | 1 }`

- Reads `signIn` and `activeNavigator` from `useAuth()`.
- Renders `Handshake` `state="failed"` on `lane` (idle/negotiating variants are
  not used here); `describeAuthError(error)` supplies `title`, `body`,
  `canRetry`. "Try again" is rendered iff `canRetry` and calls bare `signIn()`.
- Retrying: because react-oidc-context's `NAVIGATOR_INIT` leaves `error` in
  place, the page stays mounted with `activeNavigator === "signinRedirect"` and
  switches to the retrying variant until the browser leaves.
- **Failure modes:** if `signinRedirect` itself fails (metadata fetch, network),
  the provider dispatches a new `error` with `source: "signinRedirect"` and
  clears `activeNavigator`; the page re-renders with the network category and
  a live retry — no dead end. Access denied (`canRetry: false`) shows no retry;
  the Operator's way out is the browser (navigate to `/hospitality`, which
  renders `LoginGate`).

### `SignOutPage` — no props

Presentational. Contract with `App`: rendered only while
`activeNavigator === "signoutRedirect"`. **Failure mode:** if Auth0 rejects the
`post_logout_redirect_uri` (not allow-listed), the browser is already on Auth0's
error page — the local session was removed by oidc-client-ts `_signoutStart`
before navigation, so a later manual visit to `/hospitality` renders the normal
`LoginGate`. Deliberate in both outcomes (story 7).

### `LoginGate` — `{ signedOut?: boolean }`

Only the tagline changes. E2E contract (`login-prompt`, "Sign In",
`auth-layout`) is unchanged and asserted by `LoginGate.test.tsx`.

### `SESSION_LAPSE_COPY`

```ts
export const SESSION_LAPSE_COPY = Object.freeze({
  heading: "Your session ended",
  body: "Sign back in to pick up where you left off — this page is preserved.",
  refreshFailedLead: "Your session couldn't renew and will end soon.",
  action: "Sign back in",
  actionBusy: "Heading to sign-in",
});
```

Exact strings are ux.md's shared copy table; Implement copies from there, not
from here, if the two ever differ.

### `handshakeFor(step: FlowStep): { state: HandshakeProps["state"]; lane: 0 | 1 }`

- `channel === null` → `{ state: "idle", lane: 0 }` (the `authorize` step).
- `channel === "browser-idp"` → `lane: 0`; `"browser-api"` → `lane: 1`
  (hub order Identity — Browser — API makes lane index equal channel).
- `carries === "tampered-callback"` → `state: "failed"`, else `"negotiating"`.
- Pure and total; table-tested against every `HAPPY_PATH` step and
  `ERROR_STEP`.

### Demo phase tables

`SIGN_IN_PHASES: Record<SignInPhase, { state; status; ariaLabel }>` and
`SIGN_UP_PHASES` likewise. `status` is the `role="status"` sentence (may be
empty for `idle`), `ariaLabel` the `Handshake` image label — always two
different sentences (criterion 11). Strings come from ux.md D1/D2.

### External round trips (Auth0)

- **Sign-out:** `signOut()` → oidc-client-ts removes the user, builds
  `end_session_endpoint?id_token_hint=…&post_logout_redirect_uri=<redirectUri>`,
  navigates. Auth0 either returns to the URI (app mounts on `/callback` with no
  params → signed-out gate) or renders its own error page (allow-list miss).
  There is no timeout to design: the app is unmounted either way.
- **Exchange:** `signinCallback` on mount → token endpoint. Failure categories
  are `describeAuthError`'s four; retry is safe because each attempt is a fresh
  authorization request with a fresh state entry (the consumed code is never
  resent by the app).

## Stack & dependencies

No new dependencies. In use: react-oidc-context 3.3.1 (`hasAuthParams`,
reducer semantics), oidc-client-ts 3.5.0 (`signoutRedirect`,
`post_logout_redirect_uri`, state store), rialto `Handshake`, `StatusLED`,
`Text`, `Button`, `Banner` (all existing). framer-motion is no longer imported
by `AuthFlowPage` (it remains a rialto dependency).

Repo mechanics Implement must honour:

- `packages/rialto/src` is untouched → **no** `.changeset/*.md`, no
  `registry.json`/exports regeneration, `rialto-prop-drift-detector` not in play.
- `@mbe/auth` public API grows by one export → update `packages/auth/CLAUDE.md`
  (React API table + a sentence under "Lifecycle semantics" for the
  callback-path rule), then `pnpm build --filter @mbe/cli... && pnpm regen` for
  `packages/auth/llms.txt` / `llms-full.txt`; `pnpm regen --check` must be clean.
- Hospitality UI is rialto components only; imports use `.js` extensions;
  no `setState` inside `useEffect`.
- `apps/hospitality/CLAUDE.md` gate paragraph changes because `App.tsx` gate
  order changes.
- `apps/hospitality/e2e/auth.spec.ts` and `auth.setup.ts` have no diff.
- Visual job: `visual.spec.ts` snapshots `/visual-test` harness sections and
  the telemetry HUD only — no auth demo — so zero baseline churn is expected;
  `demo-nav.spec.ts` visits `/demos/login`, whose route and `DemoNav` stay.
- Gates: lint, typecheck, unit tests in `packages/auth`, `packages/rialto`,
  `apps/hospitality`, `apps/rialto-web`, `apps/gen`.

## Decisions & alternatives

1. **Q1 — walkthrough onto today's `Handshake` (reading b).** Loser (a):
   extend `Handshake` with per-station LED overrides and a `direction` prop —
   a manual mode that can contradict `state`, consumed by exactly one page,
   plus changeset, stories, a11y matrix and `registry.json` churn. A senior
   reviewer calls (b) simpler. Cost accepted: TOKENS shows negotiating (not
   both-green), REJECTED lights both ends of the failed leg, direction is not
   drawn; captions carry the narrative.
2. **Post-logout URL = existing `redirectUri` fallback (A).** Loser (B)
   `https://mattbutlerengineering.com/hospitality?signed_out=1`: touches the
   E2E root contract, Auth0's query-string matching for logout URLs is not
   verifiable from here, and the flag leaks into `returnTo`. Loser (C)
   `/hospitality/signed-out`: a new route, a second path `deriveReturnTo` must
   exclude, and a certain new tenant entry — (A) may already be allow-listed.
3. **`returnTo` loop owned by `deriveReturnTo` only.** Loser: a second guard in
   `CallbackRedirect`/`extractReturnTo` refusing `/callback` — two owners for
   one rule, and the read side is not URL-injectable, so it buys nothing.
4. **Retry goes home.** Loser: stash the deep link before `signinRedirect` so
   a retry can restore it — a new store for a state oidc-client-ts has already
   discarded; speculative.
5. **S7 in scope.** Loser: keep `LoadingPage` ("Winding things up") for
   sign-out — story 4 says every wait shows which parties are talking, and the
   state is already distinguishable (`activeNavigator`).
6. **`settled` lives in D1 only.** Loser: hold `CallbackRedirect` for a
   700 ms settled beat — adds latency to every real sign-in for decoration.
7. **Q7 — demos keep their own phase names.** Loser: mirror `useAuth`
   vocabulary in demos with no redirect; it would teach names that do not
   apply.
8. **`AuthLayout.module.css` bounded to new markup.** Loser: define all ~16
   never-defined classes — no design source exists (ux.md explicitly did not
   design them), so it would be invention; deferred for Operate to seed.
9. **`hasAuthParams` re-exported, not re-implemented.** Loser: a home-grown
   `hasSigninCallbackParams` — would drift from the provider's own mount
   decision, the one thing it must agree with.
10. **`AuthFailurePage` reads `useAuth()` itself.** Loser: fully presentational
    props (`retrying`, `onRetry`) — cleaner in isolation, inconsistent with
    `LoginGate`/`SessionExpiredGate` and their test mocks.
11. **Shared copy as a hospitality constant, not a rialto export.** Loser: put
    the strings in rialto — product copy in a design-system package for one
    consumer.

## ADRs

None recommended. No decision here is hard to reverse (every change is a leaf
under two existing seams), and the surprising one — sign-out returning to the
callback path — is a configuration fact, not a structural commitment.
Recorded as surfaced: ADR-003 is stale about the frontend SDK; amending it is a
human call outside this run.

## Traceability

Checked: every PRD success criterion and user story maps to at least one
component above.

| PRD item | Component(s) |
| --- | --- |
| Criterion 1 — sign-out lands on a signed-out state | 3 (`App` no-params branch), 2 (`hasAuthParams`), 6 (`LoginGate signedOut`) |
| Criterion 2 — real callback untouched | 3 (order keeps `CallbackPage` on loading and on params present) |
| Criterion 3 — failed exchange fails in place | 4 (`AuthFailurePage`), 3 (`error` gate, lane) |
| Criterion 4 — retry restarts sign-in | 4 (bare `signIn()`), 1 (`deriveReturnTo` rule keeps it off `/callback`) |
| Criterion 5 — banner and gate share one voice | 7 (`SESSION_LAPSE_COPY`), 8, 9 |
| Criterion 6 — `failed` and `settled` have product surfaces | 4 (`state="failed"`), 13 (D1 `rejected` → failed, `verified` → settled). Note: D1's table is `state: "settled"` (object literal), so criterion 6's grep should accept `state[=:] ?"settled"` |
| Criterion 7 — demos use the instrument | 13, 14, 15, 16 |
| Criterion 8 — walkthrough no longer hand-rolls motion | 11, 12 |
| Criterion 9 — E2E contract intact | 6 (contract preserved), "unchanged on purpose" list |
| Criterion 10 — visual job green | Stack & dependencies (no snapshotted surface changes) |
| Criterion 11 — accessible and motion-safe | 4, 5, 13, 14, 15 (required aria-labels; separate `role="status"` sentence; `Handshake` reduced-motion parking) |
| Criterion 12 — gates and docs | 2 (`packages/auth/CLAUDE.md` + llms regen), 10 (`apps/hospitality/CLAUDE.md`), Stack & dependencies (no changeset) |
| Story 1 — signing out lands on a signed-out page | 3, 6 |
| Story 2 — failed sign-in fails where I was watching | 4 |
| Story 3 — refresh failure and expiry speak with one voice | 7, 8, 9 |
| Story 4 — every wait shows which parties are talking | 5 (`SignOutPage`), 4 (retrying variant), existing `CallbackPage`/`LoginGate` |
| Story 5 — demos render all states with the instrument | 13, 14, 15 |
| Story 6 — walkthrough uses the same instrument family | 11, 12 |
| Story 7 — exact Auth0 value called out; deliberate before it is added | Surfaced item 1; 3 and 5 (deliberate behaviour either way) |

Open questions from the PRD resolved here: Q1 (Decision 1), post-logout URL
(Decision 2), returnTo loop (Decision 3), Q6 retry target (Decision 4), Q7
(Decision 7), Q8 sign-out E2E (assumption: optional new spec, never a change to
the existing files), AuthLayout classes (Decision 8), gate LED parity
(assumption: unchanged).

## Surfaced

SURFACED: Auth0 tenant configuration — the hospitality application on tenant
`dev-ytbgmz5ls3wh4xdx.us.auth0.com` (DEVELOPMENT-labelled, serving production)
must list `https://mattbutlerengineering.com/hospitality/callback` and
`http://localhost:3002/hospitality/callback` in Allowed Logout URLs, and the
tenant's `.well-known/openid-configuration` must expose `end_session_endpoint`.
Neither is verifiable from the repo. Until it is done, sign-out clears the local
session and stops on an Auth0 error page; the in-repo behaviour is correct
either way.

SURFACED: ADR-003 (auth architecture) names `@auth0/auth0-react` as the frontend
SDK; the code uses react-oidc-context via `@mbe/auth`. Amend or supersede is a
human decision outside this run.
