---
stage: idea
run: feature:hospitality-animations
date: 2026-08-30
assumptions:
  - "Slug: the user never chose one; `hospitality-animations` is the orchestrator's default (matches the worktree branch), adopted as the run ref."
  - "Run scale: feature run (artifacts under docs/features/) — the brief's default; the user's 'pick one, build end-to-end' is feature-sized."
  - "Problem statement: both sufferer's-voice quotes were orchestrator-drafted, not user-quoted; adopted and sharpened against the code."
  - "Who has it / coping: orchestrator-drafted (project owner as sole operator; hiring managers and clients as evaluators); adopted."
  - "Why now: the 'second consumer-wired instrument while #4720's pattern is fresh' rationale was orchestrator-drafted; adopted."
  - "Evidence: the brief's label 'measured-in-code, n = 0 user reports' is kept; no user research, analytics, or Sentry query was run at this stage."
  - "Solution hunches: the four candidates are the user's; the for/against evidence under each is this stage's code read, not user input."
  - "Ranking: the brief's disqualifier rule was applied literally — neither expiresAt nor notifiedAt is written by the notify route, so the rule's fall-through to candidate 2 (Neon OPEN sign) is recorded as the resulting in-scope order; the PRD commits, this stage does not."
  - "Success sentence: orchestrator-drafted; adopted with the surface left open as 'the chosen surface'."
  - "Unknowns: the brief's list was adopted and extended with what the code read added."
  - "Origin: a fresh run from the user's prompt; no docs/backlog.md seed matches, so none was claimed."
---

# Idea: A hospitality instrument for Rialto

Origin: a fresh feature run from the user's prompt — "come up with a few ideas
for animations related to hospitality / restaurants" — narrowed in the brief
interview to "explore four, ship one". No backlog seed claimed (`docs/backlog.md`
has no matching line). Prior art: #4720 (merged 2026-08-30), which set the
instrument contract with `Handshake`
(`packages/rialto/src/components/Handshake/Handshake.tsx:98-102` — `role="img"`,
required `aria-label`, `data-state`, `data-reduced-motion`).

## Problem

Two sufferers, in the brief's (orchestrator-drafted) words:

> Host on a tablet mid-service: "I tapped Notify on the Shah party — did the
> text go? How long until their table-ready window lapses? The list just says
> _Notified_ in green, same as it did ten minutes ago."

> Design-system evaluator: "Every instrument on the rialto site is a watch or a
> train board. This is a restaurant product — where's the restaurant?"

Sharpened against the code, the host's situation is worse than the quote. The
green _Notified_ badge she is reading
(`apps/hospitality/src/pages/WaitlistPage.tsx:285-289`, rendered when
`entry.notifiedAt` is set) can only ever appear from fabricated data: the real
notify route never writes `notifiedAt`, `expiresAt`, or `status: "notified"`
(see the evidence check below), and the list she is looking at returns only
`status: "waiting"` rows. In production, tapping Notify changes nothing on
screen. The evaluator's complaint stands as stated: the instrument family
(FlipDot, SplitFlap, Chalkboard, MasterOverride, Ferrofluid, WatchLoader,
Odometer, DepartureBoard, SilkFlow, Handshake) is generic-mechanical, and the
hospitality pages that carry live state render it as flat `Badge`s.

## Who has it

- **Front-of-house host / manager** — the `Host / Hostess` persona in
  `apps/hospitality/CLAUDE.md:91-96`; in practice today, the project owner as
  sole operator of the demo. Coping: `WaitlistPage` shows
  `<Badge variant="neutral">#{position}</Badge>` (`:266-268`), a static
  `formatWait(estimatedWaitMinutes)` (`:283`), and the prod-unreachable
  `Notified` badge; `HomePage` / `BriefingPage` list SSE events as text rows via
  `ActivityFeed` (`apps/hospitality/src/components/dashboard/ActivityFeed.tsx`)
  fed by `useSSEEventFeed` (`apps/hospitality/src/hooks/useSSESync.tsx:21`);
  open/closed state is shown nowhere — the booking widget only knows
  `hasOperatingHours` (`apps/hospitality/src/components/booking-widget/index.ts:4`).
