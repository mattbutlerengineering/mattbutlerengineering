---
stage: prd
run: feature:auth-handshake-flows
date: 2026-08-30
ux: required
assumptions:
  - "Slug and scale (inherited from idea.md): `auth-handshake-flows` and feature-run scale are orchestrator defaults the user never chose."
  - "Problem framing (inherited): the sufferer's-voice quote and the who/why-now answers were orchestrator-drafted, adopted and re-checked against the code on 2026-08-30."
  - "Actor vocabulary: the brief names roles but no actor list; manager and host are collapsed into one Operator actor because sign-in is identical for both, and a Maintainer actor is added for the out-of-repo Auth0 step and the merges."
  - "`settled` placement: the brief never says where the settled state appears; the orchestrator's 'at least one product surface' ruling is met on the rialto-web sign-in demo's existing verified beat rather than by adding a delay to hospitality's successful callback, which is left as an open question."
  - "Refresh-failure banner form: the brief asks for aligned copy and action, not a merged component; the banner is kept non-blocking (a failed pre-expiry refresh leaves a still-valid token) and exact wording is left to UX Design."
  - "Retry after a failed callback: the brief says 'with retry'; retry is required to start a fresh sign-in without the operator editing the URL, and whether it preserves the pre-sign-in deep link is left to Architect."
surfaced:
  - "Auth0 tenant: whether today's effective post-logout URL (https://mattbutlerengineering.com/hospitality/callback) is in Allowed Logout URLs, and the exact new value to add once Architect fixes the signed-out URL, cannot be read from the repo — a human (Maintainer) step; placeholder <POST_LOGOUT_URL> below."
  - "Production frequency of every dead end in this PRD is unmeasured: no Sentry or analytics query was run at Idea or PRD stage; n = 0 user reports. The case rests on code reading."
  - "PR #4720 (prior art) re-measured 2026-08-30: still OPEN, mergeStateStatus=BLOCKED, mergedAt=null; its commit 9d4c4699e is not an ancestor of origin/main. This PRD, like idea.md, was written on that branch (972838439). Implement must branch after it lands."
  - "/demos/auth-flow: the brief wants the hand-rolled groove/pulse gone, but the walkthrough's directional, payload-carrying, two-channel steps cannot be expressed by Handshake's single-lane four-state model; whether Handshake grows an API or the walkthrough simplifies has no default (Open questions, Q1)."
  - "Whether `Hospitality E2E` will be runnable (Auth0 env vars, tenant health) on the day Verify runs is not knowable now; the brief itself flags the job as advisory and often red for environmental reasons, so unit tests must carry the gate."
---

# PRD: Auth handshake flows

Prior art: PR #4720 (`useAuth()` lifecycle model — `activeNavigator`,
`isRefreshing`, `sessionExpired`, `refreshError` — and the rialto `Handshake`
instrument, with hospitality's `LoginGate`, `CallbackPage`, and
`SessionExpiredGate` already using it). #4720 is not part of this run; this run
is the increment after it. Run artifacts are committed with this run's own
PR(s), not with #4720.

## Problem statement

An Operator's sign-in is the first thing a prospect touches and the design
system's most visible "precision in motion" moment. After #4720 the core model
is right, but four transitions still end in a spinner, a blank, or a dead end:

- **Signing out lands in a loop.** Sign-out returns to `/hospitality/callback`
  with no auth params, and the app shows the same "Verifying your sign-in /
  Exchanging your code for a session" handshake it shows during a real
  callback — indefinitely. There is no signed-out state anywhere in the app.
- **A failed sign-in never fails where the Operator was watching.** A failed
  code exchange swaps the in-flight handshake for a plain text error page.
  `Handshake` has a `failed` state that no product surface has ever rendered.
