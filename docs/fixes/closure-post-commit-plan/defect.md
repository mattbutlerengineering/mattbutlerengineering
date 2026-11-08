---
stage: capture
run: maintenance:closure-post-commit-plan
date: 2026-11-07
re-entry: implement
intake: "deepen review 2026-11-07, card 2 (origin/main @ 5e562c6da)"
assumptions:
  - "Maintenance run from a condition brief; no live user input."
  - "The plan stays internal to the reservations service: ClosureResult and ReopenResult in @mbe/types are the HTTP contract the app and the agent read, and are unchanged."
---

# Defect: the closure command drops what it decided, and the routes re-derive it

## Condition (what is degraded)

The closure command decides, inside its transaction, everything the save owes once it commits:
which outcomes a series edit carried in (already told and refunded), which guests an edit gave
their date back to and chose to tell, and whether a reopen should tell the cancelled guests. Its
result kept only counts, so the routes re-derived each fact:

- `enqueueClosureJobs` (3 callers: `POST /closures`, its batch, a Tonight close-early) re-read
  the audit row twice after the commit, through `readCarriedOutcomeIds` and `readGivenBack`, each
  an `availabilityChange.findFirst` by `inverse.closure.ruleId` with no `orderBy`.
  `givenBackNotified` (a count) was used only as a gate for the second read.
- `tonight.ts` added its own gate (`change.type === "close_early" && affected > 0`).
- The reopen notify rule `tellCancelledGuests && !stillClosed.everyDate` was written twice, in
  `routes/closures.ts` and `services/closure-command.ts`.

## Evidence

- `routes/closure-post-commit.ts` (before): `carriedOutcomes` and `enqueueGivenBackNotices`
  read the audit row; `routes/closure-post-commit.test.ts` mocked three modules to test them.
- `routes/closures.ts` reopen handler repeated the store's predicate (#8006).
- `services/closure-command.ts` `commit` held `carried` and `givenBack` in memory and returned
  neither.

## Target state

- `createClosure` answers `{ kind: "saved", result, postCommit }`; `postCommit` is a
  `ClosurePostCommit` (`venueId`, `ruleId`, `carried`, `refunds`, `givenBack`) or `null` when
  the save owes nothing (no outcome of its own and no guest given a date back). A fresh save and
  its replay build it in one place (`savedOf`) from the fields stored on the audit row, so a
  retry runs the same work.
- `createClosures` answers each item's plan in order, leaving out items that owe none.
  `setTonight` passes the close-early's plan through; every other Tonight change owes `null`.
- `reopenClosure` answers `notice: ReopenNotice | null`; the predicate exists once, in the store.
- `routes/closure-post-commit.ts` runs a plan (`runClosurePostCommit`, `runReopenNotice`) and
  reads nothing. `readGivenBack`, `readCarriedOutcomeIds` and `carriedOutcomeIds` are deleted.
- No HTTP response changes.

## Work items

- [x] Command tests for the plan: fresh create, replay, no-booking save, keep-only save,
      carried outcomes, given-back guests and their replay, batch, Tonight, reopen (full,
      partial, not asked), one-date reopen (integration)
- [x] `ClosurePostCommit` / `ReopenNotice` returned by the command; `savedOf` shared by save and
      replay
- [x] Routes run the plan; the Tonight and reopen gates are gone from the routes
- [x] Audit-row readers deleted; `series-edit-carry` integration test reads the plan
- [x] Unit suite and the closure integration suites against Postgres 15 with the CI owner role
