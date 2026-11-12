---
stage: idea
run: feature:availability-hub
date: 2026-11-12
origin: "Owner request in session, 2026-11-12. Not started from a backlog seed."
supersedes: "availability-setup-hierarchy PRD criterion 7 (Availability opens on the week) and its glossary term Regular week"
folds-in: ["#8693", "#8694", "#8695"]
assumptions:
  - "Problem, who, why-now, evidence, success sentence and unknowns are drafted from the Owner's request and the approved plan (~/.claude/plans/i-m-very-confused-with-pure-lamport.md), not answered one by one. The Owner approved that plan on 2026-11-12."
  - "The four ambition tests were run silently, as the skill allows for a feature run. All four pass."
  - "The optional outside-evidence step (last30days) was not offered. The evidence is the Owner's own, plus measurements already in the repo."
---

# Idea: Availability hub

> I'm very confused with the availability configuration setup. Let's plan to redo the entire ui to make it focused on user experience. Focus on usability, simplicity, etc. Keep the same functionality.

## Problem

"I'm very confused with the availability configuration setup."

A venue's availability is five kinds of rule: regular hours, seasonal hours, special dates and holidays, closures and pauses, and booking rules. A later kind wins over an earlier kind on the dates it covers. The page does not show the rules or that order. It shows their results on a calendar and spreads the controls over 3 tabs, 5 drawers and about 20 dialogs. The Manager cannot answer two questions from the page: "what have I set up?" and "which rule decides this date?"

Three things make it worse:

- **Six hours editors with different fields.** The regular-week form has no seating-interval or booking-channel control. Those two settings can only be changed through a day drawer with the scope "Every regular {weekday}", or through Compare services.
- **Up to seven entry points for one job.** Close has seven. The regular week has six. Booking rules has three.
- **Several names for one concept, and one name for several.** "Schedule" means a named set of hours, a "Use schedule" rule, and a select. "Close" shuts the venue, dismisses a panel, and (as "Closes") ends a service.

## Who has it

The venue Manager, who sets and changes hours. Today that is the Owner, acting as the Manager of the demo venues. Hosts read the same page and land on the Calendar tab.

How they cope today: they search the tabs for the control, make the change through a day on the calendar, and check the result cell by cell.

## Why now

- This is the fourth time the same complaint is on record. Three earlier runs each reduced one part of the page (`availability-config-usability`, `availability-setup-hierarchy`, `availability-scenario-ux`), and the confusion remained.
- The 2026-11-11 audit queue (#8686 to #8695, tracking #8696) is polishing the same tabs and drawers one finding at a time. Three of its epics (#8693, #8694, #8695) have not started. They would spend effort on surfaces this run replaces.
- The measured baseline exists now (#8696), so "simpler" can be checked with numbers.

## Evidence

- **Anecdote, one person (the Owner), four times.** `availability-setup-hierarchy/idea.md:18`: "As a user, I am confused about how to set up availability." Line 20: "The current availability page is overwhelming with too many options and it's difficult to follow the heierarchy." `availability-config-usability/idea.md:19` and `availability-scenario-ux/idea.md:18` record the same from other angles. No independent operator has been asked.
- **Measured (#8696, 2026-11-11).** Desktop landing: 38 controls over 1.76 screens. Hours form after one edit: 50 controls over 2.27 screens. A seasonal schedule from Jun 1 to Sep 15 costs 23 steps.
- **Read from the code on `origin/main` (2026-11-12).** About 300 files under `apps/hospitality/src/components/availability/`, 45 distinct capabilities, 6 hours-editor implementations, and about 1,300 English strings in three i18n namespaces.

## Ambition rung

Chosen: Showstopper, in the user's words: "redo the entire ui to make it focused on user experience"
Not taken: Solid: the hub alone, with rules in plain sentences in the order they win and one editor per rule; Moonshot: the Manager describes the week in a sentence and the product drafts every rule for review
Demo: pass — typing a date on the hub shows one sentence and marks the row that won
Removes a step: pass — no opening the calendar, a day and the "Why this day" drawer to learn which rule applies
Only this product: pass — the pure engine resolves every layer for a date (ADR-030), and `GET /availability/days` already returns it
Achievable: pass — the data and the layer text exist; the riskiest piece is the single hours editor, named below

## The demo

Before: to learn why Dec 24 closes early, the Manager opens the Calendar tab, finds the date, opens its drawer and reads a stack of layers. After: the Manager types Dec 24 on the hub and reads "Dinner 4 to 8 PM, from your special date, which beats Summer hours", with the Special dates row marked.

## Riskiest piece + spike

The riskiest piece is making the day drawer use the same hours row as every other editor. The week form's draft and the day editor's draft are different models, and the day editor's changes go through `draft-changes.ts`.

Spike, about two days: render the week form with no day picker inside the day drawer for one date, save it, and assert the `PUT /availability/config` body equals the body today's day editor sends for the same edit.

## Cheapest kill test

Ship the hub as the landing page with each row linking to the editor that exists today (the first slice). Then the Owner does five jobs cold: change Dinner's closing time, add summer hours, close one date, pause online booking tonight, and say which rule decides a given date. If the Owner still cannot say where to go or which rule wins, the hub is the wrong structure and no editor work has been spent.

## Solution hunch

`/availability` opens on a read-first hub. It states today's status and the five rule kinds as plain sentences, in the order they win. Each row opens one focused editor on its own URL. The calendar becomes a "Check a date" view that keeps date selection and per-date editing. One hours editor replaces six. One save model covers every editor. One term names each concept, pinned by a test. The work replaces the old page in place, one small slice at a time, with no feature flag. Backend, API and data model do not change.

Decided by the Owner on 2026-11-12: hub first and calendar second; land the in-flight audit items first and fold #8693 to #8695 into this run; replace in place slice by slice; "Regular hours" and "Seasonal hours" replace "Regular week" and "Schedules".

## Success in one sentence

A Manager opens Availability, reads what is set up and which rule wins on any date without opening an editor, and completes every job that exists today from exactly one obvious place.

## Unknowns & risks

- **Only one person has reported the problem.** The hub fits how the Owner thinks. No other operator has tried it.
- **The hub adds one click to the most common edit.** "Change Dinner close" goes from 3 steps to 4. The Owner accepted this in the plan; real use may show it matters more.
- **"Seasonal hours" misnames a schedule with weekdays and no dates.** The row sentence must handle it, for example "Weeknights: Mon to Thu, no end date".
- **The single hours editor may not fit the day drawer.** If the spike fails, the day drawer keeps its own editor and the count of hours editors ends at two.
- **Churn.** 22 availability e2e specs, four catalogs and the visual baselines all move. A slice that breaks `main` blocks every later slice.
- **Collision with the audit queue.** Two in-flight worktrees (#8687 slice A, #8691 slice 2) hold uncommitted work on the same files. This run starts its code slices after they land.
- **Booking rules have no server-side undo.** The planned undo re-saves the previous values from the client, so it can lose to a concurrent edit.
