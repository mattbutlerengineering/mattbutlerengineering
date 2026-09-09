# Autorun brief — hospitality-animations

Collected 2026-08-30 in a single up-front interview (four questions answered
by the user; every other field below is the orchestrator's recommended
default and must be logged under `assumptions:` by the stage that relies on
it). This file is the brief, not an artifact: it never counts toward
orientation.

## The user's four answers (verbatim intent)

1. **Deliverable:** "Pick one, build end-to-end" — the Idea stage weighs the
   candidates; the PRD commits to the single strongest instrument; it ships
   through implement → verify → review → ship.
2. **Surface:** "Rialto + wired into hospitality" — a new instrument in
   `packages/rialto` (showcase page, stories, a11y fixture, changeset) AND
   consumed on the real hospitality page whose state it visualises.
3. **Candidates to carry into Idea (all four):** Pager (waitlist coaster
   buzzer), Ticket rail (kitchen ticket printer), Neon OPEN sign (venue
   hours state), Service bell (tactile call action).
4. **Release + tracker:** "Merge on green, export issues" — same as the
   2026-08-30 `auth-handshake-flows` run.

## Feature description (what / why)

**What.** One new _hospitality instrument_ for the Rialto design system —
a state-carrying animated component with a restaurant metaphor — built to
the bar the existing instrument family sets (`Handshake`, `WatchLoader`,
`SplitFlap`/`Odometer`/`DepartureBoard`, `StatusLED`, `MasterOverride`,
`Chalkboard`), and wired into the hospitality page whose real state it
renders. The user's prompt was "come up with a few ideas for animations
related to hospitality / restaurants"; the interview narrowed it to: explore
four, ship one.

**Why.** PRODUCT.md charter: every feature should (a) make the hospitality
demo feel like a product a small venue would pay for, or (c) showcase craft
a hiring manager notices in five minutes. The instrument family is the
design system's signature ("precision in motion"), but every instrument so
far is _generic-mechanical_ (watch movement, Solari board, LED track); none
speaks the hospitality domain the flagship demo is about. The hospitality
pages that carry live state today render it as flat `Badge`s.

**The bar (measured from two removals in the tree, `.changeset/`):**
`AuthMascot` was removed as "a decorative element carrying a per-component
accessibility/reduced-motion maintenance cost that no longer fits the
design direction"; `RadialGauge` was removed in favour of `Meter` for
bounded 0–100 metrics. Therefore: **no decoration**. The instrument must
(1) visualise a state that already exists in the app's data, (2) have a
live consumer page on day one, (3) not duplicate `Meter`/`Odometer`/
`Progress`, (4) carry an honest accessible contract (`role="img"` +
required `aria-label`, like `Handshake`), and (5) park cleanly under
`prefers-reduced-motion`.

## Run scale

Feature run. Slug: `hospitality-animations` (orchestrator default, matches
the worktree branch — log as assumption). Artifacts under
`docs/features/hospitality-animations/`.

