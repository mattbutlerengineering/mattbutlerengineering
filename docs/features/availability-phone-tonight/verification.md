---
stage: verify
run: feature:availability-phone-tonight
date: 2026-11-08
commit: 705a720e4
assumptions:
  - "Agent stand-in evidence: e2e runs locally on mocked APIs with a fake OIDC session (no E2E Auth0 credentials here), exercising the real UI. CI re-runs it with the real session on the pull request. Counts are Locator actions (helpers/interaction-counter.ts); heights are bounding boxes at 375×812."
  - "The Owner delegated; no Owner walkthrough was run."
---

# Verification: Availability on a phone, and what's on tonight

## Summary

On `705a720e4`, all 10 PRD criteria pass, with 0 FAIL and 0 automated checks NOT RUN. One human check was not run: no Owner or operator has walked the changed page. Full e2e is 547 of 547 with `--retries=0`. Verdict: on a phone, the week reads as one line per service, with Dinner's line in the first viewport and the panel at 29% of its old height. `/availability` says today's hours and what's in force tonight with no clicks.

```
apps/hospitality vitest:   Test Files 419 passed (419)   Tests 5911 passed (5911)
apps/hospitality typecheck: 0 errors
apps/hospitality eslint src/ e2e/: 0 errors, 240 warnings (base 239; +1 react-hooks/set-state-in-effect, review.md)
e2e (availability-*, onboarding, venue-setup-hub, a11y, fold-budget, locale-sweep, timeline*; --retries=0,
     mocked API + local fake OIDC) on 705a720e4: 547 passed (27.6m)
```

## Criteria & evidence

### 1. Phone service lines

- **Check:**
  - `QuickSetupForm.collapsible.test.tsx`: closed by default with no fields mounted; one open at a time; a non-collapsible form is unchanged.
  - `RegularWeekPanel.test.tsx` and `ChangeRegularWeekDrawer.test.tsx`: lines on a phone, none on tablet or desktop.
  - Onboarding tests are unchanged and green.
  - e2e `availability-phone-tonight.spec.ts`: P1 lines, and the desktop test (no line headers, form as before).
- **Result:** PASS

### 2. Problems never hide

- **Check:**
  - Unit: a service with a problem stays open and shows the problem on its line.
  - Pressing its header pins the line.
  - Fixing the problem from inside the line keeps the same field focused (review M1).
  - A refused Save focuses the first problem field, on phone and desktop.
  - e2e: an overlap keeps Dinner's line open (`aria-expanded="true"` after a press), and a refused Save focuses the Opens combobox.
- **Result:** PASS

### 3. Focus stays put

- **Check:**
  - Unit: Add focuses the new name; Remove focuses the next header, or the previous one if it was last; rotating across 767 px keeps the same input element.
  - e2e at 375 px: Add another service focuses the name, and typing keeps the line open ("Late supper").
- **Result:** PASS

### 4. Phone budgets

| # | Job | Before (base 6f15dbcb5) | Measured | Budget |
|---|---|---|---|---|
| P1 | Change Dinner's close and save, 375×812 | 3 clicks + ≈ 550 px scroll (Dinner's Closes at y = 1,357) | 4, with Dinner's line in the first viewport | ≤ 4, line in the first viewport |
| P2 | Week panel height, no changes | 2,472.7 px | 719.1 px | ≤ 1,236 px |
| T1 | Learn tonight's state | 2 (Timeline, Tonight) | 0 | 0 |
| T2 | Reach the Tonight controls | 2 | 1 | ≤ 2 |

- First paint outside the week panel is ≤ 9: `availability-setup-hierarchy.spec.ts`, PRD 15/23 tests, updated deliberately from ≤ 8.
- The calendar first-screen guards hold: 6 whole days (≥ 5), 4 (≥ 4), and the desktop first day at y = 487.5 (< 500).
- P1 closes Dinner at 10:00 PM, not 11:00 PM, because F-one's Dinner already closes at 11:00 PM; the saved PUT has `closesAt` 1320.
- R9 (phone) is 4, up from 3: it now opens Lunch's line first. A deliberate trade for criterion 1.
- **Result:** PASS (agent stand-in counts)

### 5. The Today line says what's true

- **Check:** `today-line.test.ts` has one test per item row, plus:
  - the closed day;
  - bounded windows;
  - night-of bands skipped as closures;
  - the service day before rollover;
  - an expired night-of rule;
  - an old API with no services;
  - an unknown rule id;
  - a from-time band for a service not running that day.

  `TodayLine.test.tsx` checks ordered pieces. e2e T1, at desktop and 375, checks:
  - hours alone;
  - "Lunch closed", "Closing early · 9:30 PM", "Closed 3:00 PM–4:00 PM" and "2 tables blocked · rest of tonight";
  - the night-of close-early chip;
  - a closed day reading "Closed";
  - a Host seeing the same line.
- **Result:** PASS

### 6. Said once

- **Check:** `TodayLine.banner.test.tsx` runs the real hook and model with the banner up: "Online and phone paused" becomes "Phone paused", and an online-only pause drops out. e2e: with the banner up, the line has no "Online paused".
- **Result:** PASS

### 7. To the Tonight controls

- **Check:**
  - `TonightControl.test.tsx`: `defaultOpen` opens it at mount.
  - `TimelineTonight.test.tsx`: `?tonight=open` opens the panel, the param is removed, and the request is spent once (no reopen on remount).
  - e2e T2 on both viewports: one click, the panel open, the URL without the param; Back lands on `/availability`; a reload keeps the panel closed.
- **Result:** PASS

### 8. Honest while loading or failed

- **Check:** `TodayLine.test.tsx`: loading keeps the static description in the slot (no jump); failed shows "Couldn't load today's hours." with Retry calling refetch (`useTodayLine.test.ts`); the rest of the page renders.
- **Result:** PASS

### 9. Locales

- **Check:**
  - The i18n key-parity test passes in the unit suite.
  - `availability.today.*` and `availability.quickSetup.line.*` exist in en-US, es-MX and fr-CA.
  - `locale-sweep.spec.ts` passes.
  - The fr-CA phone guard ("everything that adds a line", Tokyo time zone) passes.
- **Result:** PASS

### 10. No regressions

- **Check:** full e2e is 547/547 on `705a720e4`. Deliberate expectation changes:
  - first paint ≤ 9;
  - R9 (phone) opens a line;
  - the 375 px fit scans skip visually hidden separators.

  The run before the review fixes (`801c8f083`) was 543/546. Three failures were caused by the phone lines (R9, and the axe label-in-name check in Change regular week at 375 in en-US and fr-CA); all three are fixed.
- **Result:** PASS

## Failures

None open. Found and fixed during Implement and Review:
- the first Today line block failed the calendar guards;
- P2 failed at 1,553 px until the Guest preview row was added;
- line headers failed axe label-in-name;
- a forced-open line collapsed while it was being fixed (review M1);
- reviewer minors m1–m8.

## Not verified

- No Owner or operator walkthrough; counts are agent stand-in.
- Auth0, the real API and production data: the e2e is mocked, and CI runs it with the real session.
- A real phone: the run used Chromium at 375×812, not a touch device with an on-screen keyboard. The keyboard-dismiss part of M1 is inferred from the DOM (same field stays mounted and focused).
- Visual baselines (`visual.spec.ts`, Linux, its own workflow): `/availability` changes by design. After merge, `visual-regen-trigger.yml` opens the baseline PR.
