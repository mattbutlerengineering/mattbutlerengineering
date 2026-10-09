---
stage: verify
run: maintenance:reservation-transition-effects
date: 2026-10-04
verified-head: e6cb43abe (branch refactor/transition-effects-pr3, draft PR #6061, base origin/main b50540242)
assumptions:
  - "No prd.md (maintenance run). Criteria = defect.md target state + its Divergence ruling + architecture.md effects-table rows + every breakdown acceptance criterion across PR 1-3 + the autorun brief constraints, as the orchestrator instructed."
  - "Breakdown 3.7 (PR 3 open -> reviewed -> merged) is Ship's item, not Verify's. Verify ran against the PR 3 head with 3.7 open (protocol soft gate: verify the completed subset, noting the gap)."
  - "Regression demo = PR 1's 16 `it.fails` rows flipped to `it` and run against pre-PR-2 code (569598866) in a throwaway worktree, rather than transplanting PR 3's route files backwards: PR 3's harness injects ports that do not exist at 569598866, so the flipped PR 1 file is the faithful 'old code fails the new assertions' check."
  - "'Bodies unchanged since PR 1' is judged on `git diff -w` (whitespace-insensitive): prettier re-wrapped the three flipped tests whose titles had forced a multi-line `it.fails(` call."
  - "The second `TwilioSmsAdapter` (notifier-runtime.ts:71) and `WaitlistNotifier`/win-back/JobWorker staying outside the venue policy are not counted as failures: architecture.md 'Kept as-is' puts them out of scope explicitly. Recorded under Not verified / flags."
---

# Verification: one module owns what each reservation transition sets off

## Summary

**21 criteria: 21 PASS, 0 FAIL, 0 PENDING.** `CI Gate` settled SUCCESS on
#6061 head `e6cb43abe` before this artifact was committed (C21).

Verdict: the run's target state is met on the PR 3 head. All 46 entry-point
rows pass; the 16 rows that encode the ruling's deltas fail on pre-PR-2 code
for the right reason (missing live event / D8 reminder not replaced); money
and messaging row bodies are unchanged since PR 1; the dead singleton,
`BookingNotifier`, and the Stripe/Deposit singletons are gone; the
`STRIPE_SECRET_KEY` read is the identical expression and `config/stripe.ts`
is untouched. PR 2 is live in production. Six recorded failure-path
deviations are assessed below — none changes a money or guest-messaging
outcome; one is a wording deviation from breakdown 2.4 worth Review's eye.

All commands run in `.claude/worktrees/reservation-transition-effects` after
`pnpm install --frozen-lockfile && pnpm build --filter @mbe/cli...` (`exit=0`,
`Tasks: 6 successful, 6 total`).

## Criteria & evidence

### C1. Every transition entry point is pinned and green (46 rows, effects table)

- Check: `pnpm --dir services/reservations exec vitest run src/transitions/entry-points.test.ts`
- Evidence:
  ```
   Test Files  1 passed (1)
        Tests  46 passed (46)
  ```
  Rows cover every effects-table fact: cancelled ×3 doors (+ admin/owner/guest fee policy, free window, failed partial-refund abort), no-show (forfeit, partial fee, max(now,start), failed forfeit abort, SSE), staff-updated (COMPLETED post-visit on/off, SSE, D8 public/staff-created, no message, other-field SSE, status+time one event), guest-modified (double email quirk, non-time change, SSE), hold-confirmed ×3 doors (+24h/past-start reminder rules), created (walk-in, staff), attendance-confirmed (PENDING→CONFIRMED, already CONFIRMED), floor-plan clone, lapsing scan.
- Result: PASS

### C2. Money and messaging row bodies unchanged since PR 1

- Check: `git diff -w 569598866 HEAD -- services/reservations/src/transitions/entry-points.test.ts`, filtered to non-comment lines.
- Evidence (complete non-comment diff):
  ```
  -vi.mock("../services/deposit.js", async (importOriginal) => {
  -  const { recordingDepositService } = await import("../test/effects-harness.js");
  -  return {
  -    ...(await importOriginal<Record<string, unknown>>()),
  -    depositService: recordingDepositService,
  -  };
  -});
  -    it.fails("staff-delete emits reservation:cancelled (D1)", async () => {
  +    it("staff-delete emits reservation:cancelled (D1)", async () => {
  ... (16 such it.fails -> it flips, one per ruling delta; the three multi-line
       titles collapse `it.fails(\n "title",\n async () => {` to one line and
       `}\n );` to `});`)
  ```
  `git show 569598866:<file> | grep -c 'it\.fails('` → `16`; HEAD has zero `it.fails(` calls (one hit is the header comment). The only other change is the removal of the temporary deposit `vi.mock` (breakdown 3.4/3.6) and the header comment. No money or messaging `it` row was edited.
