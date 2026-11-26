# Escape analysis: product fixes, 2026-10-25 to 2026-11-25

## Question

Why do bugs reach production? The working claim was "poor quality". This report measures what escaped, how it was found, and which pre-merge check would have stopped it.

## Method

- Source: `git log --since=2026-10-25`, product-scope `fix(...)` commits only (hospitality, availability, reservations, rialto, rialto-web, marketing, gen, agent, a11y, onboarding, users, auth, edge, types, ui-quality, shipped, sentry). 329 commits.
- Each commit was joined to its linked issue (`Closes #N`; 163 of 329 had one) and classified by model judgment from the subject, body and issue text. Per-row output: `classifications.jsonl`.
- Fields: `escaped` (live on main or prod), `cls` (defect class), `found_by`, `cheapest_gate` (cheapest pre-merge check that would have blocked it).
- Limits: `found_by` is inferred from issue titles and labels, not observed. `cheapest_gate` is a judgment. Nobody verified diffs row by row; a 10-row sample of one chunk was checked by hand and agreed.

## Results

295 of 329 fixes (90%) repaired a defect that was live. 34 were test, tooling or mislabeled work.

### By defect class (escaped only)

| Class                   | Count |
| ----------------------- | ----- |
| domain-logic            | 85    |
| ui-layout               | 56    |
| a11y                    | 52    |
| copy-data-honesty       | 46    |
| concurrency-idempotency | 15    |
| config-deploy           | 10    |
| other                   | 9     |
| authz-privacy           | 8     |
| silent-failure          | 7     |
| i18n                    | 7     |

### How they were found (inferred)

| Source                                      | Count |
| ------------------------------------------- | ----- |
| filed issue, source unclear (feature-drain) | 104   |
| UX / a11y audit                             | 100   |
| code-review follow-up                       | 37    |
| site-audit routine                          | 29    |
| Sentry                                      | 10    |
| unknown                                     | 10    |
| Owner                                       | 3     |
| E2E                                         | 2     |

Post-merge audits found at least 129 (44%). Sentry and E2E together found 12.

### Cheapest gate that would have stopped it

| Gate                          | Count |
| ----------------------------- | ----- |
| unit test                     | 138   |
| integration test              | 35    |
| narrow-viewport (375px) check | 34    |
| axe in CI                     | 30    |
| blocking E2E                  | 17    |
| no reasonable gate            | 16    |
| reviewer checklist            | 15    |
| invariant test                | 10    |

## Findings

1. **The gates exist. The test cases do not.** 173 escapes (59%) needed only an ordinary unit or integration test, and both already run in `CI Gate`. Every PR follows TDD. The tests pass because they encode the same understanding as the code. The missed case was never written down. The same agent writes the acceptance criteria, the test and the code, and the reviewer grades the diff against those same criteria.
2. **UI checks run after merge.** 64 escapes (22%) are 375px overflow or axe-detectable a11y. `CI Gate` excludes E2E and visual jobs, so a UX audit finds them days later. This class is mechanical and deterministic to gate.
3. **Venue scoping depends on each author remembering.** The worst escapes are scoping misses:
   - `4d7154641` (#9277): hold confirm accepted a foreign-venue `guestId`. The check existed on staff create and walk-in, copied per route. `rls-route-sweep.integration.test.ts` tests each route's own venue, never extra ids in the body.
   - `c17b303a6` (#8656): a raw `$transaction` skipped the auto-scoped Prisma wrapper and ran with no `app.venue_id`.
   - `c56c2fcd3` (#9595): the public guest-recognition route disclosed guest details. It had been live since 2026-05-23 (#1735).
   - `4b74bfd3d`, `dd8408978`: a Host without the grant could close the night through side paths.
4. **Money and guest-message state machines lack invariants.** Closure refunds marked "done" after rollback (`3dd18d832`, `10088f676`). Close-early cancelled without refunds or notices (`581cac401`). Waitlist seat/cancel overwrote terminal entries (`3dd0a9e19`). Win-back sends had no cooldown (`8fa119778`).
5. **Domain-logic escapes cluster in new feature work.** Most of the 85 come from the venue-availability and closure features. Feature throughput sets the escape rate.

## Root cause

"Poor quality" describes the output, not the mechanism. The mechanism is:

- Specification and verification come from one source. Nobody independently lists edge cases before TDD starts.
- Deterministic UI checks (viewport, axe) sit outside the merge gate.
- Cross-cutting rules (venue scoping, terminal states, money state) are enforced by convention per call site, not by a test that sweeps every call site.
- Throughput is about 45 commits per day, so audits fall behind and bugs live until an audit reaches them.

## Recommended gates, in order

1. **Venue-scoping invariant sweep** (severity first). Extend the route sweep so every body or query field naming a venue-scoped entity (`guestId`, `tableId`, `reservationId`, ...) is sent with a foreign-venue id and must be rejected. Add a lint or test that bans raw `prisma.$transaction` without `setVenueContext`. Covers 8 authz escapes, including the worst ones.
2. **375px overflow + axe on changed routes in `CI Gate`**. Covers about 64 escapes (22%), deterministic, no judgment needed.
3. **Independent edge-case list before TDD.** A separate agent enumerates failure cases (double submit, rollback, terminal state, foreign id, empty config) from the issue before the worker writes tests. The reviewer checks that each case has a test. Targets the 173 unit and integration escapes.
4. **State-machine invariant tests for money and messaging.** Terminal states never change; refund status follows the Stripe result; every guest send writes a record with a cooldown.
