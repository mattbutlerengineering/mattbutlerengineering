---
stage: prd
run: feature:hospitality-animations
date: 2026-08-30
ux: required
assumptions:
  - "Instrument: the Neon OPEN sign. The brief's default (Pager) fell through by the brief's own rule — idea.md measured that the notify route writes neither `expiresAt` nor `notifiedAt` nor `status`, the staff list hides non-waiting rows, and prod has no Redis, so every Pager state except `waiting` is unreachable without a backend change the brief puts out of scope. The Neon sign is the rule's fall-through target and meets every bar in the brief on the authenticated dashboard; idea.md gives no evidence it cannot."
  - "Consumer surface: the authenticated dashboard (`HomePage`, header region) only. `PublicVenue` carries no `ianaTimezone`, so `PublicBookingPage` is excluded — a wrong OPEN on a public page is a defect."
  - "State vocabulary: `open` / `opening-soon` / `closed` / `unset` — the brief's minimum plus the required hours-not-set state. No `closing-soon`: the open label already carries the closing time."
  - "`unset` reuses the product's existing definition (`hasOperatingHours` in the booking widget and readiness gate 2): no valid, non-closed day remains — null, undefined, `{}`, or every day `closed: true`."
  - "`opening-soon` lead window: 60 minutes before the next opening (PRD default; UX may tune the number, not the state)."
  - "Interval semantics: a day's window is half-open `[open, close)`; `close < open` is an overnight window that spills into the next calendar day; `open === close` is an invalid entry."
  - "Boundary validation: a `DaySchedule` whose `open`/`close` are not `HH:MM` is ignored for that day and never thrown on; if `Venue.ianaTimezone` is not a zone the runtime recognises, the dashboard renders no sign rather than guessing from the browser's zone."
  - "No selected venue (venues still loading, or none) renders no sign; `unset` is reserved for a venue that exists and has no usable hours."
  - "Refresh: the dashboard re-derives the state at least once a minute so the sign flips at open/close without a reload; the mechanism is the Architect's call."
  - "Working component name `NeonSign`; showcase category `Data Display` (same as `handshake`). The final name is the Architect's call."
  - "Actors are drafted from the personas in `apps/hospitality/CLAUDE.md` and the brief; none were user-named."
  - "`ux: required` follows the brief's UX section (the user's 'Rialto + wired into hospitality' answer implies a user-facing surface)."
  - "Success is provable only by tests and the showcase — idea.md records no user reports and no rialto-web instrumentation, so no usage metric is set."
  - "Slug, run scale, and the measured-in-code evidence label are inherited from idea.md unchanged."
---

# PRD: Neon OPEN sign

## Problem statement

Nothing in the hospitality product tells a host whether the venue is open
_right now_. The dashboard header reads "Dashboard / Welcome back, <name>"
(`apps/hospitality/src/pages/HomePage.tsx:35-38`); the venue's hours exist only
as a settings form and as the booking widget's `hasOperatingHours` boolean; and
no "is open now" derivation exists anywhere in the tree (idea.md, Evidence). A
host mid-service, a manager checking the tablet before doors, or an evaluator
clicking through the demo all have to compute "are we open?" in their head
from a table of `HH:MM` strings — or not at all.

The second sufferer from idea.md stands unchanged: every instrument on the
rialto showcase is a watch or a train board, and the hospitality pages render
their live state as flat `Badge`s. The design-system evaluator leaves without
seeing the restaurant.

The waitlist pain that led the brief (a `Notified` badge that never changes)
is real but not solvable in this run: idea.md measured that the notify route
persists nothing, and backend change is out of scope. It is deferred, not
forgotten (see Out of scope).

## Solution

When this ships, the dashboard header carries a **neon OPEN sign** — a rialto
instrument — showing the venue's trading state, derived from
`Venue.operatingHours` and `Venue.ianaTimezone` at the current instant:

| State          | Meaning                                                                      | Accessible name carries                                                       |
| -------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `open`         | now is inside today's window (including an overnight window begun yesterday) | the closing time — "Open until 22:00"                                         |
| `opening-soon` | closed, next opening within 60 minutes                                       | the opening time — "Opens at 17:00"                                           |
| `closed`       | closed, next opening more than 60 minutes away                               | the next opening, with the day when not today — "Closed, opens Tuesday 17:00" |
| `unset`        | no valid, non-closed day configured (`hasOperatingHours` false)              | "Operating hours not set"                                                     |

