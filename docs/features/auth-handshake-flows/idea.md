---
stage: idea
run: feature:auth-handshake-flows
date: 2026-08-30
assumptions:
  - "Slug: the user never chose one; `auth-handshake-flows` is the orchestrator's default, adopted as the run ref."
  - "Run scale: the user did not state product vs feature; the orchestrator's default of a feature run (artifacts under docs/features/) is adopted."
  - "Problem statement: the sufferer's-voice quote was orchestrator-drafted, not user-quoted; adopted and sharpened against the code."
  - "Who has it / coping: the operator-and-consumer answer (project owner as sole operator today; reload, retype, ignore) was orchestrator-drafted; adopted."
  - "Why now: the 'align while #4720's model is fresh, before first customers see sign-in' rationale was an orchestrator draft; adopted."
  - "Solution hunch: orchestrator-drafted; adopted as a hunch only, not a design."
  - "Success sentence: an orchestrator draft; adopted in substance."
  - "Unknowns: the brief's four risks were orchestrator-drafted; adopted and extended with what the repo read added."
surfaced:
  - "Auth0 tenant: whether today's effective post-logout URL (/hospitality/callback) is in Allowed Logout URLs, and the fact that any new signed-out URL must be added there, cannot be verified from the repo — a human step outside the codebase."
  - "Production frequency of the dead ends (post-logout callback loop, callback failures, refresh-failure banner) is unmeasured: no Sentry or analytics query was run at this stage and there are zero user reports."
  - "PR #4720, the prior art this run builds on, was OPEN and BLOCKED with checks pending at the time of this read; its merge is a precondition the run cannot satisfy on its own, and this idea.md was written in a working tree checked out on that PR's branch."
  - "rialto-web /demos/auth-flow: the brief wants its hand-rolled groove/pulse gone, but Handshake has no direction or payload concept and that demo's steps are directional; whether Handshake grows an API or the demo drops per-step direction has no default at this stage."
---

# Idea: Auth handshake flows

Origin: a fresh feature run — no backlog seed claimed. Prior art: PR #4720
(`feat(auth): model session lifecycle in useAuth and visualise it with a
rialto Handshake`), which introduced the `useAuth()` lifecycle model
(`activeNavigator`, `isRefreshing`, `sessionExpired`, `refreshError`) and the
rialto `Handshake` instrument. #4720 is not part of this run; this run is the
increment after it.

## Problem

In the sufferer's words (orchestrator-drafted, see assumptions):

> I click Sign In and for a second nothing happens. I come back after lunch
> and either the page is blank or the first thing I get is a 401. When I sign
> out I land on a page that says it is verifying my sign-in, forever. On the
> design-system site the auth demo spins a generic spinner that looks nothing
> like the rest of Rialto.

Sharpened against the code: the first two sentences describe the state before
#4720 and are addressed on that branch (Sign In now goes busy with a Handshake
in flight, a silent refresh no longer unmounts the dashboard, and an expired
token gets a deliberate "your session ended" gate). What is still true after
#4720:

- **Signing out lands in a loop.** Sign-out returns to
  `/hospitality/callback` with no auth params, and the app renders the same
  "Verifying your sign-in / Exchanging your code for a session" Handshake it
  shows during a real callback — indefinitely. There is no signed-out state.
- **A failed sign-in never visibly fails where the user was watching.** A
  failed code exchange swaps the Handshake for a text error page with a
  "Try Again" button. `Handshake` has a `failed` state; hospitality never
  renders it.