- **Hiring managers / prospective clients** evaluating the demo in five minutes.
  Coping: none — they leave with the "watch and train board" impression.

## Why now

- #4720 merged 2026-08-30 and established the instrument pattern end-to-end
  (component + motion-test override + a11y fixture + changeset + showcase page +
  consumer wiring). The marginal cost of a second consumer-wired instrument is
  lowest while that shape is fresh in the tree (`Handshake/` holds all six
  files: `.tsx`, `.module.css`, `.test.tsx`, `.motion.test.tsx`, `.stories.tsx`,
  `index.ts`).
- Two removals just clarified the direction: `.changeset/remove-auth-mascot.md:5`
  ("a decorative element carrying a per-component accessibility/reduced-motion
  maintenance cost that no longer fits the design direction") and
  `.changeset/remove-radial-gauge.md:5` (dial removed in favour of `Meter`'s
  `role="meter"` contract). The bar is state-carrying, consumer-wired,
  contract-honest — not decoration.

## Evidence

Label for everything below: **measured-in-code, n = 0 user reports.** Zero open
tracker issues match any candidate (the brief's `gh issue list` search of
2026-08-30; not re-run here). `rialto-web` has no usage instrumentation at all
(`docs/backlog.md:11`), so "did anyone use this" is unanswerable for every
candidate.

Re-verified 2026-08-30 in this worktree (`origin/main` at `1d6189203`):

- `packages/types/src/waitlist.ts:15` —
  `WaitlistStatus = "waiting" | "notified" | "seated" | "expired" | "cancelled"`;
  `:18-31` `WaitlistEntry` carries `position`, `estimatedWaitMinutes`, `status`,
  `notifiedAt`, `expiresAt`.
- `services/reservations/prisma/schema.prisma:263-279` — `WaitlistEntry` has
  `notifiedAt DateTime?` (`:272`) and `expiresAt DateTime?` (`:273`); both
  nullable, no default.
- `apps/hospitality/src/hooks/useWaitlist.ts:11-39` — `useWaitlist`
  (`api.waitlist.list(venueId)`), `useCreateWaitlistEntry`,
  `useSeatWaitlistEntry`, `useNotifyWaitlistEntry`, `useCancelWaitlistEntry`.
- `apps/hospitality/src/hooks/useSSESync.tsx:57-67` — `ReservationEventType` =
  `reservation:created|updated|cancelled`, `hold:created|released|confirmed`,
  `table:updated`, `guest:lapsing`, `venue:updated`, `table-status:changed`.
  Consumers of `useSSEEventFeed`: `HomePage.tsx`, `BriefingPage.tsx`,
  `dashboard/ActivityFeed.tsx`. The `useReservationEvents` hook named in the
  hospitality CLAUDE.md does not exist (hooks directory listed).
- `packages/types/src/venue.ts:40-54` — `OperatingHours` of per-day
  `DaySchedule { open: "09:00"; close: "22:00"; closed?: boolean }`.
  `Venue.ianaTimezone` exists (`:32`); `PublicVenue` (`:19-24`) has `id`,
  `name`, `slug`, `operatingHours` only — **no timezone**. No "is open now"
  derivation exists in `apps/hospitality/src`, `packages/types/src`, or
  `services/reservations/src` (grep for `isOpenNow|openNow|currentlyOpen|isVenueOpen`
  hits only `VenueSwitcher`'s dropdown `setIsOpen`). Timezone-correct
  formatting prior art exists: `apps/hospitality/src/utils/ics.ts:86`
  `formatIcsLocalDateTime(isoInstant, timeZone)` and
  `utils/calendarLinks.ts:67` `formatIsoWithOffset`.
- `apps/hospitality/e2e/waitlist.spec.ts:11-36` — selectors are text / label /
  role only (`/no one waiting/i`, `Priya Shah`, `#1`, buttons `Seat` /
  `Add to waitlist`, `getByTestId(/^reservation-block-/)`); a `role="img"`
  instrument cannot collide. Across all hospitality E2E specs the only selector
  containing "open" is `getByRole("button", { name: "Open floor plan: Main Floor" })`
  (`e2e/offline-shell.spec.ts:263`) — a button role a `role="img"` sign cannot
  match; nothing selects on "closed".
- Instrument consumers today: `WatchLoader` → `LoadingPage`; `Odometer` /
  `Meter` → `dashboard/StatRow`; `Handshake` → `LoginGate` / `CallbackPage` /
  `SessionExpiredGate`; `SilkFlow` → marketing `HeroSection`.
- Bar for the Service bell: `packages/rialto/CLAUDE.md:11` "Buttons feel like
  physical controls"; `Button` already has `isLoading` + `aria-busy`
  (`packages/rialto/src/components/Button/Button.tsx:31,70`).
- Test setup: `packages/rialto/src/test/setup.ts:15` mocks
  `useReducedMotion: () => true` globally; `Handshake.motion.test.tsx` is the
  file-scope override pattern.

### Required evidence check — does the notify route populate `expiresAt`?

**No. It populates nothing.** Quoted from
`services/reservations/src/routes/waitlist.ts:200-214`:

```ts
async (request, reply) => {
  const entry = await waitlistService.getById(request.params.id);
  if (!entry) {
    /* 404 */
  }
  await fastify.waitlistNotifier.notifyTableReady({
    id: entry.id,
    guestPhone: entry.guestPhone,
    guestName: entry.guestName,
  });
  return reply.send({ data: entry });
};
```

The handler reads the entry, calls the notifier, and returns the **unchanged**
entry. Corroboration:

- The only occurrences of `notifiedAt` / `expiresAt` in the whole waitlist
  service + routes are type and schema declarations:
  `services/reservations/src/services/waitlist.ts:17-18` (interface) and
  `routes/waitlist.ts:38-39` (response JSON schema). `waitlistService` has no
  `notify` method; its only `status` writes are `seated` (`:92`), `cancelled`
  (`:106`), `expired` (`:119`).
- The notifier (`services/reservations/src/services/waitlist-notifier.ts:125-142`)
  sends SMS if an adapter exists, then "Always schedule expiry regardless of SMS
  outcome" via `scheduler.schedule(JOB_TYPES.WAITLIST_EXPIRY, …, FIVE_MINUTES_MS, …)`
  — a Redis job, not a DB write. `FIVE_MINUTES_MS` (`:73`) is the intended claim
  window, but it is never persisted.
- This is Redis-independent: with or without `REDIS_URL`, no code path writes
  the columns. Redis only decides whether the _expiry job_ exists.
- In production `REDIS_URL` is unset (`docs/backlog.md:8`, #3763).
  `services/reservations/src/services/notifier-runtime.ts:86-91` makes
  `connect()` throw "Cannot schedule/cancel notification jobs: REDIS_URL is not
  configured in production", and `notifyTableReady` awaits `scheduler.schedule`
  outside its SMS try/catch — so the route handler rejects. Inference from
  reading, not probed against prod: **tapping Notify on the live demo most
  likely returns a 5xx.**
- The staff list endpoint (`routes/waitlist.ts:128` →
  `waitlistService.listWaiting`, `services/waitlist.ts:76-81`,
  `where: { venueId, status: "waiting" }`) returns only waiting rows, so a
  `notified` entry would vanish from `WaitlistPage` even if the backend did
  transition it.
- The `Notified` badge is exercised only by fabricated data:
  `apps/hospitality/e2e/api-mocks.ts:356`
  (`updateWaitlistEntry(id, { status: "notified", notifiedAt: … })`) and
  `apps/hospitality/src/pages/WaitlistPage.test.tsx:401-403`. The route test
  (`services/reservations/src/routes/waitlist.test.ts:423-437`) asserts only
  status 200 and `data.id`.

**Consequence for the Pager:** the `notified` state can honestly show
**neither** a countdown to `expiresAt` **nor** an elapsed-since-`notifiedAt`
timer from real data. The `expired` state also never occurs in prod (no Redis →
expiry never fires). What remains observable in prod is `waiting` + `position`,
which `<Badge>#N</Badge>` already renders — a Pager built on that alone is
decoration by the brief's own bar.

## Solution hunch

Four candidates, recorded as hunches (not designs) with the evidence for and
against each. The PRD commits to one.

### 1. Pager — the waitlist coaster buzzer

States map 1:1 onto `WaitlistStatus`: `waiting` (dark, position shown) →
`notified` (buzz + LED chase, counting down) → `seated` / `expired` /
`cancelled`. Consumer: `WaitlistPage` entry card.

- **For:** complete state enum in shared types; a live consumer page today; the
  most restaurant-specific metaphor of the four; no overlap with `Meter` /
  `Odometer`; E2E selectors cannot collide.
- **Against (decisive in this run's scope):** the notify route writes neither
  `expiresAt` nor `notifiedAt` nor `status`, the list endpoint hides non-waiting
  rows, and prod cannot schedule expiry — every state except `waiting` is
  unreachable from real data. Making it honest needs a backend change (the route
  writes `status`, `notifiedAt`, `expiresAt = now + FIVE_MINUTES_MS`, and the
  list includes `notified` rows), which the brief puts **out of scope** ("any
  backend/Fastify/Prisma change").
- **Status:** blocked for this run. Strongest candidate the moment that backend
  fix lands — recorded as a deferred hunch plus a maintenance-run seed for the
  route defect.

### 2. Neon OPEN sign — venue hours state

Tube flickers on at open, dark when closed, "opens at 17:00" pending. Derived
from `venue.operatingHours` + now. Consumers: dashboard `PageHeader` region
(`HomePage.tsx:35`; `PageHeader` today takes only `title` / `description`,
`components/PageHeader.tsx:4-7`) and/or `PublicBookingPage`.

- **For:** the data exists (`OperatingHours` / `DaySchedule`,
  `Venue.ianaTimezone`); timezone-correct formatting prior art exists in
  `utils/ics.ts` / `utils/calendarLinks.ts`; a three-state instrument (open /
  closed / opening-soon) duplicates nothing; no E2E selector on open / closed
  state; it visualises a state no page shows today.
- **Against:** the open-now derivation must be written from scratch and be
  timezone-correct, including overnight schedules (`close < open`),
  `closed: true` days, and DST; a wrong OPEN is a real defect. `PublicVenue`
  carries no `ianaTimezone`, so a timezone-honest sign on `PublicBookingPage`
  needs a backend projection change (out of scope) — the honest consumer in
  this run is the **authenticated dashboard only**. "Now" must come from the
  consumer (rialto bans `setState` in `useEffect`; the instrument should take
  its state as a prop and the consumer derives it). Whether the live demo venue
  has `operatingHours` populated at all is **UNKNOWN — needs human input** (not
  visible from the repo).
- **Status:** the brief's fall-through target; viable on the dashboard with a
  pure, unit-tested derivation.

### 3. Ticket rail — the kitchen ticket printer

A thermal ticket prints and tears onto a rail per `reservation:created` /
walk-in event from `useSSEEventFeed`. Consumer: `HomePage` / `BriefingPage`
beside or replacing `ActivityFeed`.

- **For:** the feed is real and already consumed on both pages; E2E intercepts
  the SSE stream (`apps/hospitality/e2e/api-mocks.ts:488-492`) so the page is
  testable.
- **Against:** content-bearing (each ticket carries name / party / time), so it
  competes with `ActivityFeed` rather than visualising one state; hard to scope
  to a single PR; a "walk-in" distinction does not exist in
  `ReservationEventType`.
- **Status:** deferred hunch; relative rank unchanged from the brief.

### 4. Service bell — tactile call action

Front-desk "ding" bell as a physical-control button (strike + ring-out) for
`Notify` on the waitlist.

- **For:** extends `packages/rialto/CLAUDE.md:11` "Buttons feel like physical
  controls".
- **Against:** a flourish on an action, not a visualisation of state — the
  weakest against the no-decoration bar; overlaps `Button isLoading` /
  `aria-busy`; the action it would decorate is the notify route that persists
  nothing and most likely 5xxs in prod.
- **Status:** deferred hunch; last.

### Ranking after the evidence check

The brief's default was **1 Pager → 2 Neon → 3 Ticket rail → 4 Service bell**,
with the rule: if the notify route never populates `expiresAt`, design around
`notifiedAt`; if that cannot be made honest either, fall through to candidate 2.
Both conditions failed, so **the default ranking is overturned by the brief's
own rule.** Within this run's scope the order is **1 Neon OPEN sign → 2 Ticket
rail → 3 Service bell**, with **Pager parked** — first choice contingent on an
out-of-scope backend fix. This stage does not pick. The PRD commits, and may
instead choose to widen scope to the small route fix if the owner prefers the
Pager; that is a scope decision for a human, not an evidence question.

## Success in one sentence

A hospitality operator looking at the chosen surface can read the instrument's
state without the caption, screen-reader users get the same fact from its
`aria-label`, reduced-motion users get a parked-but-truthful frame, and the
design-system showcase gains its first restaurant-domain instrument — verified
by unit + motion tests, the a11y matrix, and the hospitality E2E contract for
that page left intact.

## Unknowns & risks

- **The notify route is a latent backend defect** (persists nothing; most likely
  5xx in prod without Redis). Out of scope here; it should become a maintenance
  run (`capture`) or a `docs/backlog.md` seed at Operate — never silently fixed
  inside this run.
- **Test-vs-prod drift on `WaitlistPage`:** the `Notified` badge is reachable
  only via mocks. Any instrument on that page inherits the drift.
- **Neon correctness:** timezone, overnight hours, `closed: true` days, DST; a
  wrong OPEN on a public page is a defect — hence dashboard-only unless the
  public projection gains `ianaTimezone`.
- **Neon data presence:** UNKNOWN — needs human input: does the live demo venue
  have `operatingHours` set? If not, the sign shows "closed" or "unknown"
  forever on the deployed demo. _Orchestrator probe, 2026-08-30 (read-only):_
  `GET https://mattbutlerengineering.com/api/v1/venues/by-slug/the-grand-bistro`
  and `/rooftop-lounge` (the two `services/reservations/prisma/seed.ts` venues)
  both return `404 Venue not found` — the deployed venues were created through
  the onboarding wizard, not the seed, and their slugs are not exposed on any
  public page or in `tests/smoke`. The wizard writes the keyed shape
  (`OperatingHoursStep` → `{ monday: { open, close } }`, matching
  `packages/types/src/venue.ts`); the seed's array shape
  (`dayOfWeek/openTime/closeTime/isClosed`) is referenced nowhere in
  `services/reservations/src` and is stale. Consequence for the design: the
  consumer must validate `operatingHours` at the boundary and the instrument
  must have an honest "hours not set" state — `hasOperatingHours === false` is
  already a first-class product state (the booking widget shows a "Set
  Operating Hours" prompt for it), so this is a required state, not a fallback.
- **Measurement:** no user reports and no rialto-web instrumentation
  (`docs/backlog.md:11`) — success is provable only by tests and the showcase,
  not by usage.
- `packages/rialto/src/test/setup.ts:15` forces reduced motion globally; the
  animated branch needs a `*.motion.test.tsx` with a file-scope override.
- Animation must run on the compositor (CSS transform keyframes as `WatchLoader`
  / `Handshake` do); a JS-timer-driven animation on a tablet during service is
  a battery / perf regression.
- Layout changes on the consumer page can break its E2E spec (`Hospitality E2E`
  is advisory and often red for environmental reasons).
- Instruments are deliberately absent from both visual suites
  (`packages/rialto/src/test/visual/visual.spec.ts` `STORIES`,
  `apps/rialto-web/e2e/visual.spec.ts` `lightSections`); keep it that way — a
  Linux-only baseline cannot be regenerated from macOS.

Next stage: PRD (`prd` skill, or the router).
