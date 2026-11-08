---
stage: idea
run: feature:availability-phone-tonight
date: 2026-11-08
assumptions:
  - "Owner direction, verbatim, given a third time on 2026-11-08 and delegated: 'keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support.' No live interview; problem and evidence come from the scenario-led audit (docs/features/availability-scenario-ux/audit.md §3 items 2 and 6), which rounds 1 and 2 left open, and from code facts gathered for this run."
  - "Ambition ladder: Showstopper taken by default because the Owner delegated; the four tests were run silently and pass (below)."
  - "Stacked run: built on feat/availability-scenario-ux (PR #8528, itself on #8511). Both are open, with no review yet. The rule that a PR waiting on the Owner does not block new work applies; the risk of a three-deep unreviewed stack is reported to the Owner."
  - "Work in flight (2026-11-08): none. Unmerged branches touching the same files (feat/ash-tonight-section-grouping, refactor/hospitality-availability-problem, feat/ash-availability-entry-contract) are squash-merged as #8485, #8508, #8488. Takes the backlog seed 'Show tonight's state on /availability' (feature:availability-scenario-ux)."
  - "Audit items #4 (holiday decisions saved per venue: needs persistence) and #5 (what Copy to other days means: a product decision) stay seeded and out of this run."
---

# Idea: Availability on a phone, and what's on tonight

> "keep working on availability configuration and make improvements from the user perspective. make the ux easy for them and use our scenarios to support" — and, earlier: "the experience should be consistent but also flexible. The current availability page is overwhelming with too many options and it's difficult to follow the hierarchy."

## Problem

"On my phone the week is a wall of pickers. Every service is open with every control, so I scroll past Lunch's presets and times to reach Dinner's close. And when I open Availability before service, nothing tells me what tonight actually looks like. Is online paused? Did someone close early? Is lunch off today? I have to go to the Timeline to find out."

## Who has it

- **The Manager on a phone**, doing the week edits the catalogue lists (A1–A4, B7–B10, C13/C14: change a close time, add a late service, adjust a schedule) and checking before service (E40, E41, L107–L111).
- **The Host**, who opens Availability to see whether tonight is normal.

They cope by scrolling 2,400 px, and by switching to the Timeline and opening its Tonight panel to see the night-of changes.

## Why now

Rounds 1–2 (#8511, #8528) put the week first, kept Save in reach and made the Close dialog's Tonight chip one tap. The two things left from the audit's top eight are the phone form's length and the missing "tonight" answer. Neither needs data the product does not already load: today's hours are in the day summary, and night-of changes are date rules. Nothing of rounds 1–2 is live yet, so the page changes once for operators, not three times.

## Evidence

**Agent stand-in evidence, not validation.** Interaction counts and layout measurements on fixture venues, plus code reading (audit.md, 2026-11-08; code facts this run). Owner anecdote: 1. Independent operators: 0.

- **Phone week form:**
  - The week panel is 2,421 px tall (audit, r2-PH-02-schedules-long.png).
  - Every service is always expanded: `QuickSetupForm.tsx` maps each service to a `ServiceRow` with no collapsed state.
  - That is about 17 controls per service: legend, 4 presets, name, 3 time pickers, 7 day boxes and 4 shortcuts, Different hours, Remove (`QuickSetupServiceRow.tsx`).
  - The app already knows the viewport (`hooks/useViewport.ts`, `PHONE_QUERY = "(max-width: 767px)"`), but nothing in the form changes its structure on phone.
- **Tonight:**
  - The Tonight controls and their chips ("Online paused · rest of tonight", "Closing early · 9:30 PM", "2 tables blocked · rest of tonight") are on the Timeline only (`TimelinePage.tsx:610`, `TonightControl.tsx:561`).
  - `/availability` shows only an online-pause banner (`AvailabilityPage.tsx:771`).
  - A Close… → Tonight closure (round 2) is a closure date rule for today, and nothing on `/availability` reflects it until the Manager opens the calendar.
  - Today's hours and closures are already fetched for the Timeline and Briefing (`useStaffTonight.ts:29-35`, with the service-day rollover).

## Ambition rung

Chosen: Showstopper (default; the Owner delegated), in the user's words: "make the ux easy for them and use our scenarios to support."

Not taken:
- **Solid:** a one-line "Tonight" text on `/availability` linking to the Timeline, and a CSS-only tighter phone layout.
- **Moonshot:** the weekly "what changes this week" list, already seeded in `docs/backlog.md`.

The four tests:
- **Demo: pass.** On a phone, a Manager opens Availability and reads "Today · Lunch 11:30 AM–3:00 PM · Dinner 5:00–10:00 PM · Online paused". They tap the **Dinner** row, change Closes to 11:00 PM and Save, without scrolling past Lunch's controls.
- **Removes a step: pass.** Going to the Timeline and opening the Tonight panel to learn tonight's state is gone, and so is scrolling past other services' controls on a phone.
- **Only this product: pass.** It already holds today's resolved hours, the night-of rules and the closures. Nothing else knows that "Online paused" and "Lunch closed" apply to this venue tonight.
- **Achievable: pass.** The riskiest piece is collapsing service rows on phone without hiding a problem (the `role="alert"` issue text) or losing focus on add/remove. Spike (~1 day): a phone-only summary row behind a prop on the shared form, run against the existing form, onboarding and phone specs.

## The demo

**Before:** on a 375 px phone a Manager scrolls about 1,200 px past Lunch's presets, times and day boxes to reach Dinner's close. To learn that online booking is paused tonight they go to the Timeline and open Tonight.

**After:** Availability opens on "Today · Lunch 11:30 AM–3:00 PM · Dinner 5:00–10:00 PM · Online paused · Change tonight", and the week below reads as two lines, "Lunch · 11:30 AM–3:00 PM · Every day" and "Dinner · 5:00–10:00 PM · Every day". Tap Dinner, set Closes to 11:00 PM, Save.

## Riskiest piece + spike

The shared week form (`QuickSetupForm`) also serves onboarding, the Change regular week drawer and the schedule editor. Collapsing on phone must:
- keep every problem visible: a row with a problem stays open;
- keep focus rules: a new service opens, and Remove moves focus to a neighbour;
- keep onboarding unchanged.

Spike as above.

## Cheapest kill test

On a 375×812 phone, measure the week panel's height and count the steps to change Dinner's close. Then check that `/availability` names an in-force pause, a close-early, a closed service and a closed day with zero clicks. If the panel isn't at least halved, or the line misses any of those, the change is cosmetic.

## Solution hunch

On a phone, each service in the week form is one summary line that opens to its controls, one service at a time; a service with a problem stays open. A "Today" line under the page header says today's hours (from the service day's summary) and what's in force tonight: closures, online/phone pauses, close early, blocked tables, pacing. It links to the Timeline's Tonight panel for changes. A hunch, not a design.

## Success in one sentence

"On a phone, a Manager changes one service's hours without scrolling past the others, and anyone opening Availability sees today's hours and what's in force tonight without leaving the page."

## Unknowns & risks

- The shared form serves onboarding; the collapse must be off there.
- The online-pause banner already exists. A second mention of the same pause on the new line would repeat it, so the design must say which one speaks.
- `AvailabilityPage` takes "today" as the calendar date while the Timeline uses the service day (`currentServiceDate`). After midnight, before rollover, they disagree; this run's line uses the service day. Seeded: align the page.
- The JS phone breakpoint (767 px) and the form's CSS breakpoints (720/640 px) differ.
- Evidence is agent stand-in plus one Owner anecdote.
