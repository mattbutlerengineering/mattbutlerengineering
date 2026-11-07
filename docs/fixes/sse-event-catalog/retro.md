---
stage: operate
run: maintenance:sse-event-catalog
date: 2026-11-07
users-observed: 0
signal-source: "none identifiable. The fix has no user-facing surface of its own (defect.md § Blast radius: 'correct live refresh'); no issue, comment or feedback from a staff user of live refresh found by `gh issue list --state all --search 'SSE in:title,body created:>=2026-10-05'` (read 2026-11-07); no event-delivery counter or per-event log exists in the repo to count a receiving browser. State read from `gh pr view 6050`, `git -C $W log origin/main -- packages/types/src/sse-events.ts services/reservations/src/services/events.ts apps/hospitality/src/hooks/useSSESync.tsx`, and grep of origin/main at c4320513d. Sentry MCP not queried: no SSE event is tagged or reported there, so a search could not separate this surface."
assumptions:
  - "autorun-brief.md has no `operate:` section and names no minimum signal. Outcomes are graded against defect.md's target state and its work-item Accept lines."
  - "'Recurrence' means the vocabulary drifting again (a name in one list but not another, or an event that invalidates nothing). Measured by reading the merged commit history of the catalog and its consumers, not by a drift report from a user."
  - "The three Review deferrals (Minors 1-3) were seeded to docs/backlog.md at Ship and were later picked up as issue #6598 / PR #6690 and in-tree changes. I credit them to those commits by reading origin/main; I did not read each commit's diff beyond the lines cited here."
  - "Whether `reservation:updated`, `hold:created` and `hold:released` ever fire in production was not measured. Only a grep for their emit methods' callers was done."
---

# Retro: SSE event vocabulary from one shared catalog

## Release state

`release.md` records PR #6050 squash-merged 2026-10-05T05:24:25Z (`gh pr view 6050` → `MERGED`, merge commit `6f518fa35`, same as `release.md`). Deploy Static Sites, Deploy Services and main CI were all green at release. There is no pending merge. No `outcome:` field exists in `release.md`; its text reports a completed release, so it is treated as Ship-complete. The run is 33 days past release.

## Did the defect recur? No drift found in 33 days

Commits touching the catalog or its consumers on `origin/main` since the merge:

