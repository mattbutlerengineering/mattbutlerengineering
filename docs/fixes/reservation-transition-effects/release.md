---
stage: ship
run: maintenance:reservation-transition-effects
date: 2026-10-05
pr: 6061
merge-commit: 241855af1
assumptions:
  - "Release authorization is the autorun brief's (Matt, 2026-10-04), plus the orchestrator's per-PR rule for PR 3: squash-merge only after `reviewer` PASS and `stripe-flow-reviewer` PASS on the FINAL head, a `CI Gate` check run SUCCESS on that head, and no unfixed critical. All four were checked before the merge. No live user input was taken."
  - "Both reviewer subagents were re-dispatched on the final head `f15e29801`, which is the merge of origin/main into the branch. Their earlier passes were on `1e8d20988`, which predates Review's two commits (`1980bf10b` test, `ac3af59c0` docs) and the merge. Each was asked to confirm the 3.3 `STRIPE_SECRET_KEY` checkpoint explicitly, and each did."
  - "origin/main had moved (`17b1edceb` #6060 and `96cc7b478` #6062 past the PR's last base). It was merged in, not rebased, so the reviewed commits keep their SHAs. The merge was textually clean, and `pnpm regen` after it produced no llms drift, so there was no regen commit to add."
  - "The webhook signature guard could not be probed live as a 400. Production has no `STRIPE_*` env var in the DO app spec (key names checked only; no values read), so `routes/stripe-webhook.ts` takes its fail-closed branch and answers 503 'Stripe webhooks are not configured' BEFORE the signature check. DO App Platform replaces an upstream 503 with its own 504 error page ('via_upstream (503 -)'). The probe was run before AND after the merge and the response is identical. The signature path itself is proven by `stripe-webhook-signature.test.ts` (real HMAC signatures), not by production. Recorded as not verified live."
  - "The public deposits probe sent an empty JSON body to a non-existent slug. It is rejected by schema validation (400) before any lookup or Stripe call, so it can never reach Stripe. That is deliberate: the brief forbids real Stripe calls. It proves the route is registered and answers with its usual problem shape, nothing deeper."
  - "`gh pr merge --delete-branch` exited 1 after the merge, because it tried to check out local `main`, which is held by another worktree (`.claude/worktrees/booking-guest-reuse`). The server-side merge and remote branch delete had already happened (`gh pr view` MERGED; `git ls-remote` shows no `refactor/transition-effects-pr3`). Nothing was retried."
  - "No version, tag or changeset. `services/reservations` is a private workspace service deployed by `deploy-services.yml`, and nothing is published to npm."
  - "Backlog seeds are appended at the end of `docs/backlog.md` in the protocol's `(from: maintenance:reservation-transition-effects)` form. Producers append and never reorder."
---

# Release: one module owns what each reservation transition sets off (`maintenance:reservation-transition-effects`)

This run shipped in three squash merges, each from fresh `origin/main` after the
previous one had merged and deployed:

| PR    | Merge       | Merged (UTC)      | What                                                                                                                                                                                                                                            |
| ----- | ----------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #6051 | `569598866` | 2026-10-05 04:10Z | Tests first. The transition suite (`transitions/entry-points.test.ts`) pins today's behaviour at every entry point; 16 `it.fails` rows encode the ruling's deltas. No production change (one metrics baseline line).                            |
| #6055 | `b50540242` | 2026-10-05 05:58Z | Effects. The `transitions` module (`plan.ts` table + `run.ts` executor) is live; every route calls one verb; SSE fires everywhere (D1, D3, D5–D9); `BookingNotifier` and the dead `events.ts` singleton are gone. Money untouched.              |
| #6061 | `241855af1` | 2026-10-05 07:58Z | **This release.** Payments injected everywhere: `PaymentsPort` + in-memory payments, `verifyStripeWebhookSignature`, one `StripeService` + one `DepositService` built in `buildApp`, both Stripe/Deposit singletons deleted. Money rename-only. |

## Pre-flight

- [x] **Verification green.** `verification.md`: 21/21 PASS on `e6cb43abe`.
      Its two Ship-owned open items (CI Gate on the final head; 3.7 reviews and
      merge) are closed below.
- [x] **Review gate.** `review.md`: no critical, no major. Two minors fixed in
      `1980bf10b` (test-only); three deferred with reasons (seeded below).
