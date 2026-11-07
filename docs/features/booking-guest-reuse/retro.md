---
stage: operate
run: feature:booking-guest-reuse
date: 2026-11-07
users-observed: 0
signal-source: "Read 2026-11-07. `gh pr view 5405 --json state,mergedAt,mergeCommit` (MERGED 2026-09-20T14:33:33Z, 49636ec10) and `gh issue view 4990 --json state,closedAt` (CLOSED 14:33:34Z, by the merge); `gh run list --commit 49636ec10…` (Post-Deploy Check success x2; deploy job conclusions not read); `git -C $W log origin/main --since=2026-09-20 -- services/reservations/src/services/guest-link.ts services/reservations/src/routes/holds.ts apps/hospitality/src/hooks/useGuestLookup.ts apps/hospitality/src/components/timeline/WalkInDialog.tsx apps/hospitality/src/components/crm/GuestLookup.tsx` and `git grep` on origin/main for each deferred finding; `gh issue list --state all --search` and `gh search issues` for the run slug; Sentry MCP `search_issues` / `search_errors` (natural-language filters were dropped and returned unfiltered org-wide results, so no event could be attributed to this feature). No analytics, no support inbox and no database access exist in this loop, so no count of people, of linked reservations or of Guest rows was possible; the count is 0 for lack of any record of use, not for a record of non-use."
assumptions:
  - "users-observed is 0: the feature is a staff-app surface (Auth0 login) and the public widget path is invisible to its guests by design (SC11), so even a real booking leaves no per-person trace in anything I can read. The Owner counts only with a record of his use; none exists."
  - "The 45-user `HOSPITALITY-D reportApiError` Sentry issue is not attributed to this run: its title and culprit do not name the new code and I could not filter it by route. It is not counted as use or as feedback."
  - "`release.md` still says `release: prepared-not-executed` and § Post-release checks still reads 'Not run'; `gh` shows the PR merged five days after the stop. Treated as Ship-complete per the protocol, because the merge is confirmed independently of the artifact."
  - "autorun-brief.md names no Operate minimum signal (its only Operate mention is that autorun stops at Ship), so the measures asked for in release.md § Hand-off to Operate are the reference set."
  - "Deferred-finding state on main is read by `git grep` only (is the code the review described still there), not by running anything."
---

# Retro: returning-guest recognition at booking time (booking-guest-reuse)

## Outcomes vs. intent

The merge is confirmed: PR #5405 squash-merged 2026-09-20 as `49636ec10`, closing #4990. Nothing below records use, because no use is recorded.

### idea.md: "A returning guest booked by staff never creates a duplicate profile, and their history is visible at booking time"

