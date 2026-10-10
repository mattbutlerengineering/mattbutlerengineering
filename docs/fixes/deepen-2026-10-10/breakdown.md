---
stage: decompose
run: maintenance:deepen-2026-10-10
date: 2026-10-10
assumptions:
  - "Soft gate: no architecture.md and no defect.md. The predecessor is the /idea-to-prod:deepen review taken at origin/main dfae5518a on 2026-10-10 (an HTML report in the OS temp dir, not the repo). Matt chose 'proceed with assumptions' over backfilling architecture first."
  - "The review designs no interfaces, by design. So only work needing no new interface is cut into implementable items: Milestone 1 (bug fixes) and Milestone 3 (deleting inert seams). Every deepening's interface is a design gap routed back to Architect (Milestone 2 and 'Design gaps found'). No interface is invented here."
  - "Every bug in Milestone 1 was found by reading source and none has been reproduced. Each item therefore starts with a RED test. If the test cannot be made to fail against origin/main, the item closes with that evidence instead of a fix."
  - "No tracker export. Matt's active goal is to complete all open GitHub issues, and exporting about 20 items would grow that count. The one existing issue that overlaps (gh-client transport, #6039) is imported by reference."
  - "Line numbers are the review's, at dfae5518a, and are pointers only. Each item re-measures them on its own base."
  - "Excluded: the reservations route-layer candidates from the 2026-10-04 review (venue-scoped-routes, reservation-transition-effects, sse-event-catalog, endpoint-definitions-pilot) are separate in-flight runs. The /me unverified-email security fix is in flight as its own PR."
---

# Breakdown: act on the 2026-10-10 deepen review

Progress lives in the checkboxes below. Implement checks items off as their
acceptance criteria are met.

## Milestone 1: the defects the review read out of the code are fixed or disproven

Each item is one PR. Each is independently valuable and none depends on another.

- [ ] **Hold pre-check honours `excludeSessionId`**: a session re-holding its own table and time is not rejected by `assertBookable`.
  - Accept: a RED test in `services/reservations/src/services/assert-bookable.test.ts` (or hold.test.ts, using real conflict data rather than a mocked `assertBookable`) shows a same-session re-hold rejected today with "Table is not available". After the fix (`HoldSlim` carries `sessionId`, and `fetchConflictData` selects it), the re-hold passes and a different session's hold is still rejected. The test at hold.test.ts:280, which pins the no-op argument, is rewritten to assert the outcome instead.
  - Blocked by: —
- [ ] **Walk-in re-checks hold conflicts under the lock**: `reservation.ts` walk-in calls `bookSlot` with `checkHoldConflict: true`, like the other four write paths.
  - Accept: a RED test shows a walk-in on a table holding an active hold for the same window succeeding today. After the fix it is refused with the same status and detail the staff-create path returns.
  - Blocked by: —
- [ ] **A late cancel at a 0% late-fee venue does not capture the deposit**: cancel applies the same full-refund short-circuit that no-show got in #5719.
  - Accept: a RED test in reservation-cancellation.test.ts, using `createInMemoryPayments`, shows a late cancel with `lateCancellationFeePercent` 0 or null calling `refundPartial` with the full amount, i.e. capture then refund. After the fix it calls `refund` (full) and never captures. stripe-flow-reviewer verdict PASS on the PR.
  - Blocked by: —
- [ ] **Post-visit thank-you respects contact preference**: `post-visit-notifier.ts` passes `communicationPreference` to `canContact`, and the dispatcher no longer treats the thank-you as transactional.
  - Accept: RED tests show that a `transactional_only` guest receives the thank-you today and an `sms_only` guest receives it by email. After the fix, the first gets nothing and the second gets SMS (or nothing, if no SMS adapter is configured). The existing marketing and transactional tests still pass.
  - Blocked by: —
- [ ] **`PUT /api/v1/waitlist/:id/notify` does not 500 after the SMS is sent when jobs are unavailable**: the schedule call after the send no longer turns into an error response once the guest has already been texted.
  - Accept: a RED route test with a null Redis URL (the production configuration) shows a 500 after the SMS send today. After the fix the route returns its success response, the schedule failure is logged, and the SMS is sent exactly once.
  - Blocked by: —
