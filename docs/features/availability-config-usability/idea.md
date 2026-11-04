---
stage: idea
run: feature:availability-config-usability
date: 2026-11-03
assumptions:
  - "Ambition rung: the brief records the Owner's choice as 'Scope A' and names no rung from the skill's ladder. Scope A is mapped to the Solid rung (fixes the problem, no added wow moment), per the run assignment that the rung taken is Scope A. The skill's recommended default, Showstopper, was not taken because the brief names no demo moment to build it on."
  - "Ladder tests: because Solid is chosen, the four Showstopper tests were not run. The skill requires them only for the Showstopper."
  - "Unchosen rungs: the skill seeds every unchosen rung larger than the pick (Showstopper and Moonshot). Their one-line seed texts were written by the Idea stage, anchored on the Manager's sentence, and appended to docs/backlog.md. The Owner has not seen them."
  - "Riskiest piece and spike: the brief names the unknown (whether the model must change, #7738) but no spike. The two-day spike below is written by the Idea stage from the brief's unknowns, not given by the Owner."
  - "Cheapest kill test: the brief names none. The test below is drafted by the Idea stage from the brief's success criteria."
  - "Optional last30days corroboration: not run. The skill says never to run it unasked, and nobody asked. No community evidence is claimed."
  - "Work in flight: the brief's pre-flight record (2026-11-03) was re-checked read-only by this stage. Outcome: nothing matches."
  - "Interview answers (problem, who, why now, evidence, hunch, success, unknowns) were taken from the brief's 'Idea inputs' section, which the Owner accepted as drafted on 2026-11-03. The orchestrator drafted them from repo evidence; the Owner did not answer them one by one."
---

# Idea: One regular week that can differ by day

> "My week isn't uniform. Lunch on weekdays, brunch at weekends, a later close on Friday and Saturday. Setup makes every service run on the same days, so I finish with the wrong week and then have to learn schedules and assignments on another tab to fix it."

Run goal, as the Owner gave it on 2026-11-03: "make availability configuration easier to use".

## Origin

- The Owner's goal on 2026-11-03, with scope chosen live (Scope A) after a code double-check. It is **not** a backlog seed, so nothing is claimed in `docs/backlog.md`.
- The run seeds tracker issue **#7738** ("one regular schedule cannot hold different hours per weekday", filed by the Owner on 2026-10-26 and deferred by the Owner on 2026-10-27 with "Revisit after #7493 Phase 1 closes"). The Owner's data-model answer ("Architect decides") lifts that deferral for this run.
- Predecessor run: `docs/features/venue-availability/`. This run builds on it and never edits it.

## Problem

A venue Manager's real week is not uniform: lunch on weekdays, brunch at weekends, a later close on Friday and Saturday. Quick setup assumes every service runs on the same days, so the Manager finishes with the wrong week. To fix it they must learn schedules and assignments on a second tab (Schedules).

## Who has it

The venue Manager who is setting up a new venue's availability, or changing its regular week.

How they cope today:

