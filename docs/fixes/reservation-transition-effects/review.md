---
stage: review
run: maintenance:reservation-transition-effects
date: 2026-10-05
reviewed-head: 1e8d20988 (branch refactor/transition-effects-pr3, draft PR #6061, merge base b50540242)
assumptions:
  - "Scope per the orchestrator: full three passes on PR #6061's diff vs merge base b50540242 (8 commits, 3.1-3.6 plus docs); a light design pass over the merged PR 2 transitions module (`services/reservations/src/transitions/**`) as a whole, since it is live in production. PR 1 and PR 2 diffs were already reviewed and merged and are not re-reviewed line by line."
  - "D8 chain ruling taken as the orchestrator-stated default (no artifact rules on it): the two D8 `replace-if-present` reminder replacements are independent; a failed day-before replacement must not suppress the day-of one. Code already agreed; pinned with a test rather than changed."
  - "stripe-flow-reviewer L1 (harness injects a DepositService fake but not payments) fixed here as a cheap test-only hardening, not deferred: it has no failing input today, but leaving it lets a future harness case make a real Stripe call on the placeholder key."
  - "The two Review commits (1980bf10b test-only; this docs commit) were not re-sent to the subagent reviewers: both are test/docs only with no production or money line. Ship confirms reviewer coverage of the final head per the brief's merge rule."
  - "Merge cleanliness checked with `git merge-tree --write-tree` against origin/main 17b1edceb (run #3's #6060). Textually clean; generated llms files are the one semantic-drift risk and are Ship's to regenerate after updating the branch."
---

# Review: PR 3 (payments) of one module owns what each reservation transition sets off

## Scope

- **PR #6061 full review:** `git diff b50540242 1e8d20988` — 3.1 `PaymentsPort` +
  `createInMemoryPayments`; 3.2 `verifyStripeWebhookSignature`; 3.3 `buildApp`
  builds one `StripeService` + one `DepositService`; 3.4 `depositService.` →
  injected `deposits` in cancellation / no-show / modification and the deposit
  routes, both singletons deleted; 3.5 route tests onto injected payments and
  real signed webhook payloads; 3.6 kill list. 30 non-generated files, 1974+/907-
  including docs and llms context.
- **Light design pass:** the PR 2 transitions module as merged and deployed —
  `transitions/{plan,run,index,ports,venue-policy,in-memory}.ts` and
  `transitions/adapters/*`.
- **Predecessor:** `verification.md` (21/21 PASS on `e6cb43abe`; its deviation
  assessment item 5 left the D8 chain question open for Review).
- **Required gates:** `reviewer` and `stripe-flow-reviewer` subagents on the
  PR #6061 diff, both briefed with the explicit `STRIPE_SECRET_KEY` checkpoint
  and the webhook-verification check.

## Required gates

| Gate                   | Verdict  | Score | Notes                                                                                                                                                                                                                                                                                        |
| ---------------------- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reviewer`             | **PASS** | 9/10  | No findings. Against 3.1-3.6: rename-only money diff, every importer injected, singletons gone, per-file `it(` counts identical across the 11 moved test files (only the 2 `constructWebhookEvent` cases dropped, replaced by 4 real-signature cases), no `.skip`/`.only`/ratchet loosening. |
| `stripe-flow-reviewer` | **PASS** | 9/10  | No critical/high/medium. Idempotency keys, integer-cents amounts, refund/forfeit origins and call ordering unchanged. Three lows, all test-only (L1 fixed here; L2, L3 deferred — see Findings).                                                                                             |

### STRIPE_SECRET_KEY checkpoint (breakdown 3.3) — CONFIRMED by both reviewers

- Env name and fallback identical: `app.ts:205-206`
  `new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder")` —
  the same expression as the deleted `stripe.ts:310` and `deposit.ts:1216`
  singletons at `b50540242`.
- Validation identical: the `getStripeConfig({ nodeEnv, secretKey:
process.env.STRIPE_SECRET_KEY, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET })`
  call (`app.ts:120-123`) is outside the changed hunks; `config/stripe.ts` diff is
  empty.
- No new secret, env name or provisioning: nothing under `infrastructure/`,
  `.github/`, `.env*` or any Dockerfile changes.
- Import-time → `buildApp`-time read has no production consequence (stripe-flow-reviewer):
  dev loads env via `tsx --env-file` before imports, prod gets DO env at process
  start; the key is now read at the same moment `getStripeConfig` validates it.

### Webhook verification — CONFIRMED by both reviewers

`routes/stripe-webhook.ts` keeps its guard order unchanged: empty/missing
`STRIPE_WEBHOOK_SECRET` → 503; missing/non-string `stripe-signature` → 400;
missing raw body → 500 (no re-serialisation fallback); then
`verifyStripeWebhookSignature` (static `Stripe.webhooks.constructEvent`, same
HMAC, no client) and a throw → 400; only then `webhookRouter.dispatch`. No
test-mode branch. `stripe-webhook-signature.test.ts` and every route case sign
real payloads with `generateTestHeaderString` (valid, tampered body, wrong
secret, missing header; 503-never-verifies when the secret is unset).

## D8 chain ruling (Verify's open flag)

**Ruling: yes — the second `log` reminder replacement is still attempted after
the first fails.** The day-before and day-of reminders are independent; a
failed day-before replacement (e.g. a transient Redis error on its `cancel`)
must not leave the day-of reminder at the old time. This also matches the
guest-modify precedent, whose reminder cancels were `allSettled`.

Code already agrees: `plan.ts` plans both D8 ops `background/log`, and
`run.ts`'s background chain continues past a `log` failure. Previously this was
pinned only compositionally (a plan-shape test plus a generic executor test).
Added in `1980bf10b`: `run.test.ts` "a failed day-before replacement does not
suppress the day-of replacement" composes `planEffects` + `runEffects` for a
real staff time change with the day-before `cancel` throwing, and asserts the
day-of reminder lands at the new delay (94h) with exactly one error logged.
Mutation check: switching the D8 ops to `propagate` in `plan.ts` turns it red
(`expected 1 to be 338400000`); reverted.

## Findings

No critical. No major.

### Minor: effects harness injected a DepositService fake but not payments (stripe-flow-reviewer L1)

- Scenario: `appOptions` from `test/effects-harness.ts` carried
  `services.depositService` but no `payments`, so `buildApp` built a real
  `StripeService` on `"sk_test_placeholder"`. A future harness case driving
  `POST /public/.../payment-intent` would make a real network call and fail on
  auth. It fails loudly, not falsely, and no current case reaches
  `fastify.payments`.
- Standard: none (no `docs/standards.json` in this repo).
- Decision: **fixed** in `1980bf10b` — the harness injects
  `createInMemoryPayments()` alongside the deposit fake (its `appOptions` type now
  includes `payments`). `pnpm --dir services/reservations test` → 117 files /
  1780 passed; `tsc --noEmit` clean.

### Minor: D8 chain independence was not pinned end to end

- Scenario: a refactor that marks the D8 ops `propagate` (or makes the chain stop
  at the first failure) would pass every existing test except the plan-shape
  string, and could be "fixed" by editing that expectation, leaving a day-of
  reminder at the old time after one Redis blip.
- Standard: none.
- Decision: **fixed** in `1980bf10b` (see D8 ruling above).

### Minor: in-memory payments defaults are happy-path (stripe-flow-reviewer L2)

- Scenario: `createInMemoryPayments` defaults `retrievePaymentIntent` to
  `{ status: "requires_capture" }` and `findDepositRefund` to `null`. A future test
  of a capture-verification path that forgets to script a response silently takes
  the "not captured / not refunded" branch.
- Standard: none.
- Decision: **deferred** — no current test is mis-served by the defaults (the
  reviewer matched `findDepositRefund → null` to the old `refunds.list → {data: []}`
  mock default, so behaviour coverage is unchanged); making defaults throw would
  ripple through every moved route test. Not money-affecting in production.

### Minor: in-memory payments does not model Stripe-side state (stripe-flow-reviewer L3)

- Scenario: capturing twice or refunding more than the deposit succeeds against the
  fake. The guards live in `DepositService` and its DB writes, which the tests do
  exercise; no test proves Stripe itself rejects a bad transition.
- Standard: none.
- Decision: **deferred** — by design (architecture `PaymentsPort` is a thin seam;
  money logic stays in `DepositService`). Same coverage as the old `vi.mock("stripe")`.

### Minor (design, PR 2 module): a policy-source failure drops live events too

- Scenario: `transitions/index.ts` `settle()` returns without running any effect
  when the `VenueEffectPolicySource` rejects. `venue-policy.ts` documents that
  suppression "never touches live SSE events". With today's only source,
  `allOutboundLive` (a constant), it cannot reject — no failing input now. But when
  `feature:live-demo-venue` adds a DB-backed source, a lookup failure would also
  drop the staff floor view's `reservation:*` events, contradicting the
  documented contract. Failing closed on messaging/jobs is right; events should
  still publish.
- Standard: none.
- Decision: **deferred** to the demo-venue run, which introduces the first
  rejecting source. Seed: on policy failure, plan as `suppressed` (events only)
  instead of returning.

### Noted, not fixed (out of scope per architecture.md "Kept as-is"; seed for the demo-venue run)

- Second `TwilioSmsAdapter` construction (`services/notifier-runtime.ts:71`,
  besides `notifications.ts:55`); `WaitlistNotifier`, win-back and `JobWorker`
  reminder delivery sit outside `VenueEffectPolicySource`, so "suppress all
  outbound for venue X" does not yet cover them.
- `ReservationEventEmitter.emitReservationUpdated` / `emitHoldCreated` /
  `emitHoldReleased` still have zero callers — pre-existing, not orphaned by this
  run.

## Passes with no findings

- **Correctness (PR #6061):** clean apart from the test-only minors above. Money
  diffs in `reservation-cancellation.ts`, `reservation-no-show.ts`,
  `reservation-modification.ts`, `deposit.ts`, `stripe-webhook.ts` and
  `public-deposits.ts` are rename + parameter threading only; exactly one
  `StripeService` and one `DepositService` reach routes, webhook router and
  transitions; the webhook router is built per plugin from injected deps after
  `fastify.services`/`fastify.payments` are decorated.
- **Security:** clean. Webhook verification on every path (above); no secret in
  code; no new input surface; error bodies unchanged.
- **Design (PR #6061):** matches architecture.md's `PaymentsPort` and composition
  root. One documented deviation, accepted: `StripePort =
Omit<PaymentsPort, "createPaymentIntent">` instead of a bare alias (breakdown
  `assumptions:`), which keeps `DepositService`'s six-method dependency exact and
  `deposit.test.ts` byte-identical.
- **Design (PR 2 module, light):** one table (`plan.ts`, 263 lines) read only by
  `planEffects`; one executor (`run.ts`, 100 lines) with explicit timing/onFailure
  per effect; verbs in `index.ts` run effects only after a committed write; venue
  policy read in exactly one place. Coherent with architecture.md; the only
  finding is the policy-failure minor above.

## Merge cleanliness vs origin/main

`origin/main` is `17b1edceb` (run #3's #6060, touches
`services/reservations/src/routes/guests.ts`, `packages/types`,
`packages/api-client`, `tools/route-contract` and llms files).
`git merge-tree --write-tree HEAD origin/main` → exit 0, tree `de13b3c7f`: **no
textual conflict**. #6060's `guests.ts` touches no deposit/Stripe import (its
only shared surface is `fastify.reservationEvents.emitLapsingGuests`, which PR 3
does not change). Both sides regenerate root and `services/reservations`
`llms.txt`/`llms-full.txt`, so **Ship must update the branch, `pnpm build
--filter @mbe/cli... && pnpm regen`, and commit any llms drift** before the final
`CI Gate`.

## Verdict

**Ready to ship. No unfixed critical; no major.** Two minors fixed in
`1980bf10b` (test-only), three minors deferred with reasons. Ship's remaining
items for breakdown 3.7: update the branch onto `origin/main` and regenerate
llms context; confirm `CI Gate` green on the final head; squash-merge with an
explicit `--subject`. Both required reviewer gates PASS with the
`STRIPE_SECRET_KEY` checkpoint explicitly confirmed.