- [ ] **`mbe loop --model` honours an explicit model**: `tools/cli/src/commands/loop.ts` no longer passes the model flag into `resolveModel` as a task description.
  - Accept: a RED test in `tools/cli/src/__tests__/loop.test.ts` asserts the argument the model resolver receives. With `--model claude-opus-x` the session config's model is haiku or sonnet today; after the fix it is the given value. With no `--model`, behaviour is unchanged.
  - Blocked by: —
- [ ] **Service CORS env name matches between Pulumi and code**: `infrastructure/pulumi/index.ts` sets the variable `create-service-app.ts` reads (`CORS_ORIGINS`), or the code reads both. This closes backlog:79.
  - Accept: a test that reads the Pulumi service spec and the bootstrap's env read and asserts the names match fails today and passes after. `pulumi preview` on prod shows only the env-var rename. The live CORS headers after deploy are unchanged for the production origins, checked with `curl -H 'Origin: https://mattbutlerengineering.com' -I` before and after.
  - Blocked by: —
- [ ] **`file-issue-cli` dedupe sees every matching issue**: `createRealDeps().searchIssues` paginates (or passes an explicit `--limit`) instead of gh's default 30.
  - Accept: a RED test drives `createRealDeps` with a stubbed `gh` that returns more than 30 results and asserts that an old closed match is found and reopened rather than duplicated. `getIssueState` distinguishes a gh error from a missing issue, so an error does not create a new issue.
  - Blocked by: —

## Milestone 2: each deepening has an agreed interface (Architect)

Implementation of each deepening is cut only after its architecture exists. Each item produces one `architecture.md` section, or one run, with the interface, the dependency category, the test ordering (new interface tests first, old shallow tests die last) and the call sites that move.

- [ ] **Architect: one booking module** (review card 1: assertBookable, bookSlot, fetchConflictData, settings fetch).
  - Accept: the interface is agreed with Matt, including a lock key that covers venue-wide pacing and the single error vocabulary. A real-Postgres concurrency test plan is named. Every one of the 5 write call sites is mapped.
  - Blocked by: Hold pre-check honours `excludeSessionId`; Walk-in re-checks hold conflicts under the lock
- [ ] **Architect: deposit settlement module** (card 2).
  - Accept: the `settleDeposit(reservation, reason, now)` contract, or its replacement, is agreed. It covers replay and re-verify, and does not ask callers to pass column names. The in-memory payments fake's failure modes are configurable in the plan.
  - Blocked by: A late cancel at a 0% late-fee venue does not capture the deposit
- [ ] **Architect: contact policy inside the dispatcher** (card 3).
  - Accept: one decision point for consent and channel is agreed. Waitlist SMS is routed through it. Each of the 6 contact-policy call sites is mapped.
  - Blocked by: Post-visit thank-you respects contact preference
- [ ] **Architect: job seam with two live adapters** (card 4).
  - Accept: Matt has decided whether production gets Redis or a Postgres-backed adapter (the open backlog decision), and the second adapter is named and constructed in reachable code.
  - Blocked by: `PUT /api/v1/waitlist/:id/notify` does not 500 after the SMS is sent when jobs are unavailable
- [ ] **Architect: error banner owns recovery** (card 5).
  - Accept: the banner contract taking `error: unknown` is agreed, with per-recovery behaviour (retry, edit, sign-in, refresh, none). The 24 render sites and the 11 page tests that mock the banner are mapped.
  - Blocked by: —
- [ ] **Architect: query keys and write invalidation** (card 6).
  - Accept: `createQueryHook` returning `{use, key}` and a local entity-to-queries catalog are agreed. A real-QueryClient test confirms or disproves the stale-readiness-after-add-table claim before the design is final.
  - Blocked by: —
- [ ] **Architect: auth authority and injectable verifier** (card 7).
  - Accept: one authority, audience, JWKS and issuer resolution is agreed, consistent with ADR-010 and ADR-021. The `createServiceApp` config takes an optional verifier. The plan states which of the 39 `vi.mock("jose")` files collapse and in what order.
  - Blocked by: —