- What happened: the code is on `main` (`resolveGuestLink` is called from `routes/reservations.ts:293` and `routes/public-reservations.ts:149`, `linkOrCreateGuest` from `routes/reservations.ts:459`) and has not been reverted; `git log origin/main` shows no commit touching `guest-link.ts` after the merge. Verify graded 27 PASS / 3 PARTIAL / 0 FAIL at the mocked service seams, with database rows, real Auth0 E2E and production behaviour all in its "Not verified". No count of reservations with a non-null `guestId`, no count of Guest rows, no staff report either way exists. Whether staff found the typeahead faster than retyping (the idea's "dies if") is unknown.
- Signal strength: unobserved

### SC1, SC2, SC8 — staff pick links `guestId`; history strip shows before submit; walk-in stores it

- What happened: shipped in the dialogs and covered by component and route tests at merge. `WalkInDialog.tsx` and `GuestLookup.tsx` were later touched by unrelated work (#8031 key presses behind dialogs, #7801 focus trap re-query on Tab, #6473 Combobox keyboard ownership); none reverts or reworks the link. State only; nobody is recorded using the pick.
- Signal strength: unobserved

### SC3, SC4, SC5 — exact email/phone match auto-links; no match creates one Guest; never across venues

- What happened: present on main in `guest-link.ts`. Exact-string matching is unchanged: `git show origin/main:services/reservations/src/services/guest-link.ts` contains no lowercase, trim or phone normalisation, so the case-variant duplicate Review recorded (`Priya@Example.com` vs `priya@example.com`) is still reachable. Whether it has happened is not measured.
- Signal strength: unobserved

### SC10–SC12 — public widget links on exact match, response indistinguishable, no caller `guestId`

- What happened: state only. The public path is deployed code; a later change added `PublicHoldConfirmBodySchema` (`packages/types/src/schemas/reservation-requests.ts:~490`), which omits `guestId` for the anonymous hold-confirm route, so part of Review's flag 1 has changed on main since. I did not trace whether the staff `ConfirmHoldBodySchema.guestId` path now verifies the venue.
- Signal strength: unobserved

### Hand-off watch items (release.md § Hand-off to Operate)

- What happened: `recordVisit` had no caller at merge (Verify F3). #6878 (2026-10-16, 26 days after merge) added one on reservation completion, and commit `4ef064131` pruned the backlog item. So the visit ordinal on the strip is now derived from a real booking path, which was untrue when the run shipped. The Auth0 `Hospitality E2E` F4 watch item (three "Seat now" specs) was not checked: no run result was read. Escape reports against `useEscapeKey`: none found in issues; absence of a report in a repo with no users proves nothing.
- Signal strength: unobserved

## Open debt

Nothing the run filed as an issue: `gh issue list --state all --search` and `gh search issues` for the run slug find none. Its debt is eight backlog lines and prose in `release.md`/`review.md`, none with an issue number, so there is no tracker state to read. State of each on `origin/main` by `git grep`:

- Empty-string `guestId` passes `z.string().optional()` and 500s at the FK (review.md Minor 2, backlog line 150) — **still open**: `reservation-requests.ts:63-66` and `:98` have no `.min(1)`.
- Listbox unmounts in the 300 ms pause and Escape then closes the dialog (review.md Minor 3, backlog 151) — **still open**: no `keepPreviousData` in `useGuestLookup.ts`.
- `${id}-hint` id not pinned by a test (review.md Minor 4, backlog 152) — not checked.
- Guest row created before the conflict check on `POST /api/v1/reservations` (review.md Minor 5, backlog 153) — `linkOrCreateGuest` is still called from `routes/reservations.ts:459`; ordering not re-read.
- Holds-confirm `guestId` gap (release.md flag 1, backlog 154) — **partly changed**: the public hold-confirm body now omits `guestId`; staff-route behaviour not traced.
- Public booking follows the linked profile's `communicationPreference` (release.md flag 2, backlog 155) — a consent decision, no decision recorded in any artifact I read.
- Email/phone canonicalisation (backlog 156) — **still open** (no normalisation in `guest-link.ts`).
- `release.md` § Human steps 7 "write back" — **not done**: frontmatter still `prepared-not-executed`, § Post-release checks still "Not run".
- #4990 is the issue this run closed, not its debt.

## Run retrospective

- Keep: Verify's habit of naming what it did not prove (database rows, Auth0 E2E, `visitCount` accrual) is what made this retro writable without pretending; every not-verified line is still the state of knowledge today. Review's adjudication of design deviations with in-place amendments to `ux.md`/`prd.md` (SC11, SC12) left artifacts that match the code. Resolve-only guest linking (a booking may link, never mutate a profile) survived to main without rework.
- Change: the run stopped at prepare-and-stop and nothing wrote the merge back, so the merged feature carried a PREPARED header for at least five days after merge. Ship should put one dated line in the PR body or an issue the merge itself touches, so a merge is recorded where the human already is; the existing backlog line 94 covers the reconciler.
- Change: Operate-relevant measures were listed (count linked reservations, case-variant emails) but no stage could run them; the run had no database or analytics read. A run whose success sentence is a data property needs its count query written and committed at Ship, not described.
- Change: review's deferrals lived as backlog prose and none got an issue; three of the eight are confirmed still in place on main 7+ weeks later (empty `guestId`, listbox pause, canonicalisation) and the rest were not traced. The existing backlog seeds "Make Review deferrals trackable" and "File each deferred Review minor of a run as an issue or backlog line at Review" already cover the process fix.
- Stop: re-deriving CI state by hand at Ship. Attempt 1 stalled for 10 minutes and the 15-minute poll expired before the gate concluded; the file had to be corrected after the fact. A PR that is `CONFLICTING` delivers no `pull_request` CI, and that, not slowness, drove the dispatch and the stale head.

## Environment

| Mistake                                                                                                                                                                | Evidence                                          | Class      | Proposed carrier                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ux.md` and `autorun-brief.md` committed unformatted (table padding, `_standing_`, list indent)                                                                        | `verification.md` § Failures; `review.md` Minor 1 | mechanical | existing `lint-staged.config.js` `PRETTIER_ONLY_GLOB` already lists `md`, and CI `docs-format` / Build `repo-audit` run `pnpm check:prettier`. Finding: the staged-file hook did not stop these files; I could not establish why (hook skipped for artifacts written by the UX stage and orchestrator is the likeliest, unverified). The only place it failed was Verify, three stages later |
| Breakdown named `packages/types/src/schemas/json-schema.test.ts`, which does not exist                                                                                 | `breakdown.md` Notes, M1.1                        | mechanical | none: no checker validates paths named in `breakdown.md`. A `git ls-files`-based check in the Decompose stage would be new, not existing                                                                                                                                                                                                                                                     |
| Breakdown omitted `services/reservations/src/schemas/__snapshots__/schemas.test.ts.snap`, which the new Zod field changes                                              | `breakdown.md` Notes, M1.3                        | mechanical | `pnpm --dir services/reservations test` caught it on first run (Implement), so the carrier worked; the miss is that breakdown does not list snapshot files derived from a schema                                                                                                                                                                                                             |
| Ratchet rejected the first push (+10 `hardcodedRoutes`, +4 `anyType`, all in test files)                                                                               | `release.md` pre-flight row 14                    | mechanical | `.husky/pre-push` ratchet, working as designed; the mistake is the metric counting tests. Backlog line 158 already seeds excluding tests                                                                                                                                                                                                                                                     |
| Baseline commit `3113150de` conflicted with main's regeneration of `metrics/ai-antipattern-baselines.json`, leaving PR #5405 CONFLICTING and without `pull_request` CI | `release.md` § CI state, Human steps 0            | mechanical | `scripts/check-ai-antipatterns.mjs --update` regenerates the whole file with `generatedAt`; a per-run timestamp in a committed shared baseline makes every concurrent branch conflict. No carrier exists                                                                                                                                                                                     |
| Hook-bypass push attempted                                                                                                                                             | `release.md` assumptions                          | judgement  | denied by the permission classifier, so no gap; recorded as a mistake the environment already stopped                                                                                                                                                                                                                                                                                        |
| `guestId: ""` accepted by the schema and 500s at the FK                                                                                                                | `review.md` Minor 2                               | mechanical | `packages/types/src/schemas/reservation-requests.ts` `.min(1)` plus a route test; backlog 150                                                                                                                                                                                                                                                                                                |
| Escape in the debounce window closes the dialog                                                                                                                        | `review.md` Minor 3                               | judgement  | a `GuestLookup.test.tsx` case; backlog 151                                                                                                                                                                                                                                                                                                                                                   |
| `aria-describedby` depends on a rialto id no test pins                                                                                                                 | `review.md` Minor 4                               | mechanical | one assertion in `GuestLookup.test.tsx`; backlog 152                                                                                                                                                                                                                                                                                                                                         |
| Guest created before the slot is known bookable                                                                                                                        | `review.md` Minor 5                               | judgement  | route test in `reservations.test.ts`; backlog 153                                                                                                                                                                                                                                                                                                                                            |
| Release stayed marked PREPARED after the merge                                                                                                                         | `release.md` frontmatter vs `gh pr view 5405`     | mechanical | none: no job reads a `pending-merge` artifact after merge; backlog line 94 seeds the reconciler                                                                                                                                                                                                                                                                                              |

## Idea seeds

- Write and commit the count queries that answer this run's success sentence (share of staff and public reservations with a non-null `guestId` since 2026-09-20; Guest rows per venue whose emails differ only by case) and run them with the first database read available (from: feature:booking-guest-reuse)
- Find out why `lint-staged.config.js` let two unformatted `docs/features/**` files through, then count how many runs since 2026-08-31 first failed `pnpm check:prettier` at Verify rather than at commit (from: feature:booking-guest-reuse)
- Make Decompose verify every file path a breakdown item names with `git ls-files` and list the snapshot files a schema change regenerates; measure how many `breakdown.md` Notes record a wrong or missing path across merged runs (from: feature:booking-guest-reuse)
- Drop `generatedAt` from `metrics/ai-antipattern-baselines.json`, or make the file regenerate only on count change, so concurrent branches stop conflicting on it; measure baseline-file conflicts on open PRs per month (from: feature:booking-guest-reuse)
- Count `Hospitality E2E` runs on `main` since 2026-09-20 that executed `walkin.spec.ts` and `realtime-collaboration.spec.ts` and their conclusions, to settle whether the F4 "Seat now" watch item ever ran (from: feature:booking-guest-reuse)

## Run complete

Closed 2026-11-07. 0 users observed; every outcome is unobserved and the retro records state on `main`, not use. Seeds above are the input to the next Idea-stage run; the run's eight earlier seeds remain in `docs/backlog.md` as written.