- They set the uniform part in quick setup.
- Then, on the Schedules tab, they create one more schedule for each distinct set of hours and assign it weekdays.
- Venues migrated from the legacy model get day-named schedules such as "Thu–Fri hours" (#7739).

## Why now

- Availability shipped on 2026-10-26, and no real restaurant uses it yet (venue-availability `idea.md:79`: "No real-venue evidence").
- The production backfill has not run (venue-availability `release.md`, Owner, 2026-11-03), so no production venue holds migrated day-named schedules.
- Changing setup now, and the data model if it must change, costs the least. After the backfill each change also means re-migrating live venues.

## Evidence

All of this is **anecdote**. Nothing here is validation.

- **Count: 2 reports, both authored by the Owner. 0 reports from independent operators.** The two are #7738, and the 2026-10-31 availability audit (#7981, #7983, #7984).
- **Code**, verified by the orchestrator on 2026-11-03 on `origin/main` @ `106eaaf9c` (this stage did not re-read the code):
  - `apps/hospitality/src/components/availability/quick-setup-draft.ts`. Lines 24-26 describe "a regular week of services that all run on the same days". Lines 40-42 hold one `days` list for the whole draft. Line 294 builds "one regular schedule, one assignment, one row per service".
  - `packages/types/src/schemas/availability-config.ts`. At lines 138-143, `ScheduleServiceSchema` has no weekday field. At lines 145-152, `ScheduleAssignmentSchema` maps weekdays to a whole schedule.
  - `apps/hospitality/src/components/availability/ChangeRegularWeekDrawer.tsx:47-49`. The drawer covers the days the regular week runs on. Days that another schedule runs keep that schedule's hours.
  - `apps/hospitality/e2e/availability-quick-setup.spec.ts:93` covers only the uniform bistro week. No e2e covers a varied week.
  - This shows the limitation exists. It does not show that a Manager is hurt by it.
- **Bar never measured:** the venue-availability PRD sets "Setup time, small … ≤5 minutes" for the uniform bistro week. Its `release.md` records "Setup time, small … NOT RUN".
- **Market**, from venue-availability `idea.md`, partly search excerpts: Resy, OpenTable, Tock, Toast, SevenRooms, ResDiary, Eat App and TableCheck all ship shifts and a weekly template as table stakes. This is anecdote at market scale and does not say how any of them handle a non-uniform week.
- **Outside corroboration:** none sought. `last30days` was not run (see assumptions).

## Ambition rung

Chosen: Solid (the Owner's Scope A), in the user's words: "My week isn't uniform. Lunch on weekdays, brunch at weekends, a later close on Friday and Saturday." The brief records Scope A, not a rung name. See assumptions.
Not taken: Showstopper: seeded to `docs/backlog.md`; Moonshot: seeded to `docs/backlog.md`.
Demo: n/a — Solid chosen, the Showstopper tests were not run
Removes a step: n/a — Solid chosen, the Showstopper tests were not run
Only this product: n/a — Solid chosen, the Showstopper tests were not run
Achievable: n/a — Solid chosen, the Showstopper tests were not run

Scope A, as the Owner set it:

- **In:** quick setup lets a Manager give services different days, and give a day different hours, in one pass. Change regular week lets a Manager change one weekday's hours without creating a schedule. The calendar, the day drawer and the guest preview show the result as one regular week. Any model, engine or API change the above needs.
- **Out:** the 2026-10-31 audit leftovers (#7981, #7984 criterion 2, #7983's leftovers); group cascade and self-tuning; external listing sync; venue-availability's Owner-only release steps; re-timing the ≤15 min multi-room setup bar as a criterion (it must not get slower).

## The demo

None — Solid chosen.

## Riskiest piece + spike

Riskiest piece: whether the data model must change (#7738). The candidates in the brief are a weekday scope on `ScheduleService` or a per-weekday hours payload. A change means a Prisma migration, an ADR-030 amendment and a second data migration for venues already backfilled. It also touches `validateConfig`, `resolveDay` and `legacy-projection`.

Spike of about two days (drafted by this stage, see assumptions): in a scratch branch, add a weekday scope to `ScheduleService` in the types schema and `packages/availability`. Express the success-sentence week (lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, brunch Sat–Sun) in it. Run the engine's existing property test ("no slot is offered outside resolved availability") against it. If the week cannot be expressed, or the property test fails, the model change is larger than Scope A assumes. This spike is for Architect to weigh against the UI-only option on today's model, which the brief also allows.

## Cheapest kill test

Drafted by this stage (see assumptions). Script the success-sentence week through today's path (quick setup, then the Schedules tab) as an e2e on one fixture, and count the interactions. If today's path is already close to the uniform bistro week's count, or a UI-only change on today's model cannot get the varied week below it, the pain is smaller than the idea claims. The idea then needs the Owner's judgement before PRD. The count is agent stand-in evidence only. The Owner's human-timed ≤5 minute walkthrough stays an Owner-only post-release check and is never claimed.

## Solution hunch

Quick setup and Change regular week carry per-day differences directly, and the calendar shows the result as one regular week. This is a hunch, not a design.

## Success in one sentence

"A manager sets up lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, and brunch Sat–Sun, from an empty venue, in ≤5 minutes without help text, and the calendar shows it as one regular week."

## Unknowns & risks

- Whether the data model must change (#7738). If it does, this run carries a Prisma migration, an ADR-030 amendment (status `provisional`) and a second data migration for venues already backfilled.
- The only testers are the Owner and agents. There is no real operator, so the problem's size for a real Manager is unknown. All evidence is anecdote: 2 reports, both Owner-authored, 0 independent.
- How the change interacts with History/Undo, the preview, Tonight changes and the agent's availability chat tools (#7920).
- A richer setup could make the uniform bistro week slower. Quick setup could die from added interactions for the common case.
- The ≤5 minute bar was never measured for the uniform week (`release.md`: NOT RUN), so "easier" has no baseline.
- Whether collapsing migrated day-named schedules (#7739) into the regular week is in reach. This decides `Closes #7738` or `Refs #7738` at Ship.
- Outside corroboration was not sought, so silence from the community is not a finding either way.

## Work already in flight

Outcome: **nothing matches**. The check ran on 2026-11-03 by this stage and repeated the brief's pre-flight record.

- `gh pr list --state open --limit 50 --json number,title,files` returned 5 open PRs (#8157, #8227, #8230, #8231, #8232). None touches `apps/hospitality/src/components/availability/`, `packages/availability/`, `packages/types/src/schemas/availability-config.ts` or `services/reservations/src/services/availability-config.ts`.
- `git branch -a --no-merged origin/main` lists 19 branches naming availability, as it found them. The unmerged ones carry only `docs/features/venue-availability/*` or `docs/features/hospitality-service-ux/*` artifacts (the predecessor run), and none carries run artifacts for this slug. The one branch whose name touches the surface, `fix/availability-legacy-migration-one-regular-week`, changes schedule naming only (`legacy-migration.ts`, #7728); the brief maps it to merged #7739.
- No branch claims #7738.
