---
stage: verify
run: feature:availability-scenario-ux
date: 2026-11-08
commit: 74f2f327c
assumptions:
  - "Agent stand-in evidence: e2e runs locally on mocked APIs with a fake OIDC session (no E2E Auth0 credentials here), exercising the real UI; CI re-runs the e2e with the real session on the pull request. Interaction counts are Locator actions (helpers/interaction-counter.ts), not timed walkthroughs."
  - "The Owner delegated; no Owner walkthrough was run."
---

# Verification: Availability, the everyday edits

## Summary

On `74f2f327c`: 12 of 12 PRD criteria PASS; 0 FAIL; 0 NOT RUN as automated checks, with one human check not run — no Owner or operator walkthrough of the changed page (criterion 4's budgets are agent stand-in counts). Full e2e: 370 of 370 passed with `--retries=0`; the pre-existing flaky "Escape on Go to date (desktop, fr-CA)" test (seeded in `docs/backlog.md`) passed this run and failed once in the previous full run. Verdict: the everyday jobs meet their budgets and every confirmation names what changed.

```
apps/hospitality vitest:   Test Files 412 passed (412)   Tests 5810 passed (5810)
apps/hospitality typecheck (test + e2e configs): exit 0
apps/hospitality eslint src/ e2e/: 0 errors, 239 warnings (base 235; +4 prefer-rialto-components on calendar cells that were raw markup before; review.md)
e2e (availability-*, onboarding, venue-setup-hub, a11y, fold-budget, locale-sweep; --retries=0, mocked API + local fake OIDC): 370 passed (17.9m)
```

## Criteria & evidence

### 1. Day chips never fold away

- Check: `QuickSetupForm.test.tsx` (drawer keeps seven day inputs and no "Change days"; Fri–Sat in shared days, a service's own days and a block; "Choose at least one day."), e2e R2/R3 and `days-chips-drawer` screenshot.
- Evidence: unit suite green; e2e R2 5 ≤ 5, R3 7 ≤ 7.
- Result: PASS

### 2. Presets never create an overlap

- Check: `quick-setup-placement.test.ts` — Lunch→Dinner stays 17:00; Dinner→Lunch stays 11:30; Lunch to 15:00 + Dinner → 17:00; Lunch to 17:30 + Dinner → placed 17:30; Late after Dinner to 23:00 → 23:00–02:00 with no issues; re-preset keeps 17:00; typed overlap offers "Move Dinner to 6:00 PM"; no clear start → no action. e2e R1 and the demo-week spec (no longer forcing Dinner's times).
- Evidence: unit suite green; e2e R1 5 ≤ 5; `availability-demo-week.spec.ts` passes with the preset's own 5:00–10:00 PM.
- Result: PASS

### 3. Save in reach

- Check: `RegularWeekPanel.test.tsx` (`data-pinned` only when dirty); e2e R9 asserts Save's box inside the viewport at 375×812 and 1280×720 while dirty, and back in the flow after Save; screenshot review at 375×812 (footer pinned at the bottom mid-form).
- Result: PASS

### 4. Scenario budgets

- Check: `e2e/availability-everyday.spec.ts`, one test per row; #8511's S1–S10 and interaction baselines in `availability-scenarios.spec.ts` / `availability-interaction-*.spec.ts`; first paint ≤ 8 (prd.md note).
- Evidence:

  | # | Catalogue | Job | Before | Measured | Budget |
  |---|---|---|---|---|---|
  | R1 | B10 | Late Fri–Sat beside Dinner | 9 | 5 | ≤ 5 |
  | R2 | C13 | Weeknights Mon–Thu | 8 | 5 | ≤ 5 |
  | R3 | C20 | Duplicate with a later close | ~10 | 7 | ≤ 7 |
  | R4 | D22 | No lunch on Christmas Eve | 9 | 4 | ≤ 5 |
  | R5 | E39 | Closed every Monday in January | 11 | 10 | ≤ 10 |
  | R6 | E41 | Close early tonight at 9:30 PM | 4 | 4 (10 options) | ≤ 4, ≤ 12 options |
  | R7 | H72 | Largest online party | 4 | 3 | ≤ 3 |
  | R8 | C19 | Which days differ this month | 1 click + scan | 0 clicks | 0 |

- Result: PASS (agent stand-in counts; no human timing).

### 5. Confirmations name the thing

- Check: `close-draft.test.ts` / `close-text` tests for every What × When × start time; e2e R4 toast.
- Evidence: e2e R4 toast "Lunch closed on Thu, Dec 24"; unit: "Closed Thu, Dec 24 – Sat, Jan 2", "Closed every Monday, Mon, Jan 4 – Mon, Jan 25", "Closed from Sun, Nov 8 until you reopen", "Phone booking paused from 6:30 PM tonight".
- Result: PASS

### 6. The dialog says only true things

- Check: `CloseDialog.test.tsx` (no step line without affected bookings, "Step 1 of 2" with them; Pause title; One section hint as the disabled choice's description); e2e R10.
- Result: PASS

### 7. Dates and times the venue already has

- Check: `holidays.test.ts` (Nov 8, 2026 US: Thanksgiving, Christmas Eve, Christmas Day, New Year's Eve, New Year's Day), `CloseDialog.test.tsx` (chips, chip → One date, only the chosen chip selected), `close-draft.test.ts` (`startMinutes` from the next half hour; several dates ignore now); e2e R4 and R6; screenshot review.
- Result: PASS

### 8. Quiet calendar

- Check: `day-summary.test.ts`, `AvailabilityCalendar.test.tsx` (regular day quiet; regular closed weekday muted "Closed", no chip, no legend; ranking; "+1"; legend list; weekly only across ≥ 2 weeks; accessible names lead with the visible text, axe `label-content-name-mismatch` enabled); e2e R8, R11 and `availability-phone` "calendar cells say what they show".
- Result: PASS

### 9. Booking rules from the Booking line

- Check: `SchedulesTab.test.tsx` (button right after the week panel, opens Booking rules); e2e R7; screenshot at 375 (wraps).
- Result: PASS

### 10. No clipped menus

- Check: `AvailabilityToolbar.test.tsx` (right-aligned); e2e menu box inside the viewport at 1280×720 and 375×812.
- Result: PASS

### 11. The demo runs as written

- Check: e2e demo test — Close…, One service, Christmas Eve chip, Close (4 ≤ 5); toast exactly "Lunch closed on Thu, Dec 24"; December: Dec 24 has "Lunch closed", regular dates carry no schedule or service text.
- Result: PASS

### 12. Locales and regressions

- Check: i18n key-parity in the unit suite; `locale-sweep.spec.ts`; full availability/onboarding/Venue Setup e2e; changed expectations listed in breakdown Notes and commit messages (first paint ≤ 8, chip text on closed cells, Pause title, Range/Repeats To, Starting-at options, toast wording, legend list).
- Result: PASS

## Full e2e

```
/tmp/e2e-local.sh <worktree> e2e/availability-*.spec.ts e2e/onboarding.spec.ts e2e/venue-setup-hub.spec.ts \
  e2e/a11y.test.ts e2e/fold-budget.spec.ts e2e/locale-sweep.spec.ts --retries=0     (on 74f2f327c)
  370 passed (17.9m)
```

The run before the last fixes (`49c29a35c`) was 366 passed, 4 failed: R8 and R11 (the spec still read the old one-string legend), `availability-phone` "calendar cells say what they show" (a closed day's booking chip ran into its muted text — product fix `74f2f327c`), and the pre-existing Go to date Escape race. An earlier attempt launched from the wrong directory ran only 162 tests (the shell could not expand the spec glob) and was discarded.

## Failures

None open. Found and fixed during Implement/Review (each with a test): the Booking line overflowed at 375 px; month cells failed axe label-in-name (twice — a missing prefix, then muted text and a chip run together); the Close button did not name its target; chips sat above the When label; `placePreset` moved presets that clashed with nothing; the legend called one week's run weekly; Range/Repeats/Until-reopen toasts named only the first date; regular closed weekdays carried chips; a closed day carried a booking chip.

## Not verified

- No Owner or operator walkthrough; budgets are agent stand-in counts.
- Auth0, the real API and production data (mocked e2e; CI runs the real session).
- Visual baselines (`visual.spec.ts`, Linux, own workflow): `/availability` and the Close dialog change by design; after merge `visual-regen-trigger.yml` opens the baseline PR for review.
