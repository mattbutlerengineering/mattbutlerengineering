---
stage: idea
run: feature:availability-scenario-ux
date: 2026-11-08
assumptions:
  - "Owner direction, verbatim, given twice on 2026-11-08 and delegated each time: 'keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support.' No live interview was run; problem, evidence and the rung are drawn from the Owner's earlier words (feature:availability-setup-hierarchy idea.md amendment) and a scenario-led audit of the shipped-but-unmerged page (audit.md in this directory)."
  - "Ambition ladder: the Showstopper (recommended) is taken as the default because the Owner delegated; the four tests were run silently and pass (below). The Owner can pick Solid at the PRD gate."
  - "Stacked run: built on feat/availability-setup-hierarchy (PR #8511, open, awaiting the Owner's review), because every surface it changes is the one #8511 introduces. It ships as its own pull request after #8511."
  - "Work in flight (2026-11-08): nothing matches. Unmerged branches touching the same surfaces (feat/quick-setup-toast-days, feat/drawer-closed-day-no-close, feat/booking-rules, feat/ash-close-dialog-section) are squash-merged PRs #8354, #8353, #8311, #8489 with no run artifacts; the only open availability PR is #8511, this run's base."
---

# Idea: Availability, the everyday edits

> "keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support" — and, earlier: "the experience should be consistent but also flexible. The current availability page is overwhelming with too many options and it's difficult to follow the hierarchy."

## Problem

"The page opens on my week now, but the everyday jobs still fight me: picking the days a service runs takes extra clicks, Save is somewhere below the fold, the Close dialog asks me for dates and times the product already knows and then tells me the wrong thing happened, and the calendar repeats the same words in every cell so I can't see what's different."

## Who has it

The venue Manager, doing the scenario-catalogue jobs the product supports: a late service on two nights, a weeknight schedule, no lunch on Christmas Eve, closed every Monday in January, close early tonight, checking which days differ. They cope by clicking through extra steps, scrolling (a phone's week form is 2,421 px tall with Save at y ≈ 3,181), and re-reading toasts to check what really happened.

## Why now

The layered page (#8511) put the week form first; the audit of that page shows the remaining friction sits in the controls the Manager now reaches first (the week form, Close…, the calendar). Fixing them before operators learn the page costs least. Nothing here is live yet.

## Evidence

**Agent stand-in evidence, not validation** — interaction counts on fixture venues in the real UI, plus code reading (audit.md, 2026-11-08). Owner anecdote: 1. Independent operators: 0.

- Week form: after the first day is ticked the picker collapses to "Days: Mon · Change days" (`QuickSetupForm.tsx:66`); a Fri–Sat late service costs 9 steps (B10), a Mon–Thu schedule 8 (C13), a duplicate ~10 (C20). The Late preset opens at 10 PM regardless of Dinner, so the form shows "Late overlaps Dinner on Friday" and blocks Save (`quick-setup-draft.ts:137`).
- Save reach: phone week panel 2,421 px, Save at y ≈ 3,181 px, not sticky; a third service pushes desktop Save below the fold.
- Close dialog: "Thu, Dec 24 closed" for a Lunch-only closure (`CloseDialog.tsx:375`); "Step 1 of 2" with no step 2 (`CloseDialog.tsx:465`); a stray floor-plan line under "What" (`CloseStepOne.tsx:208`); "Starting at" starts at midnight; From/To pickers open months away; one dialog titled "Close", "Pause", "Booking only". D22 costs 9 steps, E39 11.
- Calendar: 28 of 35 month cells repeat the regular pattern; no legend; hours only in the drawer.
- Booking rules: a static line at the bottom of Schedules; changing them is 4 steps through ⋯ (H72).

## Ambition rung

Chosen: Showstopper (default; the Owner delegated), in the user's words: "make the ux easy for them and use our scenarios to support."
Not taken: Solid: fix the wrong toasts, the false "Step 1 of 2", the stray line and the clipped Select menu, and make the Booking line a button; Moonshot: availability tells the Manager what changes this week — upcoming holidays, closures and schedule switches in one weekly list with one-tap decisions (seeded in `docs/backlog.md`).
Demo: pass — "No lunch on Christmas Eve": Close…, One service · Lunch, the **Christmas Eve** date chip, Close → toast "Lunch closed on Thu, Dec 24", and the calendar shows one chip on Dec 24 among quiet cells.
Removes a step: pass — the date picker and month paging for holidays, the "Change days" re-open, and the overlap fix-up a preset caused are gone.
Only this product: pass — it already holds the venue's holiday list, services and close times, and uses none of them in the Close dialog or the presets.
Achievable: pass — riskiest piece is changing the shared `QuickSetupForm` days control (onboarding, quick setup, week panel, drawers) without breaking its validation and focus rules; spike (~2 days): always-visible day chips with a Fri–Sat shortcut behind the existing `QuickSetupDraft`, run against the existing form and onboarding tests.

## The demo

Before: a Manager closes Christmas Eve lunch in 9 steps — a date picker paged to December — and the toast says "Thu, Dec 24 closed" while the calendar repeats "Regular · Lunch · Dinner" in every cell. After: 4 steps with the Christmas Eve chip, the toast says "Lunch closed on Thu, Dec 24", and the calendar is quiet except a "Lunch closed" chip on Dec 24.

## Riskiest piece + spike

The shared week form's days control and new-service defaults: every frame (onboarding, quick setup, the week panel, Change regular week, the schedule editor) and their validation, focus-after-change and announcement rules. Spike as above.

## Cheapest kill test

Walk the audit's scenarios (B10, C13, C20, D22, E39, E41, E43, C19, H72) on the changed page with the interaction counter; if the counts do not drop and the toasts are not specific, the change is cosmetic.

## Solution hunch

Day chips that never collapse, with Weekdays / Weekends / Fri–Sat / Every day; presets that start after the previous service; a Save bar that stays in reach when there are unsaved changes; a Close dialog with holiday and tonight/tomorrow chips, pickers that open where the dates are, tonight's real times, and toasts that name what closed; month cells that stay quiet on the regular pattern with a legend; the Booking line as a button under the week. A hunch, not a design.

## Success in one sentence

"A Manager does the catalogue's everyday availability jobs — a two-night late service, a weeknight schedule, Christmas Eve lunch, Mondays in January, closing early tonight, seeing which days differ — in fewer steps than today, on a phone without scrolling to find Save, and every confirmation says exactly what changed."

## Unknowns & risks

- The shared form changes onboarding too; consistency is the point, but every onboarding test that pins the collapse changes.
- A sticky Save bar on phone competes with the app's own bottom chrome; layout must be checked at 375×812.
- Holiday chips depend on the venue's country holiday list (US/CA/MX today); venues elsewhere get only Tonight/Tomorrow/This weekend.
- Deferred, not dropped (seeded): holiday decisions saved per venue (needs persistence), Copy-to-days semantics (whether "every week" edits the regular week), a Tonight status line on /availability.
- Evidence is agent stand-in and one Owner anecdote; no operator has used the page.
