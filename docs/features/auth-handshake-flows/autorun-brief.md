# Autorun brief — auth-handshake-flows

Collected 2026-08-30 in a single up-front interview (four questions answered
by the user; every other field below is the orchestrator's recommended
default and must be logged under `assumptions:` by the stage that relies on
it). This file is the brief, not an artifact: it never counts toward
orientation.

## Feature description (what / why)

**What.** The next increment on the hospitality and rialto authentication
flows, after PR #4720 (prior art — see below). Make every remaining auth
transition a deliberate, design-system-native state built on the
`Handshake` instrument and the `useAuth()` lifecycle model that #4720
introduced:

- **rialto-web auth demos** (`apps/rialto-web/src/pages/auth/` — `SignIn`,
  `SignUp`, `SessionExpired`, `AuthLayout`, `AuthFlowPage`,
  `authFlowMachine`) become the design system's _reference_ auth flow:
  submitting, verifying, session-lapsed, and failed states rendered with
  `Handshake` + `StatusLED`, not the generic spinner/pulse styles the pages
  hand-roll today (`AuthFlowPage.module.css` groove/pulse).
- **hospitality sign-out landing.** `apps/hospitality/src/constants/auth.ts`
  sets no `postLogoutRedirectUri`, so `post_logout_redirect_uri` falls back
  to `/hospitality/callback`; landing there with no auth params hits the
  `isCallback && !isAuthenticated` branch forever — a perpetual "Verifying
  your sign-in / Exchanging your code for a session" (found in #4720's
  review; pre-existing dead end, previously a perpetual `LoadingPage`).
  Needs a real signed-out state and a callback that recognises "no params".
- **callback / sign-in error recovery.** A failed code exchange currently
  drops to the generic error page; the `Handshake` has a `failed` state that
  never appears in hospitality. Show the failure where the wait was, with
  retry, keeping `describeAuthError`'s categories.
- **Refresh-failure banner tone.** `DashboardLayout`'s "session couldn't
  refresh" banner predates #4720; align its copy/action with
  `SessionExpiredGate` so the two lapses read as one system.

**Why.** Sign-in is the first thing a prospect or customer touches
(first-customers = factory-as-a-service funnel), and it is the design
system's most visible "precision in motion" moment. #4720 fixed the state
model; the surfaces that still show a spinner, a blank, or a dead end
undercut it.

## Run scale

Feature run. Slug: `auth-handshake-flows` (orchestrator default — log as
assumption). Artifacts under `docs/features/auth-handshake-flows/`.

## Idea-stage inputs

- **Problem, from the sufferer's view.** "I click Sign In and for a second
  nothing happens. I come back after lunch and either the page is blank or
  the first thing I get is a 401. When I sign out I land on a page that says
  it is verifying my sign-in, forever. On the design-system site the auth
  demo spins a generic spinner that looks nothing like the rest of Rialto."
- **Who has it; how they cope today.** Hospitality operators — restaurant
  manager and host personas (`apps/hospitality/CLAUDE.md`), today in
  practice the project owner as sole operator; secondarily design-system
  consumers evaluating rialto through the rialto-web auth demos. Coping:
  reload the page, retype the URL, ignore the demo.
- **Why now.** #4720 just landed the lifecycle model (`activeNavigator`,
  `isRefreshing`, `sessionExpired`, `refreshError`) and the `Handshake`
  instrument; aligning the remaining surfaces is cheapest while that model
  is fresh and before first customers see the sign-in.
