---
stage: verify
run: feature:availability-setup-hierarchy
date: 2026-11-08
commit: b8e2511ee
assumptions:
  - "Agent stand-in evidence. e2e runs locally against mocked APIs (`e2e/api-mocks.ts` and per-spec stubs) with a fake OIDC session written to `e2e/.auth/user.json` and a dev server pointed at a fake authority, because no E2E Auth0 credentials exist in this environment. That exercises the real UI, routes and client code; it does not exercise Auth0, the API or production data. CI's E2E job runs the same specs with the real ROPC session."
  - "Interaction counts are Locator actions counted by `e2e/helpers/interaction-counter.ts`, not timed human walkthroughs."
  - "The Owner delegated the run; no Owner walkthrough was available. Every criterion that needs one is NOT RUN below."
---

# Verification: Availability setup hierarchy (with the 2026-11-08 amendment)

## Summary

On commit `b8e2511ee`: 21 of 24 PRD criteria PASS, 0 FAIL, 3 NOT RUN in part or whole — criterion 2 (the "before" editor count on `7c051456f`), criterion 3 (the `7c051456f` interaction baseline and the Owner's ≤ 5 minute hand timing) and criterion 9 (the 2026-11-07 hub demo as one end-to-end script; its parts pass separately). Breakdown item 10 (Setup hierarchy end-to-end scenarios) stays unchecked for the same `7c051456f` baseline. Verdict: the amendment's acceptance bar (criteria 14-18 and 23) passes in full; the three NOT RUN items are baselines and human timings this environment could not produce, not observed failures.

Suites on `b8e2511ee`:

```
apps/hospitality vitest:   Test Files  410 passed (410)   Tests  5701 passed (5701)
packages/rialto vitest:    Test Files  194 passed (194)   Tests  3099 passed (3099)   (run on 7b72d91a2; b8e2511ee touches no rialto file)
apps/hospitality typecheck (tsconfig.test.json + tsconfig.e2e.json): exit 0
apps/hospitality eslint src/ e2e/: ✖ 235 problems (0 errors, 235 warnings)   (pre-run baseline: 235 warnings)
pnpm regen --check: no stale artifacts (after f204428aa)
e2e (availability-*.spec.ts, onboarding, venue-setup-hub, a11y, fold-budget, locale-sweep; --retries=0):
  354 passed (17.4m)
```

## Criteria & evidence

### 1. One surface shows every type and its nesting (2026-11-07)

- Check: e2e `venue-setup-hub.spec.ts`; unit `setup-tree.test.ts`.
- Evidence:
  ```
  venue-setup-hub.spec.ts:43 › an empty venue lists every resource type as not set up, and says what each is  ✓
  venue-setup-hub.spec.ts:103 › an operational venue stays on /setup and sees its floor plan and schedule  ✓
  ```
- Result: PASS

### 2. One primary editor per resource type

- Check: e2e `availability-setup-hierarchy.spec.ts` (a) asserts the "after" side: each type opens one primary editor from the hub.
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:77 › (a) each resource type has one primary editor, reached from the hub  ✓
  ```
- Result: PASS (after side). NOT RUN: the "before" count on `origin/main` @ `7c051456f`. A throwaway worktree at that commit could not run (its workspace packages and dists differ from the installed ones: "does not provide an export named `decodeWeek`"), so no before number is quoted.

### 3. The setup scenario is fast, and not slower than today

- Check: e2e (b) counts the two-service varied week in quick setup.
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:115 › (b) an empty venue: a two-service varied week in quick setup, then one section blocked for one date  ✓
  (b) two-service varied week in quick setup: 14 interactions; same week through the Schedules editor (DEMO_WEEK_VIA_SCHEDULES_COUNT): 26
  ```
- Result: NOT RUN against its named baseline. The spec compares with the in-repo Schedules-path constant (26), not with the `7c051456f` quick-setup count the criterion names (not measurable here, see 2). The Owner's ≤ 5 minute hand timing was not done.

### 4. Block a section for a date

- Check: e2e `availability-close-section.spec.ts`; hub entry; server tests merged with #8487.
- Evidence:
  ```
  availability-close-section.spec.ts:166 › a Manager closes the Bar for a date, and the calendar names it  ✓
  availability-close-section.spec.ts:206 › ?closeSection= opens the Close dialog on that section, and leaves no param behind  ✓
  venue-setup-hub.spec.ts:121 › a section's Close for a date… opens the Close dialog on that section  ✓
  ```
- Result: PASS. Note: this spec failed once during Verify because `packages/types/dist` in the worktree was built before `sectionId` existed (the client stripped the field); after `pnpm build` in `packages/types` it passed in every run (2/2, then 15/15 repeated, then the final full run). CI builds packages from source.

### 5. One term per concept

- Check: unit `src/i18n/venue-setup-glossary.test.ts` plus the i18n suite.
- Evidence:
  ```
  apps/hospitality vitest: 410 files passed, including src/i18n/venue-setup-glossary.test.ts
  ```
- Result: PASS

### 6. State is visible

- Check: e2e hub empty/operational states; quick setup marks hours done.
- Evidence:
  ```
  venue-setup-hub.spec.ts:43 › an empty venue lists every resource type as not set up, and says what each is  ✓
  availability-quick-setup.spec.ts:12 › a Manager sets the bistro week from an empty venue and Venue Setup marks hours done  ✓
  ```
- Result: PASS

### 7. No control lost

- Check: e2e (c); Host History/Go to date kept (review fix and page tests).
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:178 › (c) Tonight, Compare services, History, Booking rules, Change regular week, Copy day, Special dates and the guest-view strip are reachable and act  ✓
  availability-setup-hierarchy.spec.ts:226 › (c) Tonight is one click from the Timeline header  ✓
  ```
- Result: PASS

### 8. Old routes still work

- Check: e2e hub routes and entry contract.
- Evidence:
  ```
  venue-setup-hub.spec.ts:165 › an unready venue is still sent to /setup from /timeline  ✓
  venue-setup-hub.spec.ts:172 › /setup/hours still lands on /availability  ✓
  availability-entry.spec.ts:48 › ?from=setup shows the Venue Setup back-link and ?closeSection is removed  ✓
  ```
- Result: PASS

### 9. The demo runs as written (2026-11-07 hub demo)

- Check: its parts pass separately — every node "not set up" on an empty venue (hub :43), a two-service varied week and one section blocked for one date ((b) :115), hours marked done on the hub (quick-setup :12).
- Evidence: the lines quoted under 3, 4 and 6.
- Result: NOT RUN as one script: no single spec walks the hub from empty through a varied week and a section closure and then reads the section on the hub's Special dates node.

### 10. Hosts see no unusable editor

- Check: e2e hub Host; hierarchy (e).
- Evidence:
  ```
  venue-setup-hub.spec.ts:177 › a Host sees the tree and no editor, save or set-up call to action  ✓
  availability-setup-hierarchy.spec.ts:232 › (e) a Host sees no editor on the hub, the nav or the Availability page  ✓
  ```
- Result: PASS

### 11. Three locales

- Check: i18n key-parity and catalog tests in the unit suite; `availability-locale.spec.ts`, `locale-sweep.spec.ts`.
- Evidence:
  ```
  apps/hospitality vitest: 410 files passed (src/i18n included)
  e2e: availability-locale.spec.ts and locale-sweep.spec.ts passed within the 354
  ```
- Result: PASS

### 12. No regressions

- Check: full hospitality and Rialto unit suites; the availability, onboarding, Venue Setup, a11y, fold-budget and locale-sweep e2e set.
- Evidence: Summary block above.
- Result: PASS. Specs whose entry moved were updated deliberately; each change is listed with its reason in commit `220e10296` and the scenario agent's report (calendar-first flows open `?tab=calendar`; "Change regular week…" → "Starting later…"; "New schedule" → "Add a schedule…"; header ⋯; the new service wording).

### 13. Dead onboarding hours component removed

- Check: file absence (merged #8483) and onboarding tests.
- Evidence:
  ```
  apps/hospitality/src/components/venue-onboarding/OperatingHoursStep.tsx — absent; onboarding.spec.ts 10 passed
  ```
- Result: PASS

### 14. Same first layer after onboarding

- Check: e2e W10 and the demo.
- Evidence:
  ```
  availability-scenarios.spec.ts:71 › W10: after quick setup the first layer is the same week form, in 0 interactions  ✓
  ```
- Result: PASS

### 15. Calm first paint (≤ 7 outside the week panel)

- Check: e2e first-paint counter.
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:270 › PRD 15: a Manager's first paint has at most 7 actionable controls outside the week panel  ✓
  measured: 7 — Close…, Pause online booking, More actions, Schedules, Calendar, Special dates, Add a schedule…  (before: 12 fixed, up to 15)
  ```
- Result: PASS

### 16. One time range per service

- Check: unit `service-hours.test.ts`, `service-hours-surfaces.test.tsx`, day editor, AddDateRow (review R9).
- Evidence:
  ```
  "Lunch 11:30 AM–3:00 PM, last seating 2:00 PM" asserted identical on RegularWeekLine, the hub service row, the day summary and the day editor; 410 files passed
  ```
- Result: PASS

### 17. Edit in place, from today

- Check: e2e S1 asserts the save's start date is today and that the stranded-bookings preview ran; W21 Starting later….
- Evidence:
  ```
  availability-scenarios.spec.ts:107 › S1 / W11 … (budget 6)  ✓   — expect(startsOn).toBe(localDay()); expect(previews.requests()).toBeGreaterThan(0)
  availability-scenarios.spec.ts:411 › W21: Starting later… carries the edited week into Change regular week  ✓
  ```
- Result: PASS. The "from today" default reverses availability-config-usability `ux.md:200` and remains flagged for the Owner.

### 18. Scenarios start from the first layer, within budget

- Check: `availability-scenarios.spec.ts`, one test per scenario on the ux.md fixtures.
- Evidence:

  | Scenario | Catalogue | Measured | Budget |
  |---|---|---|---|
  | S1 dinner Tue–Sat 17–22 | A1 | 6 | 6 |
  | S2 add lunch | B7 | 3 | 5 |
  | S3 weekend brunch | B8 | 5 | 6 |
  | S4 last seating | A4 | 3 | 3 |
  | S5 holiday closure | D21 | 6 | 6 |
  | S5 with 14 bookings | D21 | 8 | recorded |
  | S6 special hours | D23 | 6 | 7 |
  | S7 week-long vacation | E37 | ≤ 8 (passes) | 8 |
  | S7 with bookings | E37 | 11 | recorded |
  | S8 seasonal schedule | C16 | 10 | 10 |
  | S9 booking rules | H74/H75 | 5 | 5 |
  | S10 pause tonight | L107/E44 | 2 | 3 |

  Interaction baselines: `availability-interaction-baselines.spec.ts` and `-guards.spec.ts` pass (≤ 5 uniform bistro, ≤ 13 large setup).
- Result: PASS. S7 first measured 9; two product bugs behind it were fixed, not budgeted away (the To picker's month and the inverted range).

### 19. Hierarchy in words on the page

- Check: unit `SchedulesTab.test.tsx` (Regular week heading, Other schedules, Add a schedule…); e2e S8 shows the new schedule under Other schedules.
- Evidence:
  ```
  availability-scenarios.spec.ts:345 › S8 / W18: a seasonal schedule from the regular week (budget 10)  ✓
  ```
- Result: PASS

### 20. Onboarding uses the same names

- Check: unit tests on the hours step intro and the launch caption.
- Evidence:
  ```
  VenueOnboardingPage.test.tsx: "Your services and the days they run. Change it any time in Availability → Schedules."  ✓
  LaunchStep.test.tsx › says under the Guest preview where these hours are changed after launch  ✓
  ```
- Result: PASS

### 21. Night-of actions stay quick

- Check: e2e desktop and 375×812.
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:286 › PRD 21: Close… and Pause online booking are one interaction on a desktop  ✓
  availability-setup-hierarchy.spec.ts:303 › PRD 21: on a 375x812 phone Close… is one interaction and Pause online booking two  ✓
  ```
- Result: PASS

### 22. Hosts keep today's page

- Check: e2e W22 and (e).
- Evidence:
  ```
  availability-scenarios.spec.ts:441 › W22: a Host's page is today's page, read-only  ✓
  availability-setup-hierarchy.spec.ts:249 › (e) a Host's Availability page is read-only: Calendar and Special dates, History and Go to date only  ✓
  ```
- Result: PASS

### 23. The demo runs as written (amended)

- Check: e2e demo spec.
- Evidence:
  ```
  availability-setup-hierarchy.spec.ts:328 › onboarding's week is the first thing /availability shows; schedules and special dates are one layer down  ✓
  ```
- Result: PASS

### 24. Locales and regressions

- Check: as 11 and 12.
- Evidence: Summary block above.
- Result: PASS

### Breakdown acceptance not covered by a PRD criterion

- Regular week edit hook — inline and drawer saves byte-identical: `use-regular-week-edit.test.tsx` "submit() with fixedStart=today sends the same payload and scopeConflicts as picking Starting = today" ✓. PASS.
- Add a schedule seed — no path saves a dateless schedule with days the Manager did not choose: `ScheduleDrawers.test.tsx` "never saves a dateless schedule with days the Manager did not choose" ✓ and "saves an undated schedule on days the Manager picks … (C13)" ✓. PASS.
- Rialto Calendar opening month: `Calendar.test.tsx` "opens on the min date's month when there is no value and min is after today" ✓ (+ min = today, max < min, invalid min). PASS.

## Failures

None open. Observed and fixed during Verify/Review (each with a test): the Close dialog's To picker opened on today's month and allowed days before From; moving From past To left an inverted range; duplicate field ids stripped the drawer's accessible names; a phone Calendar density regression; review R1-R4 (stale week panel after other saves, settling across venues, settling with no exit on a failed refetch, seeded days leaking before Starting) and R5-R12; the first R4 fix over-blocked undated schedules (C13) and was corrected in `b8e2511ee`.

## Not verified

- The `7c051456f` baselines for criteria 2 and 3 and breakdown item 10 (old-commit worktree not runnable here). Item 10 stays unchecked.
- The Owner's hand-timed ≤ 5 minute setup (criterion 3) and any independent operator: none available.
- Criterion 9 as one end-to-end script.
- Auth0, the real API and production data: e2e ran on mocks with a fake OIDC session (frontmatter). The pre-merge CI E2E job is the check that uses the real session.
- `visual.spec.ts` (Linux-only baselines, its own workflow) was not run; screenshots of `/availability` change by design and its baselines will need the workflow's update path.