- **Two session lapses read as two systems.** A failed silent refresh shows a
  warning banner ("Your session couldn't refresh — sign in again to keep
  working" / "Sign in again"); an expired token shows `SessionExpiredGate`
  ("Your session ended" / "Sign back in to pick up where you left off — this
  page is preserved" / "Sign back in").
- **The design system's own auth demos don't use its auth instrument.** On
  rialto-web the sign-in wait is a busy button, the lapse is one pulsing LED,
  and the one page that visualises the exchange (`/demos/auth-flow`)
  hand-rolls its own groove and pulse instead of using `Handshake`.

**Evidence — measured in code, n = 0 user reports.** Nobody has reported any of
this. Everything above was re-verified by static reading on 2026-08-30 at
`972838439` (#4720's head): `packages/auth/src/react/provider.tsx:30` falls
back `post_logout_redirect_uri` to `redirectUri`; `apps/hospitality/src/
constants/auth.ts` never sets `postLogoutRedirectUri`; `App.tsx` renders
`CallbackPage` for any unauthenticated visit to a `/callback` path with no
"no params" branch; all three sign-out entry points (sidebar "Sign Out", the
command palette, the Settings page button) call a bare `signOut()`; `failed`
and `settled` appear only in the rialto-web showcase (`pages/data/
HandshakePage.tsx`) and stories. SURFACED: how often any of this occurs in
production is unmeasured — no Sentry or analytics query has been run.

## Solution

When this ships, every auth transition in hospitality and in the rialto-web
auth demos shows a deliberate, design-system-native state — no blank screen,
no dead end, no unexplained wait — and the rialto-web demos are the reference
implementation a consumer copies.

| Transition                                   | Today                                      | Required after this run                                                          |
| -------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------- |
| Hospitality: Sign In pressed (redirect out)  | `LoginGate` handshake negotiating          | unchanged (#4720)                                                                |
| Hospitality: callback in progress            | `CallbackPage` negotiating, lane 1         | unchanged (#4720)                                                                |
| Hospitality: callback failed                 | text error page                            | `Handshake` **failed** in place, category copy kept, retry only where it applies |
| Hospitality: callback succeeded              | immediate redirect                         | unchanged; a settled beat is an open question (Q3)                               |
| Hospitality: returned from sign-out, no params | `CallbackPage` forever                   | a signed-out state offering Sign In, at whatever URL Auth0 returns to            |
| Hospitality: token expired in place          | `SessionExpiredGate` idle → negotiating    | unchanged (#4720)                                                                |
| Hospitality: silent refresh failed           | warning banner, divergent copy             | still a non-blocking banner; vocabulary and action shared with the gate          |
| Hospitality: initial user restore            | `LoadingPage` (WatchLoader)                | unchanged — not an exchange                                                      |
| rialto-web `/demos/login` submitting, verifying | `Button isLoading`                      | `Handshake` negotiating                                                          |
| rialto-web `/demos/login` rejected code      | `PinInput` error only                      | plus `Handshake` **failed**                                                      |
| rialto-web `/demos/login` verified           | "Verified" row (700 ms beat)               | `Handshake` **settled** for that beat                                            |
| rialto-web `/demos/signup` submitting        | `Button isLoading`                         | `Handshake` negotiating                                                          |
| rialto-web `/demos/session-expired`          | one pulsing warning `StatusLED`            | lapsed state matching hospitality's gate (`Handshake` idle + `StatusLED`)        |
| rialto-web `/demos/auth-flow`                | hand-rolled groove/pulse, 7 directional steps | reading (a) or (b) below — undecided (Q1)                                      |

**The `/demos/auth-flow` walkthrough (two candidate readings — not decided
here).** The page renders seven protocol steps from `authFlowMachine.ts`; every
step carries a direction (inbound/outbound), a payload, and one of two
channels. `Handshake` has one active lane, four states, and no direction. The
requirement is that the hand-rolled groove/pulse CSS is gone or reduced to
layout, with either:

- **(a)** `Handshake` extended so the walkthrough can be built from it (a
  rialto public-API change with a changeset), or
- **(b)** the walkthrough simplified to what `Handshake` can express today
  (dropping per-step direction and payload from the visual, not from the
  captions or the machine's tests).

Whichever reading Architect picks, the seven steps, the tampered-state error
branch, play/pause/next/reset, and the pause-when-hidden behaviour survive.

## Actors

- **Operator** — a hospitality restaurant manager or host (the personas in
  `apps/hospitality/docs/USER-FLOWS.md`), including a first-time prospect;
  today in practice the project owner as sole operator. Signs in through
  Auth0, works a shift, signs out; sessions lapse during the day.
- **Design-system consumer** — an engineer evaluating rialto through the
  rialto-web demos (`/demos/login`, `/demos/signup`, `/demos/session-expired`,
  `/demos/auth-flow`) and copying what they see.
- **Maintainer** — the project owner as repo and tenant administrator:
  performs the out-of-repo Auth0 step and merges this run's PRs.

## User stories

1. As an Operator, I want signing out to land me on a page that says I am
   signed out and offers Sign In, so that I am never left watching "Verifying
   your sign-in" after leaving.
2. As an Operator, I want a failed sign-in to fail where I was watching the
   handshake — with the reason, and a retry where retrying can help — so that
   I know what happened and can recover without retyping the URL.
3. As an Operator, I want a failed background refresh and an expired session
   to speak with one voice and offer the same next step, so that I learn one
   recovery, not two.
4. As an Operator, I want every wait during sign-in and sign-out to show which
   parties are talking, so that no click feels dead and no screen goes blank.
5. As a Design-system consumer, I want the sign-in, sign-up, and
   session-expired demos to render submitting, verifying, settled, failed, and
   lapsed states with `Handshake` + `StatusLED`, so that I copy the reference
   pattern instead of a bespoke spinner.
6. As a Design-system consumer, I want the auth-flow walkthrough to use the
   same instrument family as the rest of Rialto, so that the design system
   does not contradict itself on its own showcase.
7. As a Maintainer, I want the exact Auth0 value I must add called out, and the
   app to behave deliberately even before I add it, so that a tenant
   misconfiguration never shows up as a perpetual verifying screen.

## Success criteria

Each criterion names its check. Unit tests carry the gate; E2E is
confirmatory when the environment allows.

- [ ] **1. Sign-out lands on a signed-out state.** With the app at the
      post-logout return URL, no OIDC params (`code`, `state`, `error`), no
      authenticated user, and auth not loading, the app renders a signed-out
      state that offers a sign-in action and never shows "Verifying your
      sign-in" / "Exchanging your code for a session"; no timer is involved.
      Check: unit test on `App` (pathname ending `/callback`, empty search,
      `isAuthenticated=false`, `isLoading=false`) asserting the signed-out
      element is present and `callback-page` is absent; plus one manual
      sign-out on the deployed app.
- [ ] **2. The real callback is untouched.** The same path while auth is
      loading, or carrying `code`+`state`, still renders `CallbackPage`
      negotiating on lane 1. Check: the existing `App.test.tsx` "session
      lifecycle" cases stay green, plus one new case for params present and
      not loading.
- [ ] **3. A failed exchange fails in place.** When `useAuth().error` is set
      on the callback path, the page renders `Handshake` with
      `data-state="failed"` (same stations as the wait) alongside
      `describeAuthError`'s title and body; the retry action is present iff
      `canRetry` (absent for access denied); "Technical details" stays
      reachable. Check: unit tests covering all four `describeAuthError`
      categories.
- [ ] **4. Retry restarts sign-in.** Activating retry starts a fresh sign-in
      attempt without the Operator editing the URL. Check: unit test asserting
      the retry action invokes sign-in; manual check that a forced failure
      plus retry reaches Auth0.
- [ ] **5. Banner and gate share one voice.** The refresh-failure banner's
      headline vocabulary and action label are the same strings as
      `SessionExpiredGate`'s (one shared source, or identical strings asserted
      by test), and the banner remains non-blocking with page content rendered
      beneath it. Check: `DashboardLayout.test.tsx` banner cases updated; a
      test asserting the two components render the same action label.
- [ ] **6. `failed` and `settled` each have a product surface.** `failed`:
      hospitality callback failure (3) and the rialto-web sign-in rejected
      code. `settled`: the rialto-web sign-in verified beat. Check: unit
      tests asserting `data-state` on each; a grep of `state="failed"` /
      `state="settled"` under `apps/` finds product files, not only the
      showcase.
- [ ] **7. rialto-web demos use the instrument.** `/demos/login` renders
      `Handshake` negotiating while submitting and while verifying, `failed` on
      a rejected code, `settled` on acceptance before the toast;
      `/demos/signup` renders negotiating while submitting;
      `/demos/session-expired` renders the lapsed state with `Handshake` idle
      plus `StatusLED`, matching hospitality's gate. Check: `SignIn.test.tsx`,
      `SignUp.test.tsx`, `SessionExpired.test.tsx` assert `data-state` per
      phase (fake timers).
- [ ] **8. The walkthrough no longer hand-rolls motion.**
      `AuthFlowPage.module.css` contains no groove/pulse motion rules (layout
      rules may remain), per reading (a) or (b); `AuthFlowPage.test.tsx` and
      `authFlowMachine.test.ts` behaviours (three stations, step advance,
      play/pause, error toggle with danger LED, reset, pause when hidden) stay
      green. Check: grep of the CSS for `.pulse` / `.groove`; tests green.
- [ ] **9. E2E contract intact.** `data-testid="login-prompt"`, a button whose
      accessible name is exactly "Sign In", and `data-testid="auth-layout"`
      are untouched; `apps/hospitality/e2e/auth.spec.ts` and `auth.setup.ts`
      have no diff. Check: `LoginGate.test.tsx` contract tests green; `git
      diff --stat` on both E2E files is empty; the spec passes when the
      environment allows.
- [ ] **10. Visual job green.** The rialto-web visual job passes. Measured
      2026-08-30: `visual.spec.ts` snapshots only `/visual-test` harness
      sections and the telemetry HUD — no auth demo and no Handshake section —
      so the expected outcome is zero baseline churn; any baseline that does
      change is regenerated from the Linux CI artifact, never from macOS.
      Check: CI job conclusion; `git diff --stat` on `e2e/**/*.png`.
- [ ] **11. Accessible and motion-safe.** Every `Handshake` carries a required
      `aria-label`; any live-region text is a separate sentence from the image
      label; reduced motion produces no travelling pulse. Check: rialto a11y
      matrix stays green; unit tests on each new surface assert the label and
      the polite status text.
- [ ] **12. Gates and docs.** Lint, typecheck, and unit tests green in
      `packages/auth`, `packages/rialto`, `apps/hospitality`, `apps/rialto-web`,
      `apps/gen`; `pnpm regen --check` clean; a `.changeset` entry exists iff
      `packages/rialto/src` changed; the `apps/hospitality/CLAUDE.md` gate-order
      paragraph describes the signed-out branch and the failed state;
      `packages/auth/CLAUDE.md` changes only if the public API moves. Check:
      `CI Gate` green; reviewer reads the paragraph against `App.tsx`.

## Constraints (already decided — not design)

- `Handshake` is the one visualisation for auth exchanges; no second one.
- Rialto tokens only (`--rialto-*`); gold accent only for focus, active, and
  in-flight; logical CSS properties; `useMotionPreset()`; no `setState`
  inside a `useEffect` body in `packages/rialto`; `role="img"` with a required
  `aria-label` on instruments; all hospitality UI through rialto components;
  `.js` import extensions in hospitality.
- `describeAuthError`'s four categories (access denied without retry; expired
  flow, network, and default with retry) are kept.
- TDD (failing test first); Zero-Touch Audit before commit; stage by explicit
  path; `pnpm typecheck` before push.
- Delivery: PRs to `main`; `CI Gate` is the sole required check; merge via
  `gh pr merge <N> --auto --squash --delete-branch` once the review gate and
  `CI Gate` are green; deploy only via CI (`deploy-static.yml`, Cloudflare
  Workers); rialto npm publish is not authorised.
- Implement branches only after #4720 has merged (SURFACED above: still open).

## Out-of-repo dependency (Maintainer)

- **Auth0 Allowed Logout URLs** must contain the URL sign-out returns to:
  `<POST_LOGOUT_URL>` — exact value fixed by Architect (Q2), e.g.
  `https://mattbutlerengineering.com/hospitality/<signed-out-path>`. Today's
  effective value is `https://mattbutlerengineering.com/hospitality/callback`;
  SURFACED: whether it is allow-listed cannot be read from the repo, and prod
  runs on a DEVELOPMENT-labelled tenant. If the URL is not allow-listed, Auth0
  shows its own error page before ever returning — outside this repo's
  control.
- **The in-repo requirement is independent of this step**: criterion 1 holds
  at whatever URL Auth0 returns to, including today's `/callback`, so the app
  never shows a perpetual verifying state even before the tenant is updated.

## Out of scope

- Auth0 tenant configuration itself (surfaced as the Maintainer step above).
- New auth providers, MFA, or a hospitality-native sign-up (Auth0 hosts it).
- Backend / Fastify auth changes; anything on the `/api/v1/holds` issue #4487.
- Changing the E2E contract selectors or the E2E spec.
- rialto npm publish; redoing any part of #4720.
- `LoadingPage` (initial user restore) — a WatchLoader, not an exchange.
- The embedded `SignInDemo` inside `apps/rialto-web/src/pages/layout/
  SplitScreenExitPage.tsx` — a layout demo, not an auth demo.
- Measuring production frequency of these dead ends (Sentry/analytics) —
  surfaced as a gap, not built here; a candidate backlog seed at Operate.

## Open questions

1. **`/demos/auth-flow`: reading (a) extend `Handshake` (direction, payload,
   multi-lane — a rialto API change with a changeset) or (b) simplify the
   walkthrough to today's single-lane model?** — Architect, with UX Design's
   view on whether per-step direction matters to a consumer.
2. **Where the signed-out state lives:** a new route (e.g. `/signed-out`) versus
   teaching `/callback` to recognise the no-params case; the two have different
   Allowed-Logout-URL consequences. — Architect, then Maintainer for the tenant.
3. **Does hospitality's successful callback show a `settled` beat before the
   redirect?** It costs latency on every sign-in. — UX Design.
4. **Form of the signed-out state:** a distinct "You're signed out"
   confirmation, or the `LoginGate` with a note? Must not break the
   `login-prompt` / "Sign In" contract at the root URL. — UX Design.
5. **Exact shared copy** for the refresh-failure banner and
   `SessionExpiredGate`. — UX Design.
6. **Does retry after a failed exchange preserve the pre-sign-in deep link
   (`returnTo`)?** Today "Try Again" reloads `/hospitality` and drops it. —
   Architect.
7. **Should the rialto-web demos name their phases with `useAuth()`'s
   vocabulary** (`signinRedirect`, `signinSilent`, `sessionExpired`) so
   consumers copy names as well as visuals? — Architect.
8. **Is an E2E case for sign-out feasible** without a live Auth0 logout
   round-trip? — Architect / Verify.

Next stage: UX Design (`ux: required`) — design the signed-out state, the
in-place failure with retry, the shared lapse voice, and the demo phases;
Q1, Q3, Q4, Q5 are its inputs.