- Result: PASS

### C3. Regression demo — the new assertions fail on the old code

- Check: throwaway worktree at `569598866` (main after PR 1, before PR 2); `pnpm install --frozen-lockfile`, built workspace deps (`pnpm turbo build --filter '@mbe/reservations-service^...'`, 11/11); ran PR 1's file as-is, then a copy with `it.fails(` → `it(`. Worktree removed afterwards.
- Evidence:
  ```
  # as committed in PR 1
   Test Files  1 passed (1)
        Tests  30 passed | 16 expected fail (46)
  # flipped
   Test Files  1 failed (1)
        Tests  16 failed | 30 passed (46)
         × staff-delete emits reservation:cancelled (D1)
         × guest-manage emits reservation:cancelled (D1)
         × emits reservation:updated (D6)
         × COMPLETED emits reservation:updated (D7)
         × time change on a publicly booked reservation replaces its reminders at the new time (D8)
         × time change emits reservation:updated (D8)
         × any other field change emits reservation:updated
         × status and time changed together emit exactly one reservation:updated
         × emits reservation:updated
         × public-booking delivers hold:confirmed to live subscribers (D5)
         × staff-hold delivers hold:confirmed to live subscribers (D5)
         × public-hold delivers hold:confirmed to live subscribers (D5)
         × staff create emits reservation:created
         × PENDING → CONFIRMED emits reservation:updated
         × cloning a floor plan delivers floor-plan:created to live subscribers (D9)
         × the on-demand lapsing scan delivers guest:lapsing to live subscribers (D9)
     1 AssertionError: expected [] to deeply equal [ 'guest:lapsing' ]
     3 AssertionError: expected [] to deeply equal [ 'hold:confirmed' ]
     2 AssertionError: expected [] to deeply equal [ 'reservation:cancelled' ]
     1 AssertionError: expected [] to deeply equal [ 'reservation:created' ]
     7 AssertionError: expected [] to deeply equal [ 'reservation:updated' ]
     1 AssertionError: expected [] to deeply equal [ Array(1) ]
     1 AssertionError: expected { …(2) } to deeply equal { …(2) }
  ```
  Every failure is on the effect assertion (no live event; D8 reminders left at the old delay), none on setup or status code. Same 46 rows pass on HEAD (C1).
- Result: PASS

### C4. Ruling — live updates everywhere (D1, D3, D5, D6, D7, D8, D9 + staff create / guest modify / attendance)

- Check: C1 + C3 rows named with each D; `transitions/plan.test.ts` one case per table row.
- Evidence: the 16 flipped rows above pass on HEAD (`Tests 46 passed (46)`); walk-in `reservation:created + table:updated` row (D3, kept) passes.
- Result: PASS

### C5. Ruling — guest messaging unchanged (no new emails/SMS; D2, D4 kept)

- Check: entry-point guard rows (recorded at the `NotificationDispatcher` seam behind the real notifiers, per breakdown assumption).
- Evidence: passing rows `staff create sends no message and schedules no job (D2 kept)`, `staff-hold`/`public-hold` no message/no job, `time change sends the guest no message`, `time change on a staff-created reservation (no reminders) creates none`, `forfeits a held deposit and sends no message and no job`, `time change sends confirmation AND modified emails (today's quirk)`; all unchanged since PR 1 (C2) and green at 569598866 (C3, 30 passed).
- Result: PASS

### C6. Ruling — money unchanged (byte-for-byte)

- Check: C2 (money rows unchanged + green); `services/deposit.test.ts` vs main and vs PR 1; breakdown PR 3 notes on the cancellation/no-show/modification diffs.
- Evidence:
  ```
  $ git diff origin/main -- services/reservations/src/services/deposit.test.ts | wc -l
         0
  $ git diff 569598866 HEAD -- services/reservations/src/services/deposit.test.ts | wc -l
         0
  ```
  Money rows (exact op + args per door: `refund`, `refundPartial`, `forfeit(id,"no_show")`, capture-then-partial-refund, abort-on-failure) pass on HEAD and pre-PR-2 alike.
- Result: PASS

### C7. Ruling — D8 replace-if-present (never create)