The sign is read-only (`role="img"`); it neither edits hours nor links
anywhere. Reduced-motion users get a static, truthful frame of the same state.
The component ships in rialto with tests, a motion test, a story, an a11y
fixture, and a showcase page; the open-now derivation is a pure function in the
hospitality app, unit-tested against timezone, overnight, closed-day and DST
cases; "now" is supplied by the consumer, never owned by the instrument.

Exact copy and the visual language belong to the UX stage; the table fixes
which fact each state must carry.

## Actors

- **Host** — front-of-house staff on the authenticated dashboard during
  service (persona in `apps/hospitality/CLAUDE.md`; in practice today, the
  project owner as sole operator).
- **Operator** — whoever configures the venue (onboarding wizard, settings);
  owns the operating hours the sign reads.
- **Assistive-technology user** — a Host using a screen reader and/or
  `prefers-reduced-motion`.
- **Evaluator** — hiring manager or prospective client spending five minutes
  on the rialto showcase or the hospitality demo.
- **Consuming developer** — anyone importing the instrument from
  `@mattbutlerengineering/rialto`.

## User stories

1. As a Host, I want the dashboard to show whether the venue is open right now
   and until when, so that I can answer "are we open?" at a glance instead of
   reading the hours table.
2. As a Host, I want the sign to show "opens at HH:MM" in the hour before
   service, so that I know doors are about to open while I am setting up.
3. As a Host, I want the sign to name the next opening when we are closed, so
   that a Monday-closed venue reads "opens Tuesday" rather than a bare
   "closed".
4. As an Operator, I want the sign to say plainly that hours are not set when
   the venue has none, so that I am nudged to configure them and never see a
   false "closed" — or worse, a false "open".
5. As an Assistive-technology user, I want the sign's accessible name to state
   the same fact the neon shows, and a static frame under reduced motion, so
   that I get the information without the animation.
6. As an Evaluator, I want a restaurant-domain instrument on the rialto
   showcase with every state demonstrable, so that the design system reads as
   built for hospitality.
7. As a Consuming developer, I want the instrument to take its state and label
   as props and own no clock, so that I can render it from any venue data and
   test it deterministically.

## Success criteria

Each criterion names the check that proves it. The brief's gates apply per
package — `pnpm lint`, `pnpm typecheck`, `pnpm test`, run from inside the
package directory — and consumers are typechecked after
`pnpm --dir packages/rialto build`.

**Rialto instrument (`packages/rialto`)**

- [ ] Renders `role="img"` with the required `aria-label`; `data-state` is one
      of `open | opening-soon | closed | unset`. — _`NeonSign.test.tsx` renders
      each state and asserts role, label, and `data-state`._
- [ ] Under `prefers-reduced-motion`, `data-reduced-motion="true"` and no
      flicker or glow keyframe is applied; the static frame still distinguishes
      all four states. — _`NeonSign.test.tsx` (global reduced-motion mock)
      asserts the attribute and the absence of the animated class;
      `NeonSign.motion.test.tsx` overrides the mock file-wide and asserts the
      animated class appears only then._
- [ ] Gold appears only in `opening-soon`; `open` uses the success semantic
      token; `closed` and `unset` use neutral tokens and are visually distinct
      from each other; every colour, easing and spacing comes from `--rialto-*`
      tokens. — _per-state class/data-attribute assertions; a grep of the
      module CSS for raw colour literals returns none; confirmed at Review._
- [ ] Continuous motion runs on the compositor (CSS transform/opacity
      keyframes); no JS timers and no `setState` in `useEffect` inside the
      component. — _rialto pre-commit hook; Review._
- [ ] The a11y matrix passes with a `NeonSign` fixture. —
      _`a11y-matrix.test.tsx` green after the entry is added to
      `component-fixtures.tsx`._
- [ ] A story shows all four states. — _`NeonSign.stories.tsx` present and
      typechecks._
- [ ] A `.changeset/*.md` marks `@mattbutlerengineering/rialto` `minor`. —
      _file present._

**Showcase (`apps/rialto-web`)**

- [ ] A `NeonSign` page is reachable through `page-registry.ts` (category
      "Data Display") and demonstrates all four states. — _`pnpm test` and
      `pnpm typecheck` green after the rialto rebuild._
- [ ] Not added to either visual suite. — _diffs of
      `packages/rialto/src/test/visual/visual.spec.ts` `STORIES` and
      `apps/rialto-web/e2e/visual.spec.ts` `lightSections` contain no NeonSign
      entry._

**Derivation (`apps/hospitality`, pure function)**

- [ ] Uses `Venue.ianaTimezone`, never the browser's zone. — _same instant, an
      `America/Los_Angeles` venue and a `Europe/London` venue yield different
      states._