- **Evidence (user's answer: measured defects only).** No user reports.
  Measured in code this session against react-oidc-context 3.3.1 /
  oidc-client-ts 3.5.0 internals: (1) silent refresh set `isLoading` and
  unmounted the dashboard; (2) `refreshError` could never fire because
  wrapped navigators do not reject; (3) no `accessTokenExpired` handling;
  (4) no in-flight feedback on Sign In — all four fixed in #4720. Still
  open, measured during #4720's review: (5) the post-logout `/callback`
  dead end above; (6) sign-out briefly unmasked the login gate (fixed in
  #4720's follow-up commit). Label all of this as measured-in-code,
  n = 0 user reports.
- **Solution hunch (not a design).** Reuse `Handshake` + `useAuth()`
  lifecycle on every remaining auth surface; give hospitality a proper
  signed-out landing; map callback failures to `Handshake state="failed"`
  with retry; make the rialto-web auth demos the reference implementation
  consumers copy.
- **Success in one sentence.** Every auth transition in hospitality and in
  the rialto-web auth demos shows a deliberate, design-system-native state —
  no blank screen, no dead end, no unexplained wait — verified by unit tests
  and the Hospitality E2E auth spec, with the E2E contract intact.
- **Biggest unknowns / ways this dies.**
  - A hospitality post-logout URL must be allow-listed in the Auth0 tenant
    (Allowed Logout URLs) — a change outside the repo. **Stop and surface**;
    never assume it is done. (Prod runs on a DEVELOPMENT-labelled tenant.)
  - `Hospitality E2E` is advisory and often red for auth/env reasons, so
    "verified by E2E" may not be provable in CI on a given day.
  - rialto-web auth demos run a fake state machine (`authFlowMachine`) that
    may not map 1:1 onto real OIDC navigator states; forcing it could make
    the demo lie.
  - Changing rialto-web pages can flip Linux-only visual baselines; a red
    visual job on a merged PR starts a cascading red streak on main.

## Scope boundaries

**In:** the four bullets under "What"; unit tests for each; docs
(`apps/hospitality/CLAUDE.md` auth section, `packages/auth/CLAUDE.md` if the
public API moves); a rialto changeset if `packages/rialto/src` changes;
llms regen.

**Out:** Auth0 tenant configuration (surface as a human step with the exact
value); new auth providers, MFA, or a hospitality-native sign-up (Auth0
hosts it); backend/Fastify auth changes; changing the E2E contract
(`data-testid="login-prompt"`, button name exactly "Sign In",
`data-testid="auth-layout"`); rialto npm publish; anything on the
`/api/v1/holds` security issue #4487 (backend, separate).

## Success criteria

- Hospitality: signing out lands on a deliberate signed-out state (no
  "Verifying your sign-in" without params); a failed callback shows
  `Handshake state="failed"` + retry; refresh-failure banner and
  `SessionExpiredGate` share copy/tone. All gated by unit tests.
- rialto-web: `SignIn`/`SignUp`/`SessionExpired` demos render their
  submitting/verifying/failed/lapsed states with `Handshake`; the
  hand-rolled groove/pulse CSS in `AuthFlowPage.module.css` is gone or
  reduced to layout.
- Gates: lint, typecheck, unit tests green in `packages/auth`,
  `packages/rialto`, `apps/hospitality`, `apps/rialto-web`, `apps/gen`;
  `pnpm regen --check` clean; rialto-web visual job green (regenerate
  baselines from the Linux CI artifact if needed — never macOS).
- E2E: `apps/hospitality/e2e/auth.spec.ts` passes when the environment
  allows; the contract selectors are untouched.

## Stack / design constraints (already in force)

Rialto tokens only (`--rialto-*`), gold accent only for focus/active/
in-flight; logical CSS properties; `useMotionPreset()`; no `setState` inside
a `useEffect` body in `packages/rialto`; `role="img"` + required
`aria-label` on instruments; all hospitality UI via rialto components;
imports with `.js` extension in hospitality; TDD (failing test first);
Zero-Touch Audit before commit; stage by explicit path (never `git add -A`
— a PostToolUse prettier hook keeps ~170 files dirty); `pnpm typecheck`
before push; never `status` as a zsh variable; `gh pr edit` is broken here
(use `gh api -X PATCH`); read the E2E contract before touching gates.

## Already decided

- PR #4720 is prior art, not part of this run: `@mbe/auth` lifecycle model,
  the rialto `Handshake` instrument (+ showcase page, stories, a11y
  fixture, changeset), hospitality `CallbackPage` / `SessionExpiredGate` /
  `LoginGate` in-flight state. Do not redo; build on it. Merge it before
  this run's implement stage branches (its CI is being re-run after a
  changeset fix).
- `Handshake` is _the_ visualization for auth exchanges; do not introduce a
  second one.
- Merge policy: review-gate pass + `CI Gate` green → merge (`tier:*` does
  not block); no stacking.

## Tracker (user's answer: export breakdown → issues)

Decompose publishes work items as GitHub issues carrying the `ready` and
`feature` labels plus a `tracking` parent, mapping recorded in
`breakdown.md`; `/implement-queue` may drain them. No import of existing
issues.

## User-facing surface

Yes — `ux: required` in `prd.md`.

## Release authorization (user's answer: merge on green)

Mechanism: PR to `main`; `CI Gate` is the sole required check; merge via
`gh pr merge <N> --auto --squash --delete-branch`; `deploy-static.yml` then
deploys hospitality / rialto-web / marketing as Cloudflare Workers — deploy
only via CI. Versioning: a `.changeset` entry per change to
`packages/rialto/src` (pre-1.0, patch releases cut by hand later).
**Authorized:** merging this run's PRs once the review gate and `CI Gate`
are green. **Not authorized:** rialto npm publish; any Auth0 tenant change;
any merge past an unfixed critical review finding.