- **Two session lapses read as two different systems.** A failed silent
  refresh shows a warning banner ("Your session couldn't refresh — sign in
  again to keep working", button "Sign in again"); an expired token shows
  `SessionExpiredGate` ("Your session ended", "Sign back in to pick up where
  you left off — this page is preserved", button "Sign back in").
- **The design system's own auth demos do not use the design system's auth
  instrument.** On rialto-web, the sign-in wait is a busy button, the session
  lapse is a single pulsing LED, and the one page that does visualise the
  exchange (`/demos/auth-flow`) hand-rolls its own groove and pulse rather
  than using `Handshake`.

## Who has it

- **Hospitality operators** — the restaurant manager and host personas in
  `apps/hospitality/CLAUDE.md`. In practice today that is the project owner
  acting as sole operator; the first external prospects will meet the sign-in
  screen first. Coping today: reload the page after sign-out, retype the URL.
- **Design-system consumers** evaluating rialto through the rialto-web auth
  demos. Coping today: ignore the demo, or copy a pattern that is not the
  reference one.

## Why now

#4720 just landed the lifecycle model and the `Handshake` instrument, so the
remaining surfaces are cheapest to align while that model is fresh and its
author context is in the tree. The first-customers plan
(factory-as-a-service funnel) makes sign-in the first thing a prospect
touches, and it is the design system's most visible "precision in motion"
moment; a spinner, a blank, or a dead end there undercuts the whole pitch.

## Evidence

**Label: measured in code, n = 0 user reports.** Nobody has reported any of
this. Everything below was found by reading react-oidc-context 3.3.1 /
oidc-client-ts 3.5.0 internals and this repo's code, not by observing users.

Measured during #4720 and fixed there: (1) silent refresh set `isLoading` and
unmounted the dashboard; (2) `refreshError` could never fire because wrapped
navigators do not reject; (3) no `accessTokenExpired` handling; (4) no
in-flight feedback on Sign In; (6) sign-out briefly unmasked the login gate
(fixed in #4720's follow-up commit). Measured during #4720's review and still
open: (5) the post-logout `/callback` dead end.

Re-verified for this brief by reading the repo on 2026-08-30 (branch
`feat/auth-lifecycle-handshake` at `972838439`, i.e. #4720's head). This is
static reading, not a runtime reproduction:

- **Post-logout dead end — confirmed.**
  `packages/auth/src/react/provider.tsx:30` sets
  `post_logout_redirect_uri: config.postLogoutRedirectUri ?? config.redirectUri`
  (the fallback lives in this repo's provider, not in oidc-client-ts);
  `apps/hospitality/src/constants/auth.ts` never sets `postLogoutRedirectUri`,
  so sign-out returns to `redirectUri` (`…/hospitality/callback`);
  `apps/hospitality/src/App.tsx:112` renders `CallbackPage` whenever the path
  ends in `/callback` and the user is unauthenticated, with no "no params"
  branch. `useAuth().signOut` is a bare `auth.signoutRedirect()`.
- **Callback failure — confirmed.** `App.tsx:82-110` renders a text error
  page from `describeAuthError` (categories: access denied without retry;
  expired flow, network, and default with retry) whose "Try Again" reloads
  `/hospitality`. `Handshake`'s `failed` state
  (`packages/rialto/src/components/Handshake/Handshake.tsx:14`) is not used
  by any hospitality component — `LoginGate` and `CallbackPage` use
  `negotiating`, `SessionExpiredGate` uses `negotiating`/`idle`. `settled` is
  unused as well.
- **Banner vs gate — confirmed divergent.**
  `apps/hospitality/src/components/DashboardLayout.tsx:325-338` versus
  `SessionExpiredGate.tsx:38-53`, copy as quoted above.
- **rialto-web demos — the brief overstates it; prefer the repo.** `SignIn`
  and `SignUp` do not hand-roll a spinner: they use rialto's
  `Button isLoading` / `loadingText` ("Signing in...", "Verifying...",
  "Creating account..."). `SessionExpired` uses one
  `StatusLED variant="warning" pulse`. No file under
  `apps/rialto-web/src/pages/auth/` imports `Handshake`. The hand-rolled
  groove/pulse is confined to `AuthFlowPage.module.css` (plus a `motion.div`
  in `AuthFlowPage.tsx`), which renders a seven-step protocol walkthrough
  from `authFlowMachine.ts` where every step carries a direction
  (inbound/outbound) and a payload. The accurate statement is: the exchange
  is never visualised on the demos, and the one demo that visualises it uses
  its own mechanism instead of `Handshake`.
- **E2E contract — confirmed** at `apps/hospitality/e2e/auth.spec.ts:18-20`
  and `auth.setup.ts:22-36`: `data-testid="login-prompt"`, a button named
  exactly "Sign In", `data-testid="auth-layout"`.

SURFACED: how often any of these dead ends occurs in production is
unmeasured — no Sentry or analytics query was run at this stage, and the
user-report count is zero. The case rests on code reading alone.

## Solution hunch

A hunch, not a design. Reuse `Handshake` and the `useAuth()` lifecycle on
every remaining auth surface rather than adding anything new:

- Give hospitality a real signed-out landing, and make the callback path
  recognise "no auth params" instead of waiting forever.
- Map a failed code exchange onto `Handshake state="failed"` in place, with
  a retry, keeping `describeAuthError`'s categories (including "access
  denied" as a non-retryable one).
- Bring the refresh-failure banner's copy and action into line with
  `SessionExpiredGate` so the two lapses read as one system.
- Make the rialto-web `SignIn` / `SignUp` / `SessionExpired` demos the
  reference implementation consumers copy: submitting, verifying, lapsed,
  and failed states rendered with `Handshake` + `StatusLED`.

Not this run (carried from the brief): Auth0 tenant configuration (surface
the exact value as a human step); new providers, MFA, or a hospitality-native
sign-up; backend/Fastify auth; changing the E2E contract selectors; a rialto
npm publish; anything on #4487. `Handshake` is *the* visualisation for auth
exchanges — no second one.

## Success in one sentence

Every auth transition in hospitality and in the rialto-web auth demos shows a
deliberate, design-system-native state — no blank screen, no dead end, no
unexplained wait — verified by unit tests and the Hospitality E2E auth spec,
with the E2E contract intact.

## Unknowns & risks

- **The post-logout URL is tenant configuration, not code.** A new
  hospitality signed-out URL must be added to Auth0's Allowed Logout URLs;
  prod runs on a DEVELOPMENT-labelled tenant. Stop and surface, never assume.
  SURFACED: whether today's effective post-logout URL
  (`/hospitality/callback`) is even allow-listed cannot be read from the repo,
  and the new value will need a human to add it.
- **"Verified by E2E" may not be provable on a given day.** `Hospitality
  E2E` is advisory and frequently red for auth/environment reasons; unit
  tests must carry the gate.
- **The auth-flow demo may not fit `Handshake`.** `authFlowMachine` steps
  have a direction and a payload and use two channels; `Handshake` has one
  active lane and four states with no direction. Forcing the walkthrough
  onto it could make the demo lie about the protocol. SURFACED: the brief's
  success criterion wants the groove/pulse gone, but whether `Handshake`
  grows an API (a rialto change with a changeset) or the walkthrough gives up
  per-step direction is undecided and has no default here.
- **Visual baselines.** Any rialto-web page change can flip Linux-only visual
  baselines; a red visual job on a merged PR starts a cascading red streak on
  main. Regenerate only from the Linux CI artifact, never from macOS.
- **#4720 is not merged.** SURFACED: at the time of this read it was OPEN and
  `BLOCKED` with checks pending; this run's implement stage must branch after
  it lands. This file was written in a working tree checked out on #4720's
  branch (`feat/auth-lifecycle-handshake`), so where it gets committed is a
  decision for whoever commits it.
- **`failed` and `settled` have never been rendered at hospitality size.**
  Both exist on the instrument (and in #4720's stories) but no product
  surface has shown them; how a failed exchange plus retry reads in the
  `CallbackPage` layout is unproven.
- **Where the signed-out state lives is open.** A new route versus teaching
  `/callback` to recognise the no-params case is an architect-level choice
  with different tenant-allow-list consequences; noted, not decided.

Next stage: PRD (`prd` skill, or the router). The brief already answers the
UX conditional as `ux: required`.