- [ ] Overnight: `{ open: "18:00", close: "02:00" }` is `open` at 01:00 the
      next calendar day and `closed` at 03:00, regardless of that next day's
      own entry. — _unit test._
- [ ] `closed: true` days and missing days are closed, and the next-opening
      lookup skips them (Monday closed → "opens Tuesday"). — _unit test._
- [ ] DST: correct state and correct "opens at" instant on both sides of a
      spring-forward and a fall-back transition in `America/Los_Angeles`. —
      _unit test with concrete instants._
- [ ] Half-open interval: exactly `open` is open, exactly `close` is closed. —
      _unit test._
- [ ] `opening-soon` at 59 minutes before opening, `closed` at 61. — _unit
      test._
- [ ] `unset` exactly when no valid, non-closed day remains — null, undefined,
      `{}`, all days `closed: true` — matching `hasOperatingHours`. — _unit
      test reusing the fixtures of `hasOperatingHours.test.ts`._
- [ ] Malformed entries (`"9am"`, `"25:00"`, `open === close`) are ignored for
      that day and never throw; an unrecognised `ianaTimezone` is reported,
      never guessed. — _unit test._

**Dashboard consumer (`apps/hospitality`)**

- [ ] `HomePage` renders the sign from `useVenue().selectedVenue` in the header
      region, with all four states reachable from venue fixtures; no selected
      venue renders no sign. — _`HomePage.test.tsx` cases per state plus
      no-venue._
- [ ] The label changes as time passes without a reload (at least once a
      minute). — _`HomePage.test.tsx` with fake timers: advance past a
      boundary, label flips._
- [ ] Existing `HomePage.test.tsx` cases still pass, and
      `e2e/dashboard.spec.ts` selectors stay unique — the sign adds no
      `heading`, `status` or `meter` role and no text "Dashboard" or "Live
      Activity". — _unit run; the E2E spec passes when the environment allows
      (advisory)._

**Repo**

- [ ] `pnpm regen --check` clean; changeset present; `apps/hospitality/CLAUDE.md`
      notes the sign on `HomePage`; PR to `main`; `CI Gate` green; the Review
      stage leaves no unfixed critical finding.

## Out of scope

- **Pager** (waitlist coaster) — parked, not rejected: the notify route
  persists nothing (`services/reservations/src/routes/waitlist.ts:200-214`),
  so its states are unreachable without a backend fix the brief excludes. Seed
  a maintenance run for the route at Operate.
- **Ticket rail** — a content-bearing feed that competes with `ActivityFeed`
  rather than visualising one state; not one PR.
- **Service bell** — a flourish on an action, weakest against the
  no-decoration bar, and the action is the same broken notify route.
- **`PublicBookingPage` / `PublicVenue`** — no `ianaTimezone`; adding it is a
  backend projection change.
- **Any backend, Fastify or Prisma change** — including the notify-route
  defect and the public projection.
- **A `closing-soon` state** — the open label already carries the closing
  time; a fifth state doubles the edge-case surface for no new fact.
- **Special or holiday hours, multiple windows per day** — the data model has
  one window per weekday; the sign renders what exists.
- **Interaction** — the sign is `role="img"`; no click-to-edit, no link to
  settings.
- **Other consumers** (`BriefingPage`, settings, marketing site), visual-suite
  sections, npm publish, `WatchLoader`, and the `auth-handshake-flows`
  surfaces.

## Open questions

- **UNKNOWN — needs human input:** does the deployed demo venue have
  `operatingHours` and a valid `ianaTimezone` set? Not derivable from the repo
  (idea.md: the seed slugs 404 in prod). If not, the deployed dashboard will
  honestly show `unset`, and no Evaluator sees the lit sign until an Operator
  sets hours. — Matt, via the dashboard settings page.
- Final component name (working `NeonSign`), and where "now" ticks from —
  `apps/hospitality/src/hooks/useSessionClock.ts` may already provide a
  clock. — Architect.
- Where the sign sits: `PageHeader` today takes only `title` and
  `description`, so it needs a slot or the sign renders beside it. — UX, then
  Architect.
- Copy and visual language per state: does the tube spell "OPEN"; what does
  `unset` look like so it cannot be mistaken for `closed`? — UX.
- Whether 60 minutes is the right `opening-soon` window for a restaurant. —
  UX; changing the number does not change the contract.

Next stage: UX Design (`ux: required`) — produce `ux.md` in this directory via
the `ux-design` skill or the router.
