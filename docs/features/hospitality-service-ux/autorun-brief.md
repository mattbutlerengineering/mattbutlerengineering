# Autorun brief — hospitality-service-ux

Collected 2026-09-03 in a single up-front interview (four questions answered
by the user; every other field below is the orchestrator's recommended
default and must be logged under `assumptions:` by the stage that relies on
it). This file is the brief, not an artifact: it never counts toward
orientation.

User's request, verbatim: "audit our web app and determine where we can
improve the ux. make all of our ux an intuitive, award winning experience.
Our UX should provide the same service that world class hospitality would."

## The user's four answers (verbatim intent)

1. **Surface:** "Hospitality: dashboard + booking widget" — the product
   (`apps/hospitality`): operator dashboard (home, briefing, timeline,
   reservations, guests, waitlist, floor plans, settings, onboarding,
   profile, admin) AND the guest-facing public booking + manage-reservation
   pages. Not marketing / rialto-web / gen (swept clean by the standing
   `/goal` audit loop, 2026-08-31 → 09-02; hospitality-authed was the one
   zone that loop never reached, blocked on Auth0 credentials).
2. **Dashboard access for the audit:** "Local synthetic session + fixture
   API" — run the app locally, inject an unsigned OIDC session in the exact
   storage shape the E2E suite's `buildOidcUserEntry()` produces, route
   `/api/**` to the E2E fixtures via `mockApi(page)`. No credentials.
   Deterministic. Does NOT exercise the production data path (logged as a
   verification gap, not hidden).
3. **Run shape:** "Audit → one feature run on top cluster" — the audit
   ranks findings; Idea/PRD pick the highest-leverage _service moment_ (one
   journey taken end-to-end to award-winning); every other finding is
   routed to `docs/backlog.md` seeds and/or `ready` issues for
   `/implement-queue` — never silently dropped.
4. **Release + tracker:** "Merge on green, export issues" — same as the
   `hospitality-animations` and `auth-handshake-flows` runs.

## Feature description (what / why)

**What.** The audit (`ux-audit.md`, four reports in `audit/`) ranks one
service moment first by a wide margin: **the service night on the Timeline.**
A host on a tablet opens Tonight's Service, works the Timeline from 17:00 to
close, seats walk-ins, and survives a failed request — and today the product
lies to them three times an evening and strands them once. Reproduced at
`5f642aa42`: the "now" line vanishes from 17:00 local until midnight in every
US timezone (UTC-day compare, A1); the Briefing's Dinner and Late tabs are
empty and a 21:00 party is filed under Early (`getUTCHours`, A2); one failed
walk-in POST leaves the dialog on "Seating…" forever and replaces the entire
grid with `POST /api/v1/reservations/walk-in failed: 500 …` until a hard
reload (A3); "Seat Guest" writes `CONFIRMED`, so seating is invisible and
offered twice (A4). Around those: the grid never scrolls to now and a new
walk-in lands off-screen unselected (A5); every "Walk-in" shortcut — ⌘K, the
dashboard's primary CTA — navigates instead of opening the dialog because
`?walkin=true` has no reader (A6); an empty night is a bare grid (A7); the
table-status tag fires a one-way state change on a brush with no label,
confirm or undo (A8); spinner-under-stats loading (A9); the Briefing drops
VIP tags and paints "vegetarian" red (A10). The fix that A3 needs for its
copy is the app-wide one: a `describeApiError` helper replacing the raw
request line at 27 + 8 sites (B1), the Reservations list's no-retry /
KPIs-say-zero failure (B2), and focus return + a spoken result after every
timeline mutation (B3, hospitality half). Thirteen findings, eleven of them
S effort, no backend or infra dependency, every one reproducible in the
harness with a fixed clock or a 500 mock. Everything else the audit found is
routed (see `ux-audit.md` § Routing), not built here.

**Why.** PRODUCT.md charter (a) "make the hospitality demo feel like a
product a small venue would pay for" and theme (1) "close the guest-facing
loop — booking, cancellation, confirmation flows that feel
production-grade" / theme (2) "operator daily workflow … 'how is tonight
going?'". The user's bar: _the software should behave the way a world-class
maître d' behaves_ — anticipate, recognise, never make the guest do the
work, recover gracefully, stay calm, speak like a person. Matt's standing
aesthetic direction (2026-08-31): speakeasy / high-class / royalty / gen-z,
expressed THROUGH rialto tokens, never over accessibility.

