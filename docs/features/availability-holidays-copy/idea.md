---
stage: idea
run: feature:availability-holidays-copy
date: 2026-11-08
assumptions:
  - "Owner direction, verbatim, given a fourth time on 2026-11-08 and delegated: 'keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support.' No live interview; problem and evidence come from the scenario-led audit (docs/features/availability-scenario-ux/audit.md §3 items 4 and 5) and code facts gathered for this run."
  - "Two decisions the backlog held for the Owner are taken by default, on the audit's recommendation. The Owner can veto at the PRD gate or in review. (1) 'Open as usual' is a venue fact, saved to the venue, not a per-browser preference. (2) Copy to other days means either 'just this week' (one-off special hours) or 'every week', which changes the regular week. It no longer creates a never-ending special-hours rule."
  - "Ambition ladder: Showstopper by default; the four tests were run silently and pass (below)."
  - "Stacked run: built on feat/availability-phone-tonight-v2 (PR #8538, open, awaiting the Owner). Rounds 1–2 (#8511, #8528) are merged."
  - "Work in flight (2026-11-08): none. No unmerged branch touches holidays, copy or special dates."
---

# Idea: Holiday decisions that stick, and Copy that says what it does

> "keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support" — and, earlier: "the experience should be consistent but also flexible."

## Problem

"I marked Christmas Eve 'open as usual' on my laptop. Then the floor manager saw it on the iPad as not planned and planned it again. Planning all six holidays is a giant form. And when I copied Tuesday's hours to Wednesday and Thursday it said 'Copied to 105 dates'. Now every Wednesday says 'Special hours', even though they're just my normal hours."

## Who has it

The Manager, doing the catalogue's holiday jobs and copy jobs:
- **Holidays:** D27 plan the year's holidays, D33 decide which holidays to open, D22 and D24.
- **Copy:** C15 copy one day's hours to other days, C17 use another day's hours, C18, A3.

A second Manager or device suffers too, because it re-sees every decision. They cope by:
- planning holidays one by one;
- re-deciding holidays on each device;
- ignoring "Special hours" labels that aren't special.

## Why now

Rounds 1–3 made the week, the Close dialog, the calendar and tonight easy; the audit's two remaining items are these. Both were held back as Owner decisions (backlog, 2026-11-08). The audit recommended an answer for each, and taking the recommended answers lets the work proceed; the Owner can still veto.

## Evidence

**Agent stand-in evidence, not validation.** Interaction counts on fixture venues and code reading (audit.md; code facts this run). Owner anecdote: 1. Independent operators: 0.

- **Holidays:**
  - "Open as usual" lives in `localStorage` (`open-as-usual.ts:2`, key `mbe-availability-open-as-usual:<venue>`). Another Manager or device re-sees the holiday, the calendar nudge ("Thanksgiving is Thu, Nov 26 and isn't planned yet", `NextHolidayNudge.tsx`) comes back, and a blocked or garbled storage read shows every holiday again.
  - "Plan all 6" is 3,711 px with 83 controls (audit, r2-D27-plan-sheet-top.png).
  - Marking three holidays "open as usual" and planning three costs about 7 steps.
- **Copy:**
  - Copy to other days defaults Until to "No end" and saves one repeating special-hours rule (`copy-day.ts:34-56`). The toast reads "Copied to 105 dates".
  - Every copied weekday then reads "Special hours" in the calendar, even when the hours equal the regular week. C15 costs 6 steps.
  - Nothing says "this changes every Wednesday from now on", and nothing offers the regular week, which is where "every Wednesday" belongs.

## Ambition rung

Chosen: Showstopper (default; the Owner delegated), in the user's words: "make the ux easy for them and use our scenarios to support."

Not taken:
- **Solid:** sync "Open as usual" to the venue, and change Copy's default Until to the end of this week.
- **Moonshot:** a venue-type holiday template ("restaurants like yours close these 3"), learned across venues. That needs data across venues the product doesn't hold. The weekly digest is already seeded.