- Check: entry-point rows + `plan.test.ts` + `run.test.ts`.
- Evidence: passing `time change on a publicly booked reservation replaces its reminders at the new time (D8)` (delays `(96-24)h` / `(96-2)h`) and `time change on a staff-created reservation (no reminders) creates none`; `plan.test.ts:115 "time change: replace-if-present both reminders at the new time, never schedule (D8)"`; `run.test.ts:139 "replace-if-present schedules only when cancel removed an existing job"`. Executor: `if (await ports.jobs.cancel(op.jobId)) { await ports.jobs.schedule(...) }` (`transitions/run.ts`). `packages/jobs` `Tests 29 passed (29)` incl. boolean `cancel`.
- Result: PASS

### C8. Dead `events.ts` singleton gone; emits through the live emitter

- Check: grep in `services/reservations/src`.
- Evidence:
  ```
  $ grep -n "^export" services/events.ts
  14:export type ReservationEventType = SseEventName;
  17:export type ReservationEvent = SseEvent;
  25:export class ReservationEventEmitter extends EventEmitter {
  ```
  No `export const reservationEvents`, no free helpers. Every `emitFloorPlanCreated`/`emitLapsingGuests` call goes through the live instance: `routes/floor-plans.ts:193 fastify.reservationEvents.emitFloorPlanCreated(cloned)`, `routes/guests.ts:489 fastify.reservationEvents.emitLapsingGuests(...)`, `app.ts:316 reservationEvents.emitLapsingGuests(...)`. Value imports of `events.js` in non-test source: only `app.ts:55 import { ReservationEventEmitter }` (it constructs the one emitter); the rest are `import type`. `emitReservationUpdated`/`emitHoldCreated`/`emitHoldReleased` remain as class methods with no callers (pre-existing; out of scope, not orphaned by this change).
- Result: PASS

### C9. `BookingNotifier` gone

- Evidence:
  ```
  $ ls services/booking-notifications.ts
  ls: services/booking-notifications.ts: No such file or directory
  $ grep -rn "BookingNotifier" --include='*.ts' services/reservations/src
  (no output)
  ```
  Three prose mentions of the old file name remain in comments (`transitions/plan.ts:123`, `adapters/dispatcher-messaging.ts:19`, `win-back.test.ts:109`) — provenance notes, not imports.
- Result: PASS

### C10. Stripe injectable everywhere; no singleton in routes

- Evidence:
  ```
  $ grep -rnE "stripeService\b|export const depositService" --include='*.ts' services/reservations/src
  (only services/stripe.test.ts — a local `let stripeService = new StripeService("sk_test_fake_key")`)
  $ grep -rnE 'from "\.\./services/(stripe|deposit)\.js"' services/reservations/src/routes   (non-test)
  routes/deposit-transition-handler.ts:3: import { DepositTransitionError, type DepositService }
  routes/public-deposits.ts:4:  import { calculateDepositAmount }
  routes/public-deposits.ts:5:  import { StripeOperationError }
  routes/stripe-webhook.ts:4:   import { verifyStripeWebhookSignature }
  routes/stripe-webhook.ts:5:   import type { DepositService }
  routes/deposits.ts:4:         import { DepositNotFoundError }
  ```
  Only pure helpers, error classes and types. Constructions in non-test source: `app.ts:206 options.payments ?? new StripeService(...)` and `app.ts:211 options.services?.depositService ?? new DepositService(payments)` — exactly once each.
- Result: PASS

### C11. No `vi.mock` of `deposit.js`; `vi.mock("stripe")` only where kept

- Evidence:
  ```
  $ grep -rnE 'vi\.mock\([^)]*deposit\.js' services/reservations/src
  (no output)
  $ grep -rln 'vi.mock("stripe"' services/reservations/src
  services/stripe.test.ts
  services/deposit.test.ts
  $ grep -n 'vi.mock("stripe"' services/reservations/src/services/deposit.test.ts
  37: * with. No `vi.mock("stripe")` needed — DepositService never touches the
  ```
  `deposit.test.ts` hit is a prose comment in the byte-identical file; the only real SDK mock is the kept `services/stripe.test.ts`.
- Result: PASS

### C12. `STRIPE_SECRET_KEY` env name, fallback and validation unchanged

- Evidence:
  ```
  $ git diff origin/main -- services/reservations/src/config/stripe.ts | wc -l
         0
  # before (origin/main)
  services/stripe.ts:310  export const stripeService = new StripeService(
  services/stripe.ts:311    process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder"
  services/deposit.ts:1216  new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder")
  # after
  app.ts:206  options.payments ?? new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");
  app.ts:120-124  getStripeConfig({ nodeEnv: process.env.NODE_ENV, secretKey: process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET })  (unchanged lines)
  $ git diff origin/main --stat -- infrastructure .github '*.env*' '**/Dockerfile'
  (no output)
  ```
