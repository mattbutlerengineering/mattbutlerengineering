---
stage: operate
run: maintenance:endpoint-definitions-pilot
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable for a person who used the guests flows. Checked 2026-11-07: `gh pr view 6060` (MERGED 2026-10-05T06:59:56Z, `17b1edceb`); `git -C $W log origin/main -- packages/types/src/endpoints packages/service-bootstrap/src/register-endpoint.ts packages/api-client/src/guests.ts services/reservations/src/routes/guests.ts tools/route-contract` (later commits, no revert of #6060); `grep` for `registerEndpoint`/`defineEndpoint` and `PARITY_DOMAINS` on origin/main `40f0f7f2c`; `gh pr list/issue list --state all --search` on the slug and the machinery names; Sentry MCP `search_issues` and `search_errors` (org mattbutlerengineering, 30d / 14d). Both Sentry calls returned the 10 newest unresolved issues, not a guests-filtered set; none of the 10 names a guests endpoint. Sentry carries no per-feature tag, so no person can be tied to the lapsing widget or the guest list. No analytics token. No feedback from a user of the surface."
assumptions:
  - "The autorun brief has no `operate:` section and names no minimum signal, so the retro reports against `defect.md` § Condition's five target-state points and `release.md`'s § Measured cost."
  - "`users-observed: 0`: this is an internal refactor (brief: user-facing surface none). The guests flows (guest list, lapsing widget, win-back) are real product surface in the hospitality app, but no record identifies a person using them in the window. Matt's own use is not counted: no record shows it. Agent invocations through `gen-agent-tools.ts` are not people."
  - "'Spread beyond the pilot routes' is read as: did any route, client method or definition other than the 11 guests endpoints adopt `defineEndpoint` / `registerEndpoint`, and did the parity guard widen. Read from the code on origin/main, not from intent."
  - "The availability-config domain is counted as spread of the machinery, not of the pilot's migration plan: it was written greenfield with definitions, not migrated from hand-written routes."
---

# Retro: declare each guests endpoint once (the endpoint-definitions pilot)

The run shipped as three squash merges (#6052 `93b318192`, #6056 `2433bbdbd`, #6060 `17b1edceb`) plus the release-record PR #6062 (`docs(endpoint-definitions-pilot): record the release`, merged 2026-10-05T07:30:58Z). `release.md` records the deploy and the live probes. `gh pr view 6060` confirms MERGED, so there is no pending release to resolve. The run is 33 days past release.

## Outcomes vs. intent

The population is 0, so every outcome below is `unobserved` for use. The measured facts are about the code, not about people.

### The guests domain is declared once and routes, client and types derive from it (target points 1 and 2)

- What happened: still true on origin/main `40f0f7f2c`. `services/reservations/src/routes/guests.ts` has 12 `registerEndpoint` references; `packages/api-client/src/guests.ts` goes through `client.call` 11 times; `packages/types/src/endpoints/guests.ts` holds 11 `defineEndpoint(` calls (161 lines; 166 at release). No later commit reverts #6060. Later commits touched the guests route file for other reasons, for example #8095 (win-back send record and cooldown, 2026-11-01), and the file kept its definition-driven shape. Whether any person exercised the three behaviour changes (runtime validation of `getLapsing`/`sendWinBack`, the OpenAPI enum line, path-id encoding) is not known.
- Signal strength: unobserved

### The guard compares bodies, query and response for migrated endpoints (target point 3)

- What happened: `tools/route-contract` runs with `PARITY_DOMAINS = ["guests"]` (`tools/route-contract/src/route-contract.ts:156`), unchanged since #6056. The guard still covers exactly the 11 pilot endpoints. It did not widen, so it covers none of the later `registerEndpoint` routes (below). It is a test in `tools/route-contract` (`vitest run`), run by the root `pnpm test` / CI Test job, so it is not dormant. It has not been seen to fail on a real drift since the merge: no commit or issue in the window cites it. Its only demonstrated catch is the Verify-stage mutation run (verification.md C2, C3).
- Signal strength: unobserved

### Per-endpoint migration cost is priced for the remaining 12 domains (target point 4)

- What happened: the 12-domain table is an estimate (endpoints × the pilot's ratios) and is still the only price list. No existing domain from it has been migrated: `registerEndpoint` appears in no `floor-plans`, `tables`, `waitlist`, `venues`, `deposits`, `reservations` route file, and none of the cost table's domains has a definitions file. One comparison point exists, from a different kind of work. `packages/types/src/endpoints/availability-config.ts` is 396 lines for 17 endpoints, about 23 lines per endpoint against the table's ~15. It is greenfield (no migration, no parity measurement), so it prices writing definitions, not migrating. It suggests the 15-line estimate is low for endpoints with union responses.
- Signal strength: measured for the file sizes; unobserved for any migration run against the table

### Did it spread beyond the pilot routes?

- What happened: yes, but not along the plan. The brief and the cost table assumed "one existing domain per run". What happened is that new availability work adopted the machinery directly: `registerEndpoint` is used in `availability-config.ts` (7 references), `closures.ts` (8), `availability-changes.ts` (3) and `tonight.ts` (3) under `services/reservations/src/routes/`, with 17 `client.call` sites in `packages/api-client/src/availability.ts` and a second definitions file. The first of these merged 2026-10-25 (`d97edbd42`, #7586). The three PR 1 reviewer gaps were closed on 2026-10-16 (#6879, `Closes #6716`) before that domain started, so the first adopter did not hit them. The existing domains the table priced are untouched. The spread is by default for new code, not by migration.
- Signal strength: pattern (four route files, one definitions file, two PRs a week apart; no record of why the authors chose it, so whether it was because of the pilot is `[INFERENCE]`)

### Did the machinery cause a defect once it spread?

- What happened: yes, one. #7722 (Sentry, `ApiValidationError` on `GET /api/v1/venues/:id/availability/config`, created 2026-10-26, 15 events, 1 user) was caused by `toResponseJsonSchema` stripping every `required`, so every branch of a union of objects matched any object and `fast-json-stringify` serialised with the first branch, dropping fields. The client's Zod parse then failed and the Tonight button, tabs and paused banner vanished. Fixed in #7736 (merged 2026-10-26T23:22Z, `e07bbe4d9`, a day after the first availability route landed). The pilot's guests responses have no union branches, so the pilot could not have met it. The defect is in PR 1's machinery, not in the guests migration.
- Signal strength: measured (Sentry count, PR body root cause)

### The run's seed about the lapsing widget silent failure is already resolved

- What happened: the seed "surface the lapsing-guests widget's query error" (from: this run) was done on 2026-10-21 by #7181 (`fix(hospitality): show error and retry when the lapsing-guests query fails`, merged 2026-10-21T08:57:16Z). `apps/hospitality/src/pages/HomePage.tsx` now reads `error: lapsingError` and renders a failure with retry. The backlog line at `docs/backlog.md:245` still describes the old state.
- Signal strength: measured (file read, PR state)

### Did the defect the run targeted (hand-stated shape drift) recur?

- What happened: no recurrence of a client/route drift in the 7 commit class listed in `defect.md` (`b8c552e39`, `f4eb21bef`, …) was found in the window on the guests endpoints. For all other domains the drift risk is exactly as before the run (their parity is not compared). #7722 is a different failure (the machinery, not drift). Because the guards for non-guests endpoints did not change, "no recurrence" for them is the absence of reports, not evidence. No Sentry issue on 2026-10-05..2026-11-07 names a guests endpoint.
- Signal strength: unobserved

## Open debt

The four review minors are recorded as deferrals in `review.md` and in `release.md` § Backlog seeds. The run created no GitHub issues of its own (`autorun-brief.md`: "Tracker: none"). Searched with `gh issue list --state all --search "endpoint-definitions-pilot OR defineEndpoint OR registerEndpoint"`: #6716 (created 2026-10-15, after the merge, body cites the PR 1 reviewer; CLOSED, resolved by #6879) and #7722 (Sentry-filed, after the merge; a defect of the machinery). #6716 is a follow-up filed from this run's deferrals, so it counts as the run's own debt and counts toward nothing. #7722 is a post-merge defect report and is not listed as debt.

Review deferrals, current state (backlog seeds at `docs/backlog.md:246-249`; none has an issue):

- Guests prefix stated twice (definition and `app.ts` mount), from Review: open. `GUESTS_PREFIX` is still mounted from a second literal. Each later domain added another duplicate.
- Ambient `*?raw` declaration in `packages/types/src/endpoints/raw-imports.d.ts`, from Review: open (file still present, 5 lines).
- "Imports Zod only" test regex misses side-effect and dynamic imports, from Review: open (`guests.test.ts` is 55 lines; a second definitions file now exists that it may not cover).
- Machinery gaps (per-call headers, 207, `200: problem()`), from the PR 1 reviewer: closed by #6879 (#6716 CLOSED).
- Lapsing widget silent error, from Review (decision 1): closed by #7181 (above). The backlog line is stale.

## Run retrospective

- Keep: the three-PR split (additive machinery, then a guard pinned with its 10 gaps, then the migration). Its measured RED→GREEN steps made the large change reviewable: all 11 handlers moved verbatim, one OpenAPI delta, no handler-body line changed. Keep the "pin the gaps, then watch the signal go to `[]`" shape for any contract guard. Keep the Review checkpoint that turned a behaviour change (decision 2, the enum line) into an explicit ACCEPT with reasoning. Keep the Ship step that diffed the pre- and post-deploy 401 problem body byte for byte.
- Keep: pricing the remaining domains in `release.md`, but as the retro now shows, treat that table as unvalidated until a second migration is measured against it. Its one comparison point (availability-config, ~23 vs ~15 lines/endpoint) says the line estimate is low for union-heavy endpoints.
- Change: the pilot proved the migration path for a domain with simple responses and shipped a machinery whose `toResponseJsonSchema` silently loosens unions. The first union-heavy adopter, not the pilot, found it (#7722), with a production-affecting symptom (the widgets vanished). A pilot meant to "price the migration" for 12 other domains should include one endpoint of each response shape the remaining domains use (union, nullable, 207) in its fixtures before it is declared priced. Verify's "Not verified" list names the full OpenAPI document diff and live behaviour of decision 1, but not shapes the pilot domain lacks.
- Change: the cost table assumed adoption by migration; adoption actually came from new feature work. Plan the follow-on around "what must a new endpoint do by default" (and a ratchet on hand-written routes), not only around migrating the old 77.
- Stop: estimating cost by scaling one domain's ratios across twelve. The one real comparison missed by ~50% on lines.

## Environment

The run's own record: `verification.md` § Failures says "None"; `review.md` has five minors plus one reverted drive-by; `breakdown.md` § Notes records several deviations and environment gotchas. One row per mistake.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| Machinery fixtures and five type-only `it` blocks tripped the AI-antipattern ratchet on first push (`noopTestAssertions` 20→25, `hardcodedRoutes` 851→880). | `breakdown.md` § Notes, 1.5 | mechanical | Already caught, by `node scripts/check-ai-antipatterns.mjs`, which runs in `.husky/pre-commit` and `.husky/pre-push`. Carrier worked; no change. |
| `path.replace(/\/+$/, "")` in `findOperation` was a polynomial ReDoS, caught only by CodeQL after the PR opened. | `breakdown.md` § Notes, 2.5 | mechanical | `.github/workflows/ci.yml` CodeQL job caught it. A local rule exists (`security/detect-unsafe-regex` in `packages/config/eslint/node.js:16`) but did not flag it; whether `tools/route-contract` is in the node tier, or the rule cannot see this pattern, was not checked here, so the finding is that the existing lint carrier did not stop it. |
| `route-contract` reads `@mbe/types` / `@mbe/api-client` from `dist/`, so switching branches without rebuilding gives false parity results (a stale dist made PR 2's pinned-gaps test fail as "accidental fix"). | `breakdown.md` § Notes, "Environment gotcha" | mechanical | `turbo.json` `test.dependsOn: ["^build", …]` already rebuilds dependencies under `pnpm test`; running `vitest` directly in `tools/route-contract` bypasses it. A line in `tools/route-contract/package.json` (`pretest`: build dependencies) would make the direct run honest. CI is unaffected. |
| Turning on all `service-bootstrap` test files for typechecking surfaced 14 pre-existing type errors in unrelated tests; typecheck was scoped to `register-endpoint*.ts` instead. | `breakdown.md` § Notes, 1.3 | mechanical | The package's `typecheck` script now uses a scoped `tsconfig.test.json` (an existing carrier). The other test files remain untyped by any job: a finding, no job covers them. |
| A drive-by `—` → `—` re-escape of `tools/route-contract/package.json`'s description was committed. | `review.md` § Fixed in Review; `verification.md` § Flags | mechanical | `.husky/pre-commit` (`pnpm lint-staged`). It was the formatting hook that produced it, per Verify, but Review says the prettier pass left the escape intact on revert; the hook is the carrier and its behaviour is not pinned. No change proposed without reproducing it. |
| Deleted tests that pinned query values (`limit: 50`, `query`) had no replacement; parity compares the query schema, not the values the facade sends, so dropping `limit` passed typecheck, parity and hospitality tests. | `review.md` § Minor (reviewer gate) | judgement | The deepen test-ordering rule in the autorun brief § Constraints (state in the diff where coverage moved); `packages/api-client/src/guests-query.test.ts` now holds it for guests. No mechanical check can know which assertions a deleted test held. |
| Pushing from a worktree: the PostToolUse `verify-push-sha.sh` hook reported "remote is BEHIND local" while the pre-push hook was still running; local `--delete-branch` failed on the worktree's `main`. | `release.md` § Outcome, hiccups 1 and 2 | mechanical | `verify-push-sha.sh` (the hook that misfired): it could wait for the push process to exit. The `--delete-branch` failure is a known worktree quirk with no carrier proposed. |
| `toResponseJsonSchema` stripped `required` on union branches (post-release defect, #7722). | `gh pr view 7736` root cause; not in the run's own record | mechanical | A route-contract check that serializes a schema-valid sample through `fast-json-stringify` for every defined response (the shape of `packages/service-bootstrap/src/register-endpoint.union-serialization.test.ts`, which #7736 added for the availability union only). |

## Idea seeds

- Put every `registerEndpoint` route under the parity guard: `PARITY_DOMAINS` is still `["guests"]` (`tools/route-contract/src/route-contract.ts:156`) while `availability-config`, `closures`, `availability-changes` and `tonight` route files use `registerEndpoint` and `packages/api-client/src/availability.ts` uses `client.call` 17 times, so 4 route files, 17 definitions and their client methods are outside the guard the pilot built; first measure how many gaps pinning them finds (from: maintenance:endpoint-definitions-pilot)
- Make "a new endpoint is born as a definition" a checked default instead of an accident: the machinery spread only through new availability work, not through the 12-domain migration plan, so add a ratchet (in `scripts/check-ai-antipatterns.mjs`, beside `hardcodedRoutes`) that counts routes registered by hand with `fastify.get/post/...` rather than `registerEndpoint`, and measure its baseline before deciding whether to migrate old domains at all (from: maintenance:endpoint-definitions-pilot)
- Serialize a schema-valid sample through `fast-json-stringify` for every defined response and compare it to the definition's Zod schema, not only the union case #7736 pinned: the pilot's guests responses have no union, nullable-branch or 207 shapes, and #7722 hid until the first union-heavy domain shipped (from: maintenance:endpoint-definitions-pilot)
- Re-price the cost table from a measured second domain before the next migration run: measure lines per endpoint, parity gaps found and wall-clock for the next domain migrated, and compare to the table's ~15 lines/endpoint (availability-config measured ~23 greenfield, 17 endpoints in 396 lines) and ~0.9 gaps/endpoint (from: maintenance:endpoint-definitions-pilot)
- Measure whether anyone uses the lapsing-guests widget and win-back: today there is no person-level signal (Sentry carries no feature tag, `users-observed: 0`), so decision 1's runtime validation has never been seen against a real payload; add a counted `guests.lapsing.view` / `guests.winback.send` event (or read the `#8095` win-back send record's rows) and report distinct venues over 14 days (from: maintenance:endpoint-definitions-pilot)

## Run complete

Closed 2026-11-07. Population 0 (no person identified using the guests flows); the code state is measured: the pilot is intact on main, the machinery spread to the availability domain by new-feature adoption (one machinery defect, #7722, fixed in #7736), and the guard still covers only guests. Seeds above are the input to the next Idea-stage run. The backlog line about the lapsing widget error (`docs/backlog.md:245`) is stale (#7181 shipped it); the retro does not edit it.