- [ ] **Architect: deploy filters and env contract derived from the dep graph** (card 8).
  - Accept: the generator source (`infrastructure/worker/dep-graph.json`) and the drift check are agreed. The plan names the test that fails today on hospitality's missing `packages/api-client/**` filter.
  - Blocked by: Service CORS env name matches between Pulumi and code
- [ ] **Architect: land-automation-PR composite action** (card 9).
  - Accept: the action's inputs and outputs (`pr`, `branch` → `enabled` | `skipped-reason`) are agreed. All 7 producer workflows are mapped. An executed test with stubbed gh replaces the three regex wiring tests.
  - Blocked by: —
- [ ] **Architect: model policy unification** (card 11, second half).
  - Accept: `mbe agent run` and `mbe loop` route through `routeModelWithReason` (or the agreed successor). ADR-017's "cannot diverge" claim is amended to match the two session runners, or the runners are planned to merge.
  - Blocked by: `mbe loop --model` honours an explicit model

## Milestone 3: inert seams and dead surface removed

These are deletions, so no interface design is needed. One PR per item.

- [ ] **gh-client picks its transport by capability** (card 10): REST by default, or fall back on a GraphQL 403. Probing for binary presence is no longer what decides. (tracker: #6039)
  - Accept: a transport test for "gh present, GraphQL returns 403 → REST" fails today and passes after. `mbe issue transition` works in a cloud (CCR) session, shown by one real transition logged there.
  - Blocked by: —
- [ ] **Narrow `AgentAdapter` to `{name, isAvailable}`**: delete `run()` from the interface and from each adapter, plus `ClaudeAdapter.run`/`deriveHasChanges` and `CliAdapterBase.run`, along with the tests that exercise only `run()`.
  - Accept: `pnpm --dir packages/agent-core typecheck` and `test` pass, and `mbe agent run --adapter <each>` still dispatches through `runSession`. The PR lists which test files were deleted and why no production path lost coverage.
  - Blocked by: —
- [ ] **Eval judge: wire it or delete it**: either `RunEvalSuiteOptions` accepts a judge and `agent-eval.ts` constructs one, or `judgeCriteria` and the judge parameter are removed from the schema and all 10 suites.
  - Accept: whichever path Matt picks, no suite carries criteria that never run. A test fails if a suite has non-empty `judgeCriteria` and no judge is wired. If wired, one eval run shows `judgeResult` populated.
  - Blocked by: —
- [ ] **Delete service-bootstrap feature flags**: remove `feature-flags.ts`, the `onRequest` hook in `create-service-app.ts`, and the `enhanced-validation` branch at reservations.ts:407, together with their tests.
  - Accept: the reservations suite passes. A test shows `partySize > 20` behaviour is unchanged for edge traffic (it was always the flag-off path). There are no remaining imports of the removed exports.
  - Blocked by: —
- [ ] **Delete agent-core dead modules**: `change-type-classifier`, `deploy-verifier`, `bundle-size-tracker`, `revert-detector` (`scripts/revert-rca.mjs` reimplements it), the unused `reviewer-contract` constants, and `source-resolver.classifyTaskContexts`.
  - Accept: the repo-wide grep for each export returns 0 importers outside agent-core before deletion. After it, agent-core typecheck and test pass and the llms regen is committed.
  - Blocked by: —

## Design gaps found

Routed back to Architect, one per Milestone 2 item. The review proposes a direction for each but agrees no interface:

- Booking: the lock granularity for venue-wide pacing (per venue, per venue and window, or advisory and counter-based) changes contention under load. This is a product and performance call.
- Deposit settlement: whether staff cancel and guest cancel share a fee-evaluation clock.
- Contact policy: whether waitlist "your table is ready" is transactional for every preference, including `marketing` opt-outs.
- Jobs: production Redis vs Postgres-backed jobs. This is the open backlog decision and a spend question for Matt.
- Error banner, query keys, auth authority, deploy filters, composite action, model policy: interface shape not yet designed.

## Notes

<Deviations discovered during Implement get logged here, dated.>