- Result: PASS

### C13. Venue effect policy expressible in one place

- Evidence: `transitions/venue-policy.ts` defines `VenueEffectPolicySource` and `allOutboundLive`; the only reader is `plan.ts:261 if (policy.outbound === "live") return planned;`; wired once at `app.ts:233 policy: allOutboundLive`. `plan.test.ts:292 "suppressed drops every message and job but keeps live events (%s)"` passes.
- Result: PASS (scope note: WaitlistNotifier, win-back, JobWorker delivery are outside the policy by design — see Not verified)

### C14. Ports constructed once in `buildApp`; scheduler injectable

- Evidence: `app.ts:166 createNotifierRuntime()`, `:175 options.reservationEvents ?? new ReservationEventEmitter()`, `:206` payments, `:211` deposits, `:222 createReservationTransitions({ ... jobs: options.jobs ?? notifierRuntime.scheduler ... })` (`:230`); `ReservationsAppOptions.jobs?: JobsPort` at `:94`.
- Result: PASS

### C15. Affected test suites green

- Evidence:
  ```
  pnpm --dir services/reservations test   exit=0
   Test Files  117 passed | 4 skipped (121)
        Tests  1779 passed | 150 skipped (1929)
  pnpm --dir packages/jobs test           exit=0
        Tests  29 passed (29)
  pnpm --dir packages/notifications test  exit=0
        Tests  119 passed (119)
  ```
- Result: PASS

### C16. Typecheck and lint

- Evidence:
  ```
  pnpm typecheck  exit=0   Tasks:    52 successful, 52 total
  pnpm lint       exit=0   Tasks:    52 successful, 52 total
  ```
  (`@mbe/hospitality` 137 warnings, 0 errors — pre-existing, outside this diff.)
- Result: PASS

### C17. Generated artifacts current

- Evidence:
  ```
  pnpm regen --check  exit=0
  All generated artifacts are up to date.
  ```
- Result: PASS

### C18. DB-backed RLS sweep (CI-only) on #6061

- Check: job `RLS Integration (owner role, …)` (id 111647443711) in run 37274005666 on head `e6cb43abe`; log fetched via `gh api …/actions/jobs/111647443711/logs`.
- Evidence:
  ```
   ✓ src/routes/rls-venue-resolution.integration.test.ts (30 tests)
   ✓ src/routes/rls-isolation.integration.test.ts (20 tests)
   ✓ src/routes/rls-route-sweep.integration.test.ts (90 tests)
   ✓ src/routes/rls-owner-enforcement.integration.test.ts (6 tests)
   Test Files  5 passed (5)
        Tests  152 passed (152)
  ```
  Sweep includes `[ok] DELETE /api/v1/reservations/:id`, `[ok] POST /api/v1/deposits/:id/forfeit`, `[ok] PATCH /public/v1/reservations/manage`.
- Result: PASS

### C19. Run #4 venue-context lines untouched

- Check: added/removed lines in non-test `services/reservations/src/**/*.ts` matching `resolveVenueId|runWithVenueContext|loadInVenueContext|requireVenueAccess|isVenueMember|createProblemDetails|reply.(code|status)`, across PR 2 + PR 3 (`569598866..HEAD`).
- Evidence:
  ```
  $ git diff 569598866 HEAD -- <non-test src> | grep ^[-+] | grep -cE '<pattern>'
  1
  # the one hit, in PR 2:
  +++ b/services/reservations/src/transitions/index.ts
  + * run inside the caller's venue context (ADR-026 `runWithVenueContext`).
  # PR 3 alone (b50540242..HEAD): 0 hits
  ```
  The only hit is a doc comment in a new file. RLS sweep (C18) green over the moved routes.
- Result: PASS

### C20. PR 2 in production

- Check: `deploy-services.yml` run on `b50540242`; DO active deployment; live health.
- Evidence:
  ```
  37270158611 b50540242 completed success 2026-10-05T05:58:37Z push
    Wait for CI: success 06:13:53Z
    Deploy API Services: success 06:20:05Z
    Post-Deploy Verification: success
    Report Deploy Health: success
  doctl apps list-deployments: 73afd72c… manual ACTIVE 2026-10-05 06:14:08 UTC
  GET https://api.mattbutlerengineering.com/api/v1/reservations/health
    522  (first probe)
    200 ×7 (0.18–0.31s); body {"status":"ok",…"database":{"status":"ok"…}}
  ```
  The active DO deployment was created inside the `Deploy API Services` window for `b50540242`, so the 200 is served by PR 2's build, not an older container. One Cloudflare 522 on the first probe, then 7/7 200 — noted, not attributed.