**The lens the whole run uses (orchestrator's translation of the user's
words — log as assumption; the PRD may refine but must not drop it):**

| Principle   | A great host…                         | In software                                                               |
| ----------- | ------------------------------------- | ------------------------------------------------------------------------- |
| ANTICIPATE  | knows the next need before it's asked | smart defaults, next-step affordance, context carried across pages        |
| RECOGNIZE   | greets by name, remembers preferences | guest tags/notes/VIP at the moment of seating, not three clicks away      |
| NO-DEAD-END | never makes the guest do the work     | no re-entry of known data, every empty state offers the next action       |
| RECOVER     | fixes a mistake before you notice     | human error copy + retry/undo, no stuck spinner, honest optimistic revert |
| CALM        | reads the room at a glance            | legible status hierarchy, no alarm without cause, no clutter              |
| TONE        | speaks like a person, not a policy    | short, warm, confident, a little cheeky; never corporate                  |
| TIME        | respects yours                        | perceived speed, ⌘K, 44 px targets, one-handed at the door                |
| INCLUSIVE   | serves everyone the same              | labels, live regions, focus, reduced motion, contrast                     |

## Run scale

Feature run. Slug: `hospitality-service-ux` (orchestrator default — log as
assumption). Artifacts under `docs/features/hospitality-service-ux/`.