- [x] **Branch updated with main, every gate re-run on the merge.**
      `git merge origin/main` → `f15e29801` (brought in #6060 `17b1edceb` and
      #6062 `96cc7b478`; textually clean). Then:
  - `pnpm install --frozen-lockfile` exit 0; `pnpm build --filter @mbe/cli...` exit 0; `pnpm regen` exit 0 with **no working-tree change** (no llms drift, so no regen commit).
  - `services/reservations` test: 117 files passed / 4 skipped; 1780 tests passed / 150 skipped.
  - `packages/jobs` test: 29 passed. `packages/notifications` test: 119 passed.
  - `typecheck` (tsc --noEmit) exit 0 in all three; `lint` exit 0 in all three.
  - `pnpm regen --check`: "All generated artifacts are up to date."
  - Pushed `ac3af59c0..f15e29801`; `git ls-remote` confirmed `f15e29801` on the remote branch.
- [x] **Required reviewers on the final head `f15e29801`** (diff `96cc7b478..f15e29801`):

  | Gate                   | Verdict  | Score  | Notes                                                                                                                                                                                                                                                                                                                                                                                                       |
  | ---------------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `reviewer`             | **PASS** | 9/10   | No issues. 3.1–3.7 met; no remaining `stripeService`/`depositService` importers repo-wide; `git show --remerge-diff` on the merge empty; main's #6060 touches nothing deposit/Stripe. 1 point off because the AC's literal `vi.mock("stripe")` grep also hits a doc comment in `deposit.test.ts:37` (not a mock).                                                                                           |
  | `stripe-flow-reviewer` | **PASS** | 9.5/10 | No critical/high/medium. Webhook verification intact (raw body, fail-closed empty secret, throw → 400); idempotency keys, integer cents, refund/forfeit/capture ordering unchanged; merge adds no money-path interaction. One low, pre-existing: ~20 tests call `buildApp` without `payments` and so build a real `StripeService` on the placeholder key, though none reaches a Stripe path (seeded below). |

  **`STRIPE_SECRET_KEY` checkpoint (3.3), confirmed by both:** `app.ts:206`
  is `options.payments ?? new StripeService(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder")`,
  byte-identical to the two deleted module singletons; `getStripeConfig` at
  `app.ts:120` is outside the diff; `src/config/stripe.ts` has a zero-line diff;
  nothing under `infrastructure/`, `.github/`, `.env*` or a Dockerfile changed.
  The one behaviour change is timing: the key is read when `buildApp` runs, not
  at module load. Same value in production.

- [x] **`CI Gate` SUCCESS on the final head.** Check run `CI Gate` on
      `f15e29801` → `completed success` (CI run 37279577071, real
      `pull_request` event; no dispatch needed). `gh pr checks 6061`: no
      failing check; the rest pass or skip by design.
- [x] **No secrets in the diff; no new configuration.** Secret Scan passed on
      the PR (37279577128) and on the main push (37280780813). No env var name
      added (checkpoint above).
- [x] **Migrations/data.** None in any of the three PRs: no Prisma schema or
      migration file in any diff.
- [x] **Rollback plan concrete** (below).

## Rollback plan

PR 3 is independent of anything merged after it, and reverting it alone is safe:
it restores the two module singletons with the identical `STRIPE_SECRET_KEY`
expression, so production behaviour is unchanged either way.

```bash
# from a fresh worktree off origin/main (never the main checkout)
git fetch origin
git switch -c revert/transition-effects-pr3 origin/main
git revert --no-edit 241855af1          # PR 3 squash commit
pnpm install --frozen-lockfile
pnpm build --filter @mbe/cli... && pnpm regen   # commit any llms drift by explicit path
pnpm --dir services/reservations test && pnpm --dir services/reservations typecheck
git push -u origin revert/transition-effects-pr3
gh pr create --title "revert: #6061 inject payments everywhere" --body "Revert of 241855af1"
# merge on CI Gate green; deploy-services.yml redeploys reservations-api on push
```

Do **not** revert PR 2 (`b50540242`) as a rollback of PR 3. PR 2 deleted the dead
`events.ts` singleton and moved every emit onto the live emitter; reverting it
restores a singleton with zero subscribers, so `floor-plan:created`,
`guest:lapsing` and `hold:confirmed` silently stop reaching the staff floor view
again, and the D8 reminder fix is lost. If PR 2 itself must go, revert PR 3
first (it builds on PR 2's ports), then PR 2, and expect those regressions.
PR 1 (`569598866`) is tests only; reverting it changes nothing in production.

Deploys are CI-only (repo policy), so there is no manual DO rollback step: the
revert lands on `main` and `deploy-services.yml` redeploys `reservations-api`
on that push. Watch its `Deploy API Services` job, not just the workflow
conclusion (the circuit breaker can make a run green-but-empty).

## Release log

1. `git merge --no-edit origin/main` in the run worktree → `f15e29801`, clean.
2. `pnpm install --frozen-lockfile` → 0; `pnpm build --filter @mbe/cli...` → 0; `pnpm regen` → 0, no drift.
3. Tests / typecheck / lint / `pnpm regen --check` on `f15e29801` → all green (counts in Pre-flight).
4. `git push origin refactor/transition-effects-pr3` → `ac3af59c0..f15e29801`; `git ls-remote` → `f15e29801`.
5. `reviewer` and `stripe-flow-reviewer` dispatched in parallel on `96cc7b478..f15e29801` → PASS 9/10, PASS 9.5/10.
6. Polled the `CI Gate` check run on `f15e29801` → `completed success` (run 37279577071).
7. `gh pr view 6061 --json headRefOid` → `f15e29801` (head unchanged since review).
8. `gh pr ready 6061` → marked ready.
9. `gh pr merge 6061 --squash --subject "refactor(reservations): inject payments everywhere and delete the Stripe singletons (#6061)" --delete-branch`
   → merged server-side at 2026-10-05T07:58:32Z as `241855af1`; the command then
   exited 1 on a local `git checkout main` (held by another worktree). Remote
   branch deleted (`git ls-remote` empty). Not retried.
10. `git fetch && git log origin/main -1` → `241855af1 refactor(reservations): inject payments everywhere and delete the Stripe singletons (#6061)`.
11. Push workflows on `241855af1`: Secret Scan success (37280780813), Release success (37280780770), CI (37280780788) success, Deploy Services (37280780816) success.

## Deploy evidence (all three PRs)

`deploy-services.yml` job conclusions per merge commit. `Deploy Blocked` is the
circuit-breaker branch: `skipped` means the breaker did not block, so `Deploy API
Services` actually ran (not the green-but-empty case).

| PR    | Merge       | Run         | Circuit Breaker | Wait for CI | Deploy Blocked | Deploy API Services | Post-Deploy Verification | Report Deploy Health |
| ----- | ----------- | ----------- | --------------- | ----------- | -------------- | ------------------- | ------------------------ | -------------------- |
| #6051 | `569598866` | 37262340475 | success         | success     | skipped        | success 04:24:46Z   | success                  | success              |
| #6055 | `b50540242` | 37270158611 | success         | success     | skipped        | success 06:20:05Z   | success                  | success              |
| #6061 | `241855af1` | 37280780816 | success         | success     | skipped        | success 08:13:00Z   | success                  | success              |

No other deploy workflow applies. Outside `services/reservations/**`, docs and llms
context, the three PRs touched only `metrics/ai-antipattern-baselines.json` (PR 1)
and `packages/jobs/src/scheduler{,.test}.ts` (PR 2, a server-side package bundled
into the DO service images). PR 3 touched nothing outside the service. No static
site bundles any of it, so no paths-filter dispatch was needed.

## Post-release checks

Probes resolve through `dig @1.1.1.1` and `curl --resolve` (the LAN resolver
sinkholes some hosts). Host `api.mattbutlerengineering.com` → `172.66.0.96`.

DO deployment serving after PR 3: `doctl apps list-deployments` →
`b3b3fef4…` cause `manual`, phase **ACTIVE**, created 2026-10-05 08:07:14Z,
inside `Deploy API Services`' window for `241855af1` (07:58→08:13Z). The paired
"app spec updated" deployment `440ea288…` is CANCELED (the known doctl/Pulumi
pairing, gotchas § CI). The previous active deployment `4df92d54…` (07:14Z) is
SUPERSEDED. So the responses below come from PR 3's build, not an older container.

| Check                                                                              | Before merge (07:46Z, PR 2 build + #6060)                                                     | After deploy (08:27Z, PR 3 build)                | Verdict                                          |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `GET /api/v1/reservations/health`                                                  | 200 ×2; `status: ok`, `database.status: ok`                                                   | 200 ×3 (0.33–0.39s); `{"status":"ok","db":"ok"}` | **PASS**                                         |
| `POST /api/v1/stripe/webhook`, JSON `{}`, no `stripe-signature`                    | 504 (Cloudflare), 0.17s                                                                       | 504                                              | **Unchanged; guard not live-observable**         |
| same, `stripe-signature: t=1,v1=deadbeef`                                          | 504                                                                                           | 504                                              | Unchanged                                        |
| same, direct to DO origin `…-x6iga.ondigitalocean.app`                             | DO error page, `via_upstream (503 -)`                                                         | `via_upstream (503 -)`                           | Unchanged: the app answers 503                   |
| `POST /public/v1/venues/ship-probe-nonexistent/deposits/payment-intent`, body `{}` | 400 problem, `Validation failed: 'reservationId' must have required property 'reservationId'` | identical 400 problem                            | **PASS** (route registered, usual non-5xx shape) |
| `POST /api/v1/stripe/webhook`, empty body, no content-type                         | 415                                                                                           | not re-run                                       | —                                                |

**What the webhook result means.** The 504 is not a PR 3 defect and not a new
condition. The DO origin shows `via_upstream (503 -)`: the app itself answered
503, and DO swapped in its own error page. The only 503 in the route is the
fail-closed branch `if (!webhookSecret)` → "Stripe webhooks are not configured",
which runs before the signature check. The DO app spec carries **no** `STRIPE_*`
env var (key names listed; no values read), so `STRIPE_WEBHOOK_SECRET` is unset in
production. The response is byte-for-byte the same before and after the merge.
So production cannot show a 400 from the signature guard until Stripe is
configured. The guard is proven by `stripe-webhook-signature.test.ts` (real
`generateTestHeaderString` HMACs: valid, tampered, wrong secret, missing header)
and by both reviewers, not by a live probe.

No Stripe API call was made by any probe. The deposits probe fails schema
validation before any lookup.

`CI` on the main push (37280780788) concluded **success**, so `main` stays green.

## Outcome

**Shipped cleanly, with two recorded hiccups.** All three PRs are on `main` and
deployed. `Deploy API Services` really ran for each one (the breaker did not
block). PR 3's build is the active DO deployment, health and DB are ok, and the
public deposits route answers its usual 400 problem.

Hiccups:

1. `gh pr merge --delete-branch` exited 1 after a successful server-side merge,
   because local `main` is held by another worktree. The merge and the remote
   branch delete had both happened. Nothing was retried.
2. The webhook signature guard could not be observed live: production has no
   Stripe configuration, so the route fails closed with 503 (shown by DO as 504)
   before the signature check. The response was the same before and after.

Breakdown item 3.7 is checked. Hand off to **Operate**.

## Open items

- **Live SSE delivery is now Operate-observable.** Run #2's claim
  (`maintenance:sse-event-catalog`) that `floor-plan:created`, `guest:lapsing` and
  `hold:confirmed` reach the staff floor view depended on this run routing those
  emits onto the live emitter. PR 2 did that and is deployed; nobody has watched a
  real client receive them yet.
- **D8 in production** (a real staff time change replacing a real reminder) has
  not been exercised. Tests only.
- **Webhook signature guard is not live-verifiable** while production has no
  Stripe configuration (see assumptions). Deposits are not live in production at
  all, so PR 3's money paths have no production traffic to observe either.
- **Run #4 `venue-scoped-routes` may start Implement** now that this run has merged
  (brief sequencing). Its venue-context lines were left byte-identical (verification C19).
- **`feature:live-demo-venue`** stays paused until run #4 lands too; when it
  resumes at Architect, the seeds below about the venue policy are its inputs.

## Backlog seeds (appended to `docs/backlog.md`)

1. On a `VenueEffectPolicySource` failure, plan the transition as `suppressed`
   (live events only) instead of returning from `settle()` with no effects — today
   a lookup failure would drop staff SSE too, contradicting `venue-policy.ts`.
   Unreachable until the demo-venue run adds the first rejecting source.
2. Bring the second `TwilioSmsAdapter` (`notifier-runtime.ts:71`),
   `WaitlistNotifier`, win-back and `JobWorker` reminder delivery under the venue
   effect policy, so "suppress all outbound for venue X" is actually complete — for
   the demo-venue run.
3. Delete `ReservationEventEmitter.emitReservationUpdated` / `emitHoldCreated` /
   `emitHoldReleased` (zero callers) or wire them to real transitions.
4. Harden in-memory payments: make `createInMemoryPayments` defaults explicit or
   throwing for capture-verification ops (L2), and default `buildApp`'s `payments`
   to the in-memory fake under test so ~20 suites stop building a real
   `StripeService` on the placeholder key.
