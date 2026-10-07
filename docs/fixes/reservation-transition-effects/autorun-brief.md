# Autorun brief: reservation-transition-effects

Collected 2026-10-04 from Matt (deepen review follow-up; three answered questions:
"do them all", sequencing, release authorization). This is not a pipeline artifact.

## Run

- **Scale:** maintenance run (condition brief — degraded, not broken), slug `reservation-transition-effects`, in
  `docs/fixes/reservation-transition-effects/`. Enters at Capture. Expected re-entry: architect.
- **Candidate:** #1 — Deepen reservation transitions into one effects module.
- **Worktree / branch:** `.claude/worktrees/reservation-transition-effects`, branch `refactor/reservation-transition-effects`, cut from
  `origin/main` @ `2653312ff`. Never use the main checkout.
- Origin: `/idea-to-prod:deepen` review taken at `fcd4be0a1` on 2026-10-04 (report in the OS temp dir, not the repo). Matt chose "do them all". Evidence below was verified against the code at that commit; re-verify on current origin/main before relying on line numbers.
- **Tracker:** none. No GitHub issue interaction.

## Condition (degraded, not broken)

Which outbound side effects a reservation transition fires is decided per entry point,
across ~9 shallow seams in `services/reservations/src`:

- `NotificationPort` (`packages/notifications/src/port.ts:33`), `SmsPort`
  (`sms-port.ts:49`, `TwilioSmsAdapter` built TWICE: `notifications.ts:55` and
  `services/notifier-runtime.ts:71`), `NotificationDispatcher` (concrete, no interface),
  `NotifierScheduler` (`notifier-runtime.ts:14`, not injectable through `buildApp`),
  `BookingNotifier` / `WaitlistNotifier` / `PostVisitNotifier`, `StripePort`
  (`services/deposit.ts:14-22`; `StripeService` built TWICE: `deposit.ts:1216` and the
  singleton `services/stripe.ts:310`), `ReservationEventEmitter` (built TWICE:
  `app.ts:177` and the singleton `services/events.ts:169`).
- No single "transition → effects" table: `services/reservation-state-machine.ts` only
  validates transitions. Each route if-chains (PATCH handler `routes/reservations.ts`
  :574-589 cancel, :599-611 no-show, :681-701 complete with `postVisitEmailEnabled` read inline).
- Divergence by entry point: Cancel emits SSE only on PATCH, not on DELETE
  (`reservations.ts:775-786`) or guest cancel (`cancel-reservation.ts:39-47`). Staff
  `POST /reservations` fires nothing; walk-in SSE only; public booking email + jobs. Hold
  confirm via `holds.ts:340` / `public-holds.ts:260` sends no confirmation email; via
  `public-reservations.ts` it does. NO_SHOW captures money but emits no SSE.
- Dead emitter: the `events.ts:169` singleton has ZERO subscribers; `confirm-hold.ts:177`,
  `floor-plan.ts:233`, `guest.ts:419`, `lapsed-guest-cron.ts:146` emit into it.
  `emitReservationUpdated`, `emitHoldCreated`, `emitHoldReleased` have zero callers.
- Stripe bypasses its port: `routes/public-deposits.ts:5,128,172` and
  `routes/stripe-webhook.ts:4,189` import the singleton; tests `vi.mock("stripe")` (5 files).
- Test seams are inconsistent: 8 files inject via `buildApp` options, 10 `vi.mock` by
  module path, 5 mock the npm package.

## Desired shape (direction, not a design — Architect designs it)

One reservation-transitions module owning the effects table per transition (cancel,
no-show, complete, confirm/hold-confirm, create, modify), called by every route and
service entry point; effects behind a small number of injected ports (payments,
messaging, jobs, events) with production + in-memory adapters, constructed once in the
composition root. Venue-level policy (e.g. "suppress all outbound effects for venue X",
which `feature:live-demo-venue` needs) must be expressible in ONE place. Consider
designing the interface twice (deepen skill's parallel-design pattern) at Architect.

## Scope

- In: the module and ports; moving the 6 multi-channel handlers and the cancellation /
  no-show / modification services onto it; killing the dead singleton (route its emits
  through the live emitter); making Stripe injectable everywhere (incl. the two
  singleton routes); transition-level tests across entry points FIRST.
- Each entry-point divergence the new tests expose is a product decision — record it.
  Default where no skill default exists: STOP and surface (do not silently unify money
  or messaging behaviour).
- Out: SSE event-name catalog (#2 — consume it if merged first); venue authorization
  (#4); the demo venue itself; inert ports/job types (note, don't delete unless orphaned
  by this change).
- Money paths move: plan 2–3 PRs, not one.
- User-facing surface: none intended; any visible change (an email now sent where it
  wasn't) is a recorded product decision.

## Constraints

- Repo gotchas apply: TDD; `set -o pipefail` in workflows; no `status` shell var;
  explicit-path staging; never pipe `git push`; prettier-format docs; a fresh worktree
  needs `pnpm install --frozen-lockfile` and `pnpm build --filter @mbe/cli...`.
- Deepening test ordering is mandatory: write the new tests at the intended interface
  FIRST against today's code; deepen; delete the old shallow-module tests LAST in the
  same change, stating in the diff which coverage moved where.
- Behaviour changes uncovered by the new tests (entry points that diverge today) are
  product decisions: record each in the artifact; take a skill default only where one
  exists, otherwise stop and surface.
- Active ADRs bind (`docs/adr/`, status: active). ADR-004 and ADR-006 are superseded.
- Sequencing (Matt, 2026-10-04): #2 sse-event-catalog and #1 reservation-transition-effects
  run first in parallel; #4 venue-scoped-routes starts after #1 merges; #3
  endpoint-definitions-pilot runs alongside. `feature:live-demo-venue` stays paused until
  #1 and #4 land, then resumes at Architect. Rebase on origin/main before each PR.

## Release authorization (Matt, 2026-10-04)

May, without asking:

- open PRs, and squash-merge each once the `reviewer` passes it, `CI Gate` is green on
  the final head, and no critical is unfixed. Use an explicit `--subject`;
- let CI deploy workflows run on merge; dispatch a deploy workflow through CI if a
  paths filter skips a changed package.
- additionally for this run: no merge until the `stripe-flow-reviewer` subagent has passed
  every PR that touches capture/refund/deposit/Stripe code;

Must STOP and surface to Matt:

- anything touching credentials or secrets;
- any non-additive Prisma migration.