**Execution environment.** This run executes inside the git worktree
`/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/hospitality-service-ux`
on branch `worktree-hospitality-service-ux`, based on `origin/main` at
`5f642aa42` (#4968). Every stage runs its commands from that directory.
`pnpm install --frozen-lockfile` and `pnpm build --filter
@mattbutlerengineering/rialto... --filter @mbe/api-client... --filter
@mbe/types...` have completed there; a Vite dev server is (or was) running
on `http://localhost:3002/hospitality/` — Implement/Verify must check
(`curl -s -o /dev/null -w '%{http_code}' http://localhost:3002/hospitality/`)
and restart it with `pnpm --filter @mbe/hospitality dev -- --port 3002
--strictPort` if absent. `apps/hospitality/.env` in the worktree carries the
app's public `VITE_AUTH_*` values plus `VITE_API_URL=http://localhost:3999`
(a dead port — every unmocked API call fails fast; never point it at prod
for the audit harness).

**Other runs active in the main checkout (do not touch their files):**
`venue-onboarding-floor-plan` (VenueOnboardingPage, `components/venue-
onboarding/**`, `components/floor-plan/**`, `hooks/useFloorPlans*`,
FloorPlanEditorPage, `packages/types/src/schemas/reservation-requests.ts`,
`services/reservations/src/routes/tables*`) — its review/ship is in flight;
`otlp-localhost-default` (services observability — PR #4969 open). Decompose
must keep this run's items off those files or sequence behind their merge.

## The audit (evidence for the Idea stage)

The audit report is `docs/features/hospitality-service-ux/ux-audit.md`
(supporting file, not a protocol artifact). Harness (git-excluded, in the
worktree): `apps/hospitality/e2e/.ux-audit/` — `gen-state.mjs` (synthetic
session), `playwright.config.ts`, `specs/walk.spec.ts` (route walker: 3
viewports + full page + aria snapshot + console/failed-request log per
route), `specs/<cluster>/*.spec.ts` (interaction probes). Re-run any
finding's reproduction from `apps/hospitality` with
`pnpm exec playwright test -c e2e/.ux-audit/playwright.config.ts <spec>`.
Verify MUST re-run the reproductions of the findings the PRD commits to and
show they no longer reproduce — that is the run's regression evidence.

**Ranked findings summary.** 48 raw findings → 30 unique (`ux-audit.md`
§ Consolidated findings), 7 clusters:

| Rank | Cluster                                                              | Findings                                                                                                                                                                                                                     | Default route                |
| ---- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| 1    | **A — the service night on the Timeline** (+ B1, B2, B3-hospitality) | A1–A10 correctness/recover/time/anticipate/calm/recognize on Briefing + Timeline + its dialogs; B1 error voice helper; B2 Reservations retry; B3 focus/announce                                                              | **this run**                 |
| 2    | B — one voice for bad news (remainder)                               | B4 `/chat` outside shell + silent failure; B5 8/10 empty states flat, silent `*` redirect; B6 one `document.title`                                                                                                           | issues                       |
| 3    | C — the front door is closed (guest, prod)                           | C1 `/public/v1/*` → SPA HTML (PR #4565 in flight); C2 no live venue + `about:blank` Go Back; C3 Stripe key absent from `deploy-static.yml` (#4111 covers only the E2E job)                                                   | comment / human flag / issue |
| 4    | E — the manager can't manage                                         | E1 hours unreachable once operational; E2 rialto `Select` painted under next `Card`; E3 "Review" → blank wizard; E4 server theme never read; E5 list rows invisible action + raw ids; E6 `window.confirm`; E7 nested buttons | issues                       |
| 5    | F — tablet targets (rialto)                                          | F1 `size="sm"` 23 px ×60, GlobalNav 32 px                                                                                                                                                                                    | issue                        |
| 6    | D — guest widget polish (zero reach until C)                         | D1 venue TZ; D2 hold expiry wipes form; D3 inert Cancel + beacon; D4 party cap/waitlist quote; D5 manage page read-only; D6 phone targets                                                                                    | issues                       |
| 7    | G, M                                                                 | G1 walk-in/waitlist never recognise a guest; M1 hardcoded canvas grid + blue focus rings; M2 orphan widget + false backlog claims                                                                                            | issues                       |

**Candidate clusters as service moments.** (1) _The service night_ —
truth, recovery and orientation on the host's core screen. (2) _One voice_ —
every error, empty state and success speaks like the house. (3) _The front
door_ — a guest can actually book (blocked on infra + a human venue step).
(4) _The manager's back office_ — hours, review, settings that work. (5)
_Recognise at the desk_ — walk-in and waitlist greet returning guests.

**Default ranking:** (1) by leverage — core screen × every-evening
reproduction × S effort × zero external dependency × harness-verifiable. The
Idea stage keeps this unless its evidence check overturns it; the reason goes
under `assumptions:`.

## Idea-stage inputs

- **Problem, from the sufferer's view.** "It's 7:40 on a Thursday. I open the Timeline and there's no line
  showing me where _now_ is — I count columns. The pre-shift Briefing said we
  had no dinner bookings, but the grid is full. A walk-in hits a hiccup, the
  button says 'Seating…' for a minute, I hit Escape, and my whole table view is
  gone — just a red box that says `POST /api/v1/reservations/walk-in failed:
500`. I reload the tablet with a party standing at the desk. I seat them and
  nothing changes on the grid, so my co-host seats them again. The 'New
  Walk-In' button on the home screen just takes me to the Timeline. Nobody
  built this for someone standing up." (Host persona, composed from reproduced
  findings A1–A8 — not a user quote; n = 0 reports.)
- **Who has it; how they cope today.** Host / hostess on a tablet at the
  door and the owner-operator on a laptop (`apps/hospitality/docs/USER-FLOWS.md`
  personas); guests on their phones via the public booking widget. In
  practice today: the project owner as sole operator, prospects hitting the
  self-serve path opened by #4492 (2026-08-23), and hiring managers /
  clients evaluating the demo in five minutes. Coping today: reading the wall clock and hunting the
  column by hand; treating the Briefing's "All" tab as the only trustworthy
  one; a hard reload after any failed action (losing the selected date and
  sidebar); using the table-status tag as the only evidence a party arrived;
  three clicks for every walk-in; the owner-operator doing service from a
  laptop where the tablet defects are smaller.
- **Why now.** The standing `/goal` audit loop (2026-08-31 → 09-02) took
  rialto, marketing, gen and the API to ≥0.9 Lighthouse in every category
  and shipped 8 vibe/UX issues via 12 PRs — hospitality-authed is the only
  zone never audited, and it is the product the charter's theme (a) is
  about. First customers are the stated funnel (memory: factory-as-a-service
  playbook). The instrument vocabulary (`NeonSign`, `Pager`, `Handshake`,
  `Toast action`, `EmptyState`, `CommandPalette`, `Skeleton`, `Steps`) now
  exists in rialto, so the marginal cost of a hospitality-grade moment is
  at its lowest.
- **Evidence.** The audit (measured in a real browser against fixture data
  at `5f642aa42`; live production for the unauthenticated surfaces). **n = 0
  user reports — never upgrade this label.** Top lines, all reproduced at
  `5f642aa42` against fixture data (`audit/operator.md`, `audit/xcut.md`,
  `audit/manager.md`): fixed clock 14:00 local → now-line at 480 px; 20:00 →
  `nowLineCount: 0` (A1). Local bookings 17:30/18:30/21:00 → Dinner `[]`, Late
  `[]`, all three under Early (A2). 500 on the walk-in POST → `submitText:
"Seating…"`, `submitDisabled: true`, `gridCount: 1 → 0`, alert text is the
  raw request line, unchanged after 10 s, after Escape, after Next day → Today
  (A3). Seat Guest → `PATCH … {"status":"CONFIRMED"}`; sidebar still offers
  "Seat Guest"; `COMPLETED` written nowhere (A4). Walk-in success →
  `newBlockInViewport: false`, `newBlockSelected: "false"`, `focusAfter: BODY`,
  `toasts: 0`, `liveTexts: []` (A5, B3). `/timeline?walkin=true` → `dialogs: 0`;
  ⌘K "walk" ⏎ → `/waitlist` (A6). Empty reservations → 13 hour headers, 5
  table rows, no message on tablet (A7). Table tag: `ariaLabel: null`, one
  click → immediate PATCH, `confirmDialogs: 0` (A8). Reservations 500 →
  `retryButtons: 0`, four KPI cards read 0 (B2). Raw `METHOD /path failed:`
  copy on 5 manager surfaces + the guest widget; 27 `err.message` sites (B1).
  Also measured but routed out: production `/public/v1/*` answers the SPA's
  HTML (C1, PR #4565); no live venue slug resolves (C2); Settings "Dark" is
  un-clickable because the rialto Select listbox paints under the next Card
  (E2).
- **Solution hunches (candidate clusters — hunches, not designs).**
  1. _Local-day truth_ — compare `isToday` and bucket the Briefing with the
     same local-date/hour formatter the page already uses to build `date`
     (venue timezone via `Intl` if the venue carries one; Architect
     decides); fix the E2E mock's `todayReservations()` the same way so
     evening runs stop rendering an empty grid.
  2. _Non-destructive failure_ — page handlers rethrow so the dialog's own
     catch shows the error and re-enables submit; the page-level error
     renders as a dismissible `ErrorRetryBanner` **above** the grid and
     clears on the next attempt; one `describeApiError(err) → {title,
detail, retryable}` keyed on `ApiClientError` replaces every raw
     `err.message` (pattern exists: `src/lib/describe-auth-error.ts`);
     `STATUS_LABEL` into `ReservationList`; Reservations list gets the
     banner and KPIs read "—" while errored.
  3. _Orientation_ — on mount and on Today, `scrollLeft = nowOffset −
clientWidth/3`; after a walk-in resolves, select the returned
     reservation and `scrollIntoView` its block; `EmptyState` overlay on the
     grid when `reservations.length === 0` with a Walk-in CTA and a Today
     link; `Skeleton` rows instead of a spinner, stats gated on the same
     flag.
  4. _One motion to a walk-in_ — read `walkin=true` in `TimelinePage`'s URL
     schema (open, then strip), point the dashboard CTA and palette at it,
     rank palette matches prefix > word-start > substring.
  5. _Seating that shows_ — UI half in scope: hide "Seat Guest" once the
     table is OCCUPIED, offer it for PENDING, rename the phone chip; the
     full `seatedAt`/SEATED state needs a Prisma change → routed unless the
     Architect finds a schema-free way.
  6. _Calm controls_ — label the table tag with its action ("Mark
     occupied"), fire with an Undo toast (`Toast.action` exists, unused) or
     open a small menu of valid next states.
  7. _Spoken results_ — one `role=status` line per mutation ("Seated Priya
     Shah at Table 1"), focus returned to the opener on success paths
     (`useReturnFocus` in parent-controlled dialogs); optional rialto
     `useFocusTrap` `initialFocus`/restore with a changeset.
  8. _Briefing recognises_ — reuse `GuestCard` segment logic, per-tag
     `isAllergy`, the timeline's `formatTime`, and a "Tonight's Service"
     breadcrumb.
- **Default ranking the PRD applies unless the Idea stage's evidence check
  overturns it (log the choice and reason under `assumptions:`).** Cluster A + B1 + B2 +
  B3-hospitality, as one journey ("the service night"). Reasons: the core
  screen; reproduced every evening; S effort; no external dependency;
  harness-verifiable end to end. The PRD commits to this set or a strict
  subset with each drop logged.
- **Success in one sentence.** A host, a manager, or a guest moving through
  the chosen journey is anticipated, recognised, never dead-ended, recovered
  gracefully, and spoken to like a person — verified by the audit
  harness's reproductions no longer reproducing, unit + E2E tests, the a11y
  checks, and a live check of every public surface after deploy.
- **Biggest unknowns / ways this dies.**
  - The authenticated dashboard cannot be live-verified in production (no
    Auth0 E2E credentials in this environment — ON MATT since 2026-08-31);
    Ship must record that gap explicitly rather than claim prod evidence.
  - `Hospitality E2E` is advisory and frequently red for environmental
    reasons — a green run may not be provable on a given day.
  - Backend gaps the UX cannot paper over: prod has no Redis (waitlist
    expiry / reminders never scheduled), `/public/v1` ingress (#4565) —
    a guest-facing moment that depends on either must be scoped honestly.
  - Scope creep: "award-winning everywhere" is the failure mode; the PRD
    commits to ONE journey and routes the rest.
- **Venue vs. browser timezone.** The local-hour fix is right for a
  host standing in the venue; `venue.timezone` (IANA, set at onboarding)
  is the correct source for anyone remote and for the guest widget (D1,
  routed). Architect picks one formatter and notes it.
  - **Seated state.** A real SEATED status or `seatedAt` column is a
    Prisma migration — out of scope. The UI-only half (A4) must not
    pretend: copy says "Seated" only when the table is OCCUPIED.
  - **Concurrent Timeline work.** PR #4967 (memoize reservation layout
    style in `TimelineGrid`) is open and #4944 (`ReservationBlock` style
    memo) is in progress — both touch `components/timeline/`. Decompose
    sequences this run's `TimelineGrid` items behind their merge or
    rebases; never silently overwrite.
  - **E2E mock has the same bug.** `e2e/api-mocks.ts` `todayReservations()`
    uses the UTC day; any evening-clock E2E this run adds needs the mock
    fixed too (allowed: `e2e/**` may be modified).
  - **StrictMode focus capture.** The Escape-path focus loss may be
    dev-only (double effect); verify in a production build before
    claiming or fixing it.
  - **`Hospitality E2E` is advisory and often red** for environmental
    reasons; the harness reproductions are the run's regression evidence,
    quoted in `verification.md`.

## Scope boundaries

**In:** the PRD-committed cluster inside `apps/hospitality/src/**` (pages,
components, hooks, CSS modules, copy), its unit tests and E2E spec updates
(`apps/hospitality/e2e/**` — may add/modify specs, never delete coverage);
rialto changes ONLY when the vocabulary genuinely falls short (new prop /
component in `packages/rialto` with `.changeset` `patch|minor`, story, a11y
fixture, showcase entry per `Handshake`/`NeonSign` precedent); `packages/
types` additions if a copy/derivation helper needs a shared type; `apps/
hospitality/CLAUDE.md` / `docs/USER-FLOWS.md` one-line updates where a
flow's step changes; `docs/backlog.md` seeds and `ready` issues for every
finding NOT in the cluster; `.claude/rules/gotchas.md` entry only via
`/gotcha-harvest` conventions (not by hand mid-run).

**Out:** every other cluster (routed, not built); marketing, rialto-web,
gen; Auth0 tenant/branding (#4848, PR #4924); `/api/v1/holds` auth (#4487);
Prisma schema / migrations; new infrastructure (Redis, SMS); the in-flight
runs' files listed above; rialto npm publish; visual-test harness sections
(kinetic surfaces stay exempt; never commit macOS baselines); `.changeset/
config.json`.

## Success criteria

- Every finding the PRD commits to has a reproduction in the audit harness
  (or a unit/E2E assertion) that FAILS at `5f642aa42` and PASSES after —
  quoted in `verification.md`.
- `apps/hospitality`: `pnpm lint`, `pnpm typecheck`, `pnpm test` green; new
  behaviour unit-tested (TDD: failing test first); affected `e2e/*.spec.ts`
  updated and passing locally against the mocked harness; keyboard-only and
  screen-reader parity for every new interaction; `prefers-reduced-motion`
  honoured; 44×44 targets on tablet; all colours via `--rialto-*`.
- If `packages/rialto` changes: changeset present, a11y matrix green, story
  added, `pnpm --dir packages/rialto build` before consumers typecheck.
- Repo: `pnpm regen --check` clean; PR to `main`; `CI Gate` green; review
  stage with no unfixed critical findings; after deploy, live check of every
  PUBLIC surface touched (booking widget / manage / front door); authed
  surfaces: documented as not live-verifiable.

## UX

User-facing surface: **yes** → PRD records `ux: required`.

## Stack / design constraints (already in force)

Rialto tokens only (`var(--rialto-*)`; Konva canvas fills are the one
exception); Rialto components only (no raw `<button>/<input>/<select>` in
pages); gold only for focus/active/in-flight — never decorative; semantic
tokens for success/error; logical CSS properties; `useMotionPreset()` for
any framer-motion config (ADR-025); CSS transform keyframes for continuous
motion; no `setState` inside a `useEffect` body in `packages/rialto`
(derive at render time); all API calls via `@mbe/api-client` with
`getAccessToken`; SSE callbacks via refs; immutable state; imports with
`.js` extension in hospitality; `forwardRef` + exported `<Name>Props` for
rialto; three font weights max; copy voice per the TONE principle (house
example: "Wrong door. That page never made the list."); TDD; Zero-Touch
Audit before commit; stage by explicit path (never `git add -A`); `pnpm
typecheck` before push (pre-push runs neither typecheck nor tests); never
`status` as a zsh variable; `gh pr edit` is broken here (use `gh api -X
PATCH repos/{owner}/{repo}/pulls/<N> -F body=@file`); `git push` never into
a pipe — verify the pushed SHA.

## Already decided

- One cluster only. Do not build a second "while there".
- The lens table above is the PRD's acceptance vocabulary.
- Findings outside the cluster are ROUTED (backlog seed or `ready` issue),
  each exactly once, deduped against `docs/backlog.md` and open issues.
- Merge policy: review-gate pass + `CI Gate` green → merge (`tier:*` does
  not block); no stacking.
- The audit harness stays git-excluded for this run (a backlog seed may
  propose promoting it to a committed `ux-walk` E2E tool).

## Tracker (user's answer: export breakdown → issues)

Decompose publishes work items as GitHub issues carrying `ready` + `feature`
plus a `tracking` parent, mapping recorded in `breakdown.md`, title form
`[Feature] hospitality-service-ux [n/N]: …` / `[tracking]
hospitality-service-ux: …`; `/implement-queue` may drain them. Findings
routed out of the cluster become `ready` + `audit` + `ux` issues (title form
`[Audit] UX: …`) — de-duplicated against open issues first. No import of
existing issues.

## Release authorization (user's answer: merge on green)

Mechanism: PR from `worktree-hospitality-service-ux` to `main`; `CI Gate` is
the sole required check; merge via `gh pr merge <N> --auto --squash
--delete-branch`; `deploy-static.yml` deploys hospitality as a Cloudflare
Worker — deploy only via CI. Versioning: a `.changeset` entry per change to
`packages/rialto/src` (pre-1.0). **Authorized:** merging this run's PR(s)
once the review gate and `CI Gate` are green. **Not authorized:** rialto
npm publish; any backend/infra change beyond the scope above; any merge
past an unfixed critical review finding.

## Repo gotchas the stages must honour

- Run `pnpm` from inside the package dir, not the monorepo root.
- Vitest does NOT typecheck — run `pnpm typecheck` explicitly.
- Rebuild rialto (`pnpm --dir packages/rialto build`) before typechecking
  `apps/hospitality` if rialto changed.
- llms regen: `pnpm build --filter @mbe/cli...` then `pnpm regen` before
  push when a package's public API changed; stage llms files by explicit path.
- Docs-only PRs skip prettier in CI and poison later Builds — run
  `pnpm exec prettier --check docs/features/hospitality-service-ux/` before
  any PR.
- Rialto published-source changes need a changeset or Build fails CI Gate.
- E2E specs: strict-mode selector collisions and volatile-text locators are
  the known flake class — prefer role + exact name; run the
  `e2e-selector-drift-reviewer` on any spec change.
- Worktree: never bare `git stash`; the stash stack is shared.
- PostToolUse prettier hook may leave the main checkout dirty — irrelevant
  here; the worktree starts clean, keep it that way.