The four tests:
- **Demo: pass.** On Special dates, Upcoming holidays shows one line per holiday with **Closed · Open as usual · Special hours**. The Manager taps "Close these 3" for Thanksgiving, Christmas Day and New Year's Day, then "Open as usual" on Christmas Eve. On the iPad, the floor manager sees all four decided. Then "Copy Tuesday to Wed, Thu" → "Every week" → "Wed and Thu will use Tuesday's hours from Nov 17. This changes your regular week." → Save, and the calendar keeps saying nothing special about Wednesdays.
- **Removes a step: pass.** Re-deciding on each device is gone, as is the 83-control plan sheet for the common choices. "Copied to 105 dates" and the cleanup of false "Special hours" labels go too.
- **Only this product: pass.** It holds the venue's holiday list, its regular week and the resolver that knows when two days' hours are already the same.
- **Achievable: pass.** The riskiest piece is a new date-rule kind (`open_as_usual`) that every consumer must ignore or understand: the engine's `resolveDay`, closure-overlap, `isPlanned`, guest booking, preview, the calendar summary and the server's row writer. `kind` is a string column, so there's no SQL migration. Spike (~1 day): add the kind behind the Zod union, run the engine, server and app suites, and see what TypeScript's exhaustive switches flag.

## The demo

**Before:** the Manager marks "Open as usual" on Christmas Eve, and a colleague's device still nags. Copying Tuesday to Wed–Thu says "Copied to 105 dates", and every Wednesday reads "Special hours".

**After:**
- Holidays are one line each. Three are closed in one tap; Christmas Eve is open as usual for everyone.
- Copy offers "Just this week" or "Every week (changes your regular week)". It says exactly what will change before Save, and says "Already the same" when nothing would.

## Riskiest piece + spike

The new `open_as_usual` date-rule kind across `packages/types`, `packages/availability`, `services/reservations` and the app. Spike as above. Also: an older server rejects the unknown kind with a 400 during a deploy window, so the app must show that save failing honestly, not as success.

## Cheapest kill test

- **Holidays:** mark Christmas Eve "Open as usual" in one browser context and check that a second context (another Manager) sees it decided, with the nudge gone.
- **Copy:** copy Tuesday to Wed–Thu "Every week" and check that the regular week changed and no special-hours rule was created; copy a day onto days that already match and check that nothing is saved.

If either fails, the change is cosmetic.

## Solution hunch

**Holidays:**
- Upcoming holidays as one line per holiday with a three-way choice: Closed (saves a closure), Open as usual (saves an `open_as_usual` rule), Special hours (opens the existing sheet for that date).
- A header action closes the usual three in one tap.
- Decided holidays fold into a "Decided" group, each with a Change action.
- Horizon of the next 12 months, grouped by month.

**Copy:**
- After choosing days, a consequence line and a choice: Just this week, or Every week, which opens Change regular week prefilled.
- Days already equal are skipped, and "Already the same" when all are.

A hunch, not a design.

## Success in one sentence

"A Manager decides the year's holidays once, in a few taps, and every colleague sees the same decisions. Copying a day's hours says exactly what will change and never leaves 'Special hours' on normal days."

## Unknowns & risks

- **Existing marks.** "Open as usual" marks already in browsers are not migrated. Those holidays reappear once, as undecided, which is the same failure mode as today. A one-time upload would write without the Manager acting, so it's not done.
- **Existing copy rules.** Repeating special-hours rules from Copy stay as they are; this run changes what Copy creates, not what exists. Seeded: offer to fold such rules into the regular week.
- **Hours that differ across a week.** "Every week" changes the regular week, so it needs a starting date (from the copied date's week), like Change regular week.
- **Deploy window.** If the app reaches users before the server, saving "Open as usual" fails until the server deploys. The failure must be honest.
- **Evidence.** Agent stand-in, plus one Owner anecdote.