- Result: PASS. Live SSE delivery of `floor-plan:created` / `guest:lapsing` / `hold:confirmed` to real clients is now plausible but **not observed** — Operate's to measure.

### C21. `CI Gate` on #6061 head `e6cb43abe`

- Check: waited on run 37274005666 (`pull_request` event, head `e6cb43abe`) to complete; `gh pr checks 6061`; commit statuses on the head SHA. Not dispatched — a real `pull_request` run existed.
- Evidence:
  ```
  run 37274005666 conclusion: success
  Test (Node 22): success
  Build: success
  CI Gate: success
  $ gh pr checks 6061 | grep "CI Gate"
  CI Gate  pass  0   .../actions/runs/37274005666  CI Gate success   (commit status)
  CI Gate  pass  7s  .../actions/runs/37274005666/job/111650248939      (check run)
  $ gh api .../commits/e6cb43abe.../statuses
  CI Gate: success
  $ gh pr view 6061 --json mergeStateStatus
  CLEAN
  ```
- Result: PASS

## Deviation assessment (PR 2's recorded failure-path deviations, against the ruling)

Flagged, not fixed.

1. **COMPLETED post-visit venue read moved to background.** A venue-read failure after the committed COMPLETED write now logs instead of returning 500. Email outcome identical (no venue → no email either way); money untouched. Within the ruling; the response now reflects the committed write. Observable change: HTTP status on a pathological DB failure only. **Consistent.**
2. **Guest-modify `booking-modified` venue read `await`/`log` (was 500).** Same shape as 1 — the modification is already committed; the email is not sent either way. **Consistent.**
3. **Live-event publish `await`/`log`: an SSE listener throwing after a committed write no longer 500s.** Supports "live updates everywhere" without letting SSE break writes. Not money/messaging. **Consistent.**
4. **Reminder cancels on cancel run in sequence; a rejection is logged (was `allSettled`, silent).** Both cancels still attempted (executor: `log` failure → next effect runs); only observability improves. **Consistent.**
5. **Background chain: a `log` failure continues the chain, a `propagate` failure stops it.** Breakdown 2.4's text said the chain "stops at first failure and logs once"; implementation differs. It reproduces today's guest-modify chain (cancels were `allSettled`, confirmation/schedule failure stopped it) — so it is the version that keeps messaging unchanged. In the public-booking chain both confirmation and schedules are `propagate` (plan.ts:152-153), so a failed confirmation still prevents reminders, as today. **Consistent with the ruling; a deviation from breakdown 2.4's wording — Review should confirm the D8 staff-time-change chain (two independent `log` replacements) is meant to attempt the second after the first fails.**
6. **Messaging failures log on the app logger (was the request logger for modify); D8 past-moment reminder becomes plain `cancel`.** The first is log routing only. The second removes a stale reminder whose new time has passed and never creates one — within "replace-if-present, never create". **Consistent.**

None changes a money operation or adds a guest email/SMS.

## Failures

None.

## Not verified

- **`CI Gate` after any further push** — C21 is for head `e6cb43abe` only; the docs commit adding this file creates a new head, and Ship must confirm `CI Gate` on the final head before merge.
- **Breakdown 3.7** (PR 3 reviews + merge) — Ship's item. The 3.3 `STRIPE_SECRET_KEY` checkpoint must still be confirmed explicitly by both `reviewer` and `stripe-flow-reviewer`; C12 is Verify's evidence for them, not a substitute.
- **Live SSE delivery in production** of the newly routed events — plausible since PR 2 deployed (C20), not observed. Operate.
- **D8 in production** (a real staff time change moving a real reminder) — not exercised; covered only by tests.
- **Out of scope, still present (flag for the demo-venue run):** second `TwilioSmsAdapter` construction (`services/notifier-runtime.ts:71`, besides `notifications.ts:55`); `WaitlistNotifier`, win-back and `JobWorker` reminder delivery are not under the venue policy source, so "suppress all outbound for venue X" does not yet cover them (architecture.md "Kept as-is" says so).
- **Uncalled class methods** `emitReservationUpdated`, `emitHoldCreated`, `emitHoldReleased` remain on `ReservationEventEmitter` — pre-existing, not orphaned by this run; noted, not deleted (brief: inert surfaces noted, not deleted unless orphaned).