- `22a6f407f` (2026-10-15, #6690) "make SseEvent a discriminated union over the SSE catalog" is Review's Minor 2 landing. It is the fix for a deferral, not a new drift.
- `2ee6130ac` and `925d9f328` (2026-10-15) localization commits touch `useSSESync.tsx` or its neighbours. Nothing in their subjects is a vocabulary change.
- `4ddaa8e1a` (2026-10-16, #6886) knip prune of dead code.

Current state of `packages/types/src/sse-events.ts` on `origin/main`: 10 names, no `venue:updated`, `floor-plan:created` invalidates `["floorPlans"]` only, `guest:lapsing` invalidates `["lapsingGuests"]`. So the defect did not recur and the pipeline did not miss a regression test, review finding or design constraint for it. The drift is closed as a type error in both directions, as `verification.md` §5-§6 probed.

## Outcomes vs. intent

Population is 0 (frontmatter), so every outcome is `unobserved`: each records state, never use. Targets are `defect.md` § Defect (target state) and its work-item Accept lines.

### One catalog in `@mbe/types` drives the server union, the client subscription list, invalidation and the exhaustive switch

- What happened: the catalog is on `main` and every consumer still derives from it. `apps/hospitality/docs/ARCHITECTURE.md:222` names `SSE_EVENT_CATALOG` as the owner, and `apps/hospitality/src/sse-events-docs.test.ts` exists. `CI` on main was `success` on its latest run (2026-11-07T20:36Z). Whether a developer has added an event since by writing one catalog row is not known; no new name has been added.
- Signal strength: unobserved

### `guest:lapsing` refreshes the lapsing-guests list, and `floor-plan:created` is handled client-side (the two behaviour changes)

- What happened: both rows are in the catalog on `main`. The server side now has live emitters: `services/reservations/src/routes/floor-plans.ts:183` calls `fastify.reservationEvents.emitFloorPlanCreated(cloned)`, and `routes/guests.ts:269` plus `app.ts:364` wire `emitLapsingGuests` to `reservationEvents`. `release.md` said delivery waited on run #1 (`reservation-transition-effects`, #6055, merged 2026-10-04 per `git log -S emitFloorPlanCreated`). So the wiring this run depended on is now present. Whether any staff browser has received either event live is not known: nothing counts SSE delivery. The deployed bundle check in `release.md` shows the client was ready at release, not that anyone's list refreshed.
- Signal strength: unobserved

### Drift becomes a type error or a failing test

- What happened: held at Verify by two probes (`verification.md` §5, §6). Since then it has been tightened: #6690 made `SseEvent` a discriminated union, so the payload column is now enforced on the wire type, which was Review's Minor 2. No later commit loosened it. No developer has hit the type error in anger in the window; nothing was added.
- Signal strength: unobserved

### `venue:updated` deleted, nothing else invalidated differently

- What happened: `venue:updated` is absent from `sse-events.ts` on main. The eight preserved rows are still in the catalog with their original sets (read 2026-11-07). No follow-up fix or revert touched them. `VenueContext.tsx`'s comment was fixed at Review (Minor 4).
- Signal strength: unobserved

## Open debt

Issues created before the merge, or citing this run's review.md or verification.md. Counted toward nothing.

- No issue was filed for this run before the merge (`defect.md` § origin: "no tracker issue, no backlog seed"; `release.md`: "No origin backlog seed to mark").
- Review's three deferred minors lived only in `review.md` § Findings and `release.md` § Open items prose, with backlog seeds added at Ship. Current state:
  - Minor 1, narrow `floor-plan:created` to `["floorPlans"]`: done on `origin/main` (`sse-events.ts` shows `["floorPlans"]`).
  - Minor 2, discriminated-union `SseEvent`: done. Issue #6598 ("[Proposal] services: make the SSE event catalog type-safe…", created 2026-10-14, closed 2026-10-15T13:58:51Z) was fixed by PR #6690 (merged 2026-10-15T13:58:49Z). #6598 was created after the merge and its body cites a backlog seed, not review.md. I list it as follow-up, not as the run's own filed debt.
  - Minor 3, prose docs: done. `ARCHITECTURE.md:222-236` points at the catalog and lists `floor-plan:created` and `guest:lapsing`. [INFERENCE] `services/reservations/CLAUDE.md` no longer lists the stale subset: `grep -n "SSE_EVENT_CATALOG\|floor-plan:created"` found no hit in it, which could mean it dropped the list or never gained a pointer. Not read further.
- `Visual Regression (hospitality)` red on every PR head (`release.md` § Open items). No issue filed by this run. Not re-checked for current state in this retro; it is advisory and not in `ci-gate`'s needs.

## Run retrospective

- Keep: Capture recorded a decision per drifted name in `defect.md` frontmatter (delete `venue:updated`, handle `floor-plan:created`, keep the three uncalled names because the brief's Out clause outranked its delete default). Review and Verify then graded against those, not against taste.
- Keep: the mandatory test ordering. RED showed exactly three failures on origin/main code and eight passing rows, which is the proof the refactor preserved the other invalidation sets. Verify redid it with a stronger swap (origin/main's source files over the run's, new tests kept).
- Keep: the drift probes (delete a name; add a name with no case) as the evidence for "drift is a type error". A claim like that is cheap to fake and cheap to demonstrate.
- Keep: the brief's release authorization was specific (conditions to squash-merge, conditions to stop). Ship merged twice against a moving main (#6051, then #6052/#6053) with no human asked.
- Change: Review deferred three findings as prose and relied on Ship to seed them. All three were done by other runs, but that depended on a backlog line surviving. The backlog already carries a seed for filing deferrals as issues (from: feature:localization); this run is a second case where it worked by luck, not a gap in the outcome.
- Change: Capture's scope clause ("do not touch emitter wiring") made the catalog carry three names (`reservation:updated`, `hold:created`, `hold:released`) that nothing in `services/reservations/src` calls by their emit methods on origin/main (grep of `emitReservationUpdated|emitHoldCreated|emitHoldReleased|emitHoldConfirmed`: definitions only, in `events.ts`). [INFERENCE] they may be emitted through run #1's transition module under another call path; not confirmed. Capture should have ended the run with a note on when to delete them, not an open-ended "kept".
- Stop: nothing worth stopping. The run was a one-seam refactor and each stage earned its artifact. The Ship hiccups (two merges of a moving main, a mistyped build filter, a premature push-verify hook warning) cost minutes.

## Environment

Sources: `verification.md` § Failures ("None"), `review.md` § Findings (Minors 1-4), `defect.md` Notes. `breakdown.md` does not exist in a maintenance run. One row per recorded mistake.

| Mistake | Evidence | Class | Proposed carrier |
|---|---|---|---|
| `SseEvent` left a loose envelope (`type` and `data` uncorrelated), so the catalog's payload column was not enforced on the wire type. | `review.md` § Findings Minor 2 | mechanical | The `Typecheck` job in `.github/workflows/ci.yml`, once `SseEvent` is a discriminated union. Already landed (#6690). |
| Prose event lists in `apps/hospitality/docs/ARCHITECTURE.md` and `services/reservations/CLAUDE.md` were stale copies the catalog could not see. | `review.md` § Findings Minor 3 | mechanical | `apps/hospitality/src/sse-events-docs.test.ts`, which compares the doc's Event column to the catalog. It runs under hospitality's `Test` job in CI. Finding: it covers `ARCHITECTURE.md` only; the reservations `CLAUDE.md` list has no equivalent check that I could confirm. |
| `floor-plan:created` was given an over-broad invalidation set (`floorPlan` plus `floorPlans`), costing a redundant refetch. | `review.md` § Findings Minor 1 | judgement | `packages/types/src/sse-events.test.ts` or `useSSESync.test.tsx`'s per-event invalidation table, which pins each set. No deterministic check can say a set is too wide; the table makes a change visible, and was updated by the fix. |
| A comment (`VenueContext.tsx:54-56`) claimed SSE invalidates the venue list after the event that did so was deleted. | `review.md` § Findings Minor 4 (fixed at Review) | judgement | None existing. A reader only. This is the cost of deleting a name: comments that describe its behaviour. Recorded, no carrier proposed. |
| `Visual Regression (hospitality)` failed on all three PR heads and was waved through as advisory without checking whether the diff changed a pixel. | `release.md` § assumptions, § Open items; `verification.md` §13 | judgement | `.github/workflows/ci.yml` leaves it out of `ci-gate`'s needs by design. Finding: red-on-every-head normalises an advisory failure, so a real visual regression in the same job would read as the usual red. |

Finding: the type-level drift gate (`tsc --noEmit` per package) runs in CI `Typecheck` and, per `defect.md` Notes, in `pnpm typecheck` locally. I did not read the husky hooks, so whether it also runs pre-push was not confirmed.

## Idea seeds

- Count SSE deliveries per event name in `useSSESync`'s handler (or log them server-side in `routes/events.ts`) and read the counts for `floor-plan:created` and `guest:lapsing` after a week; today nothing can say whether either has ever refreshed a staff list (from: maintenance:sse-event-catalog)
- Decide, per name, whether `reservation:updated`, `hold:created` and `hold:released` stay in `SSE_EVENT_CATALOG` or are deleted: grep their emit methods' callers on `origin/main` (definitions only at c4320513d) and check whether run #1's transition module emits them; a catalog name with no emitter is the same drift this run removed (from: maintenance:sse-event-catalog)
- Extend `apps/hospitality/src/sse-events-docs.test.ts`'s idea to the prose list in `services/reservations/CLAUDE.md`, or remove that list; measure by grepping the file for the ten catalog names (from: maintenance:sse-event-catalog)
- Measure how long `Visual Regression (hospitality)` stayed red on every PR head and whether a diff that changed pixels ever merged under it, since an advisory job red on all three heads of this run's PR gave Ship no way to tell its own change from the baseline (from: maintenance:sse-event-catalog)

## Run complete

Closed 2026-11-07. Seeds above are the input to the next Idea-stage run. They do not duplicate `docs/backlog.md`: its SSE-related lines (Host Stand, On My Way, the transition-effects policy-source line) are about other features, and the "file each deferred Review minor as an issue" seed already covers the deferral-tracking lesson.