**Execution environment.** This run executes inside the git worktree
`/Users/mbutler/github/mattbutlerengineering/.claude/worktrees/hospitality-animations`
on branch `worktree-hospitality-animations`, based on `origin/main` at
`1d6189203` (#4720). Every stage runs its commands from that directory.
`node_modules` was absent at worktree creation; the orchestrator started
`pnpm install --frozen-lockfile` at the root before dispatching Idea — the
Implement stage must confirm it finished (`ls node_modules/.bin/vitest`)
before running any gate.

## Idea-stage inputs

- **Problem, from the sufferer's view.** Host on a tablet during service:
  "I tapped Notify on the Shah party — did the text go? How long until
  their table-ready window lapses? The list just says _Notified_ in green,
  same as it did ten minutes ago." Design-system evaluator: "Every
  instrument on the rialto site is a watch or a train board. This is a
  restaurant product — where's the restaurant?"
- **Who has it; how they cope today.** Front-of-house manager / host
  personas (`apps/hospitality/CLAUDE.md`); in practice the project owner as
  sole operator, plus hiring managers/clients evaluating the demo. Coping:
  `WaitlistPage` shows `<Badge variant="success">Notified</Badge>` and a
  static wait estimate; `HomePage`/`BriefingPage` list SSE events as text
  rows (`ActivityFeed`, `useSSEEventFeed`); open/closed state is not shown
  anywhere (the booking widget only knows `hasOperatingHours`).
- **Why now.** #4720 (merged 2026-08-30) established the instrument pattern
  end-to-end — `Handshake` + consumer wiring + a11y fixture + changeset —
  so the marginal cost of a second consumer-wired instrument is at its
  lowest while that pattern is fresh; the two removals above just clarified
  the design direction (state-carrying, not decorative).
- **Evidence (label all as measured-in-code; n = 0 user reports).**
  - `packages/types/src/waitlist.ts`: `WaitlistStatus = "waiting" |
"notified" | "seated" | "expired" | "cancelled"`; `WaitlistEntry` has
    `notifiedAt`, `expiresAt`, `estimatedWaitMinutes`, `position`.
  - `apps/hospitality/src/pages/WaitlistPage.tsx:285-289` renders
    `notifiedAt` as a static Badge; `useNotifyWaitlistEntry` /
    `useSeatWaitlistEntry` / `useCancelWaitlistEntry` in
    `apps/hospitality/src/hooks/useWaitlist.ts`.
  - `services/reservations/src/services/waitlist-notifier.ts`: SMS via
    `smsAdapter` (null-safe), `expireEntry`, `notifyTableReady`;
    `docs/backlog.md` records prod has **no Redis** so waitlist expiry has
    never been scheduled in prod (an unknown for the Pager candidate — see
    below).
  - `apps/hospitality/src/hooks/useSSESync.tsx`: `ReservationEventType`
    includes `reservation:created|updated|cancelled`, `hold:created|
released|confirmed`, `table:updated`, `table-status:changed`,
    `guest:lapsing`, `venue:updated`; `useSSEEventFeed()` returns
    `readonly ReservationEvent[]` (consumed by `HomePage`, `BriefingPage`).
    (The hospitality CLAUDE.md names a `useReservationEvents` hook — that
    file does not exist; `useSSESync.tsx` is the real one.)
  - `packages/types/src/venue.ts`: `OperatingHours` = per-day
    `DaySchedule { open: "09:00"; close: "22:00"; closed?: boolean }`. No
    "is open now" derivation exists anywhere in `apps/hospitality/src`,
    `packages/types`, or `services/reservations/src` (grep 2026-08-30).
  - Instrument family + dates (git): FlipDot 04-11, SplitFlap/Chalkboard/
    MasterOverride 04-16, Ferrofluid/SplitScreenExit 04-17, WatchLoader
    06-26, Odometer/DepartureBoard 07-05, SilkFlow 07-29, Handshake 08-30.
    Consumers today: `WatchLoader` → hospitality `LoadingPage`; `Odometer`
    - `Meter` → dashboard `StatRow`; `Handshake` → `LoginGate` /
      `CallbackPage` / `SessionExpiredGate`; `SilkFlow` → marketing hero.
  - Tracker: `gh issue list --search "waitlist OR pager OR animation OR
instrument OR ticket OR neon"` (2026-08-30) — zero open issues on any
    candidate; only the `auth-handshake-flows` chain (#4721–#4731) matches
    "instrument".
- **Solution hunches (four candidates — hunches, not designs).**
  1. **Pager — the waitlist coaster buzzer.** The LED coaster puck every
     guest has held. States map 1:1 onto `WaitlistStatus`: `waiting` (dark,
     position shown) → `notified` (buzz + LED chase, counting down to
     `expiresAt`) → `seated` (settled) / `expired` (dark, error LED) /
     `cancelled`. Consumer: `WaitlistPage` entry card, replacing or
     augmenting the "Notified" Badge.
  2. **Neon OPEN sign — venue hours state.** Neon tube flickers on at open,
     dark when closed, "opens at 17:00" pending. Derived from
     `venue.operatingHours` + now. Consumers: dashboard `PageHeader`
     region and/or `PublicBookingPage`.
  3. **Ticket rail — the kitchen ticket printer.** A thermal ticket prints
     and tears off onto a rail for each `reservation:created` / walk-in
     event from `useSSEEventFeed`. Consumer: `HomePage`/`BriefingPage`
     beside or replacing `ActivityFeed`.
  4. **Service bell — tactile call action.** Front-desk "ding" bell as a
     physical-control button (strike + ring-out) for `Notify` on the
     waitlist. Extends "buttons feel like physical controls".
- **Default ranking the PRD applies unless the Idea stage's evidence check
  overturns it (log the choice and the reason under `assumptions:`):**
  **1 Pager → 2 Neon OPEN sign → 3 Ticket rail → 4 Service bell.**
  Rationale: Pager has a complete existing state machine, a live consumer
  page today, the most hospitality-specific metaphor, no overlap with
  `Meter`/`Odometer`, and an E2E spec whose selectors are all text/role
  (`waitlist.spec.ts`: "no one waiting", guest name, `#1`, buttons
  `Seat`/`Notify`/`Add to waitlist`) so a `role="img"` instrument cannot
  collide. Neon sign needs a brand-new open-now derivation whose timezone
  correctness is an unresolved unknown, and a wrong "OPEN" on the public
  booking page is a real defect. Ticket rail is a content-bearing feed
  (each ticket carries a name/party/time), competes with `ActivityFeed`,
  and is hard to scope to one PR. Service bell is a Button flourish — the
  weakest against the no-decoration bar and overlaps `Button isLoading`.
  **Disqualifier for Pager:** if `expiresAt` is never populated by the
  notify route (check `services/reservations/src/routes/waitlist*.ts` and
  the notifier), the `notified` state has no countdown to show — then
  design the Pager around `notifiedAt` (elapsed since notify) only, and if
  that also cannot be made honest, fall through to candidate 2.
- **Success in one sentence.** A hospitality operator looking at the
  waitlist (or the chosen surface) can read the instrument's state without
  the caption, screen-reader users get the same fact from its
  `aria-label`, reduced-motion users get a parked-but-truthful frame, and
  the design-system showcase gains its first restaurant-domain instrument
  — verified by unit + motion tests, the a11y matrix, and the hospitality
  waitlist E2E contract left intact.
- **Biggest unknowns / ways this dies.**
  - Prod has no Redis → waitlist expiry never fires in prod; does the
    notify route still write `expiresAt`? (Idea stage verifies; see the
    disqualifier above.)
  - `packages/rialto/src/test/setup.ts` mocks `useReducedMotion → true`
    globally; the animated branch needs its own `*.motion.test.tsx` with a
    file-scope override (pattern: `Handshake.motion.test.tsx`).
  - Animation must run on the compositor (CSS transform keyframes, as
    `WatchLoader`/`Handshake` do) — a JS-timer-driven animation on a tablet
    during service is a battery/perf regression.
  - A change to `WaitlistPage` layout can break `waitlist.spec.ts`
    (advisory `Hospitality E2E`, frequently red for env reasons — may not
    be provable green in CI on a given day).
  - Rialto-web showcase pages are snapshot-tested only via the
    `visual-test` harness sections; instruments are deliberately absent
    from both visual lists (`packages/rialto/src/test/visual/visual.spec.ts`
    `STORIES` and `apps/rialto-web/e2e/visual.spec.ts` `lightSections`) —
    keep it that way; adding an animated section creates a Linux-only
    baseline nobody can regenerate from macOS.

## Scope boundaries

**In:** exactly one new instrument in `packages/rialto/src/components/<Name>/`
(`<Name>.tsx`, `.module.css`, `.test.tsx`, `.motion.test.tsx`,
`.stories.tsx`, `index.ts`); barrel export in `src/components/index.ts`;
a11y fixture entry in `src/test/accessibility/component-fixtures.tsx`
(union type + fixture element); showcase page
`apps/rialto-web/src/pages/data/<Name>Page.tsx` + entry in
`apps/rialto-web/src/data/page-registry.ts` (category "Data Display", like
`handshake`); `.changeset/<slug>.md` (`minor`); `pnpm build` in
`packages/rialto` (regenerates exports map / registry.json / manifest);
llms regen; the hospitality consumer wiring on the instrument's page with
unit tests; `apps/hospitality/CLAUDE.md` one-line note if a page's key
component changes; `idea.md` records all four candidates with the
evidence for/against each.

**Out:** the other three candidates (record them as deferred hunches in
`idea.md` / `retro.md` seeds, not as work items); marketing site; any
backend/Fastify/Prisma change (including adding Redis or SMS config); the
`auth-handshake-flows` surfaces (`LoginGate`, `CallbackPage`,
`SessionExpiredGate`, `apps/rialto-web/src/pages/auth/**`, `packages/auth`)
— that run is active in the main checkout and its issues #4721–#4731 are
in flight; `WatchLoader` (the main checkout carries the owner's
uncommitted edits to it — do not touch); rialto npm publish; visual-test
harness sections; `.changeset/config.json`.

## Success criteria

- `packages/rialto`: new instrument renders `role="img"` with required
  `aria-label`; exposes its state via `data-state`; `prefers-reduced-motion`
  produces a static truthful frame (`data-reduced-motion="true"`); every
  colour/easing/spacing from `--rialto-*` tokens; gold accent only while
  something is in flight; `pnpm lint`, `pnpm typecheck`, `pnpm test`
  green; the a11y matrix (`a11y-matrix.test.tsx`) passes with the new
  fixture; a Storybook story exists.
- `apps/rialto-web`: showcase page reachable via the page registry; `pnpm
typecheck` + `pnpm test` green after `pnpm --dir packages/rialto build`.
- `apps/hospitality`: the chosen page renders the instrument from real
  state (for Pager: one card per `WaitlistEntry`, state from `status` /
  `notifiedAt` / `expiresAt`); unit tests cover each state; `pnpm lint`,
  `pnpm typecheck`, `pnpm test` green; `e2e/waitlist.spec.ts` selectors
  untouched and the spec passes when the environment allows.
- Repo: `pnpm regen --check` clean; changeset present; PR to `main`,
  `CI Gate` green, review stage with no unfixed critical findings.

## UX

User-facing surface: **yes** → PRD records `ux: required`.

## Stack / design constraints (already in force)

Rialto tokens only; gold only for focus/active/in-flight; semantic tokens
for success/error; logical CSS properties; `useMotionPreset()` for any
framer-motion config (ADR-025); CSS transform keyframes for continuous
motion (WatchLoader idiom) or framer-motion for interactive motion — never
JS timers; no `setState` inside a `useEffect` body in `packages/rialto`
(derive at render time); `forwardRef`; props interface exported as
`<Name>Props`; three font weights max; hospitality imports rialto via
`@mattbutlerengineering/rialto` and local modules with `.js` extension;
TDD (failing test first); Zero-Touch Audit before commit; stage by explicit
path (never `git add -A` — a PostToolUse prettier hook keeps ~170 files
dirty in the main checkout; the worktree starts clean); `pnpm typecheck`
before push; never `status` as a zsh variable; `gh pr edit` is broken here
(use `gh api -X PATCH repos/{owner}/{repo}/pulls/<N> -F body=@file`).

**Stale-doc warning for the stages:** `packages/rialto/CLAUDE.md` says a
showcase page needs `apps/rialto-web/src/routes.tsx` + `data/nav-sections.ts`
entries; measured 2026-08-30, `Handshake` appears in neither — the single
touchpoint is `apps/rialto-web/src/data/page-registry.ts` (plus the page
file). Verify against `HandshakePage.tsx` before wiring.

## Already decided

- `Handshake` (#4720) is the reference implementation for an instrument's
  contract (`role="img"`, `data-state`, `data-reduced-motion`, motion test
  override, a11y fixture, changeset, showcase page). Copy its shape.
- One instrument only. Do not introduce a second one "while there".
- Merge policy: review-gate pass + `CI Gate` green → merge (`tier:*` does
  not block); no stacking.

## Tracker (user's answer: export breakdown → issues)

Decompose publishes work items as GitHub issues carrying the `ready` and
`feature` labels plus a `tracking` parent, mapping recorded in
`breakdown.md`, in the same title form as the last run
(`[Feature] hospitality-animations [n/N]: …`, `[tracking]
hospitality-animations: …`); `/implement-queue` may drain them. No import
of existing issues.

## Release authorization (user's answer: merge on green)

Mechanism: PR from `worktree-hospitality-animations` to `main`; `CI Gate`
is the sole required check; merge via `gh pr merge <N> --auto --squash
--delete-branch`; `deploy-static.yml` then deploys hospitality / rialto-web
as Cloudflare Workers — deploy only via CI. Versioning: a `.changeset`
entry per change to `packages/rialto/src` (pre-1.0; patch/minor releases
cut by hand later). **Authorized:** merging this run's PR once the review
gate and `CI Gate` are green. **Not authorized:** rialto npm publish; any
backend/infra change; any merge past an unfixed critical review finding.

## Repo gotchas the stages must honour

- Run `pnpm` from inside the package dir, not the monorepo root.
- Vitest does NOT typecheck — run `pnpm typecheck` explicitly; the pre-push
  hook runs neither typecheck nor tests.
- Rebuild rialto (`pnpm --dir packages/rialto build`) before typechecking
  `apps/rialto-web` or `apps/hospitality` — consumers see new exports only
  via regenerated `.d.ts`.
- Kinetic instruments are exempt from both visual suites by existing
  convention; do not add one. Never commit macOS-rendered baselines.
- llms regen: `pnpm build --filter @mbe/cli...` then `pnpm regen` before
  push when rialto's public API changed; stage the llms files by explicit
  path.
- `git push` must never reach a pipe; verify the pushed SHA.
- Worktree: never bare `git stash`; the stash stack is shared.
