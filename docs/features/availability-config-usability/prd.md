---
stage: prd
run: feature:availability-config-usability
date: 2026-11-03
ux: required
assumptions:
  - "Interview answers (actors, stories, success, scope, out of scope) were taken from the autorun brief and idea.md. No live Owner answered them one by one. The brief's Idea inputs were accepted as drafted by the Owner on 2026-11-03; its Success criteria list is orchestrator-derived."
  - "Actors: the brief names only the Manager. The Host is added from the predecessor run's actor vocabulary (venue-availability prd.md Actors; architecture.md maps VenueRole owner/manager to Manager and staff to Host), for the stories that protect Tonight changes. The Guest is added only for the stories that need one: the strip and preview show what a Guest would be offered. Neither is a new scope item."
  - "Sharpened criteria added beyond the brief's list (the brief says PRD may add and must log them): (a) the live strip updates before any save, without a page navigation; (b) the strip's per-weekday times equal what the guest preview returns after save for the same week; (c) a Manager can change one weekday in Change regular week without creating a schedule or assignment; (d) History/Undo, Tonight changes and agent availability chat tools keep working on a varied week; (e) migrated day-named schedules are shown as one regular week. (d) and (e) come from idea.md's Unknowns and the brief's Tracker section, not from a live Owner answer."
  - "Strip update bar: the Owner gave no latency number. The criterion says the strip reflects an edit without a save, and that its update does not wait on anything beyond the form's existing preview debounce. It sets no new millisecond figure."
  - "Interaction counts: 'fewer interactions than today's path' and 'no more than today' are measured by one scripted e2e on one shared fixture, per the brief. The unit of an interaction (a click, a keystroke group or a field change) is not set here; Architect or the e2e author fixes it once and uses it for both paths. This is agent stand-in evidence only."
  - "Large multi-room setup (≤15 min bar): kept as a no-slower guard, not a re-timed criterion, per the brief's Out list (orchestrator default). The guard is checked by the scripted e2e counting interactions for the large fixture on the same footing; it asserts no increase."
  - "ux: required, from the brief's UX section. The Owner was told on 2026-11-03 and did not object."
  - "Ship wording (Closes versus Refs #7738) depends on the migrated day-named schedule collapse. That is recorded as an Open question, not decided here."
---

# PRD: One regular week that can differ by day

## Problem statement

A venue Manager's real week is not uniform: lunch on weekdays, brunch at weekends, a later close on Friday and Saturday. Quick setup makes every service run on the same days, so the Manager finishes with the wrong week and then has to learn schedules and assignments on the Schedules tab to fix it. The wrong week is only discovered after saving. Evidence is anecdote: 2 reports, both Owner-authored (#7738 and the 2026-10-31 audit), 0 from independent operators, and the existing ≤5-minute setup bar was never measured (`release.md`: NOT RUN).

## Solution

A Manager sets up a non-uniform week in one pass, in quick setup and in Change regular week:

- Quick setup lets each service have its own days, and a day have its own hours.
- Change regular week changes one weekday's hours without creating a schedule.
- A live seven-day strip beside quick setup shows each weekday's bookable times as a Guest would see them, and moves as the Manager edits, before saving.
- The calendar, the day drawer and the guest preview show the saved result as one regular week.

Any model, engine or API change this needs is for Architect to decide (see Open questions).

## Actors

- **Manager** — a venue member with VenueRole owner or manager. Configures availability: quick setup, Change regular week, the calendar.
- **Host** — a venue member with VenueRole staff. Makes Tonight changes only; does not configure the regular week.
- **Guest** — a person booking a table. Appears only as the viewpoint of the strip and the guest preview, and as the person whose bookable times must stay correct.

## User stories

1. As a **Manager**, I want to give each service its own days in quick setup, so that lunch runs Mon–Fri and brunch Sat–Sun without a second tab.
2. As a **Manager**, I want to give a single day its own hours in quick setup, so that Friday and Saturday can close later than the other dinner nights.
3. As a **Manager**, I want to finish quick setup on an empty venue with a varied week in one pass, so that I never need the Schedules tab to correct it.
4. As a **Manager**, I want a seven-day strip beside quick setup showing what a **Guest** could book each weekday, updating as I type, so that I see a wrong week before I save it.
5. As a **Manager**, I want to change one weekday's hours in Change regular week, so that I do not create a schedule and assign it days.
6. As a **Manager**, I want the calendar, the day drawer and the guest preview to show my week as one regular week, so that what I entered is what I see.
7. As a **Manager** with a venue migrated from the legacy model, I want day-named schedules such as "Thu–Fri hours" shown as part of one regular week, so that I do not manage them as separate schedules.
8. As a **Manager**, I want the uniform bistro week to stay as quick to enter as today, so that the common case does not get slower.
9. As a **Manager**, I want History and Undo to keep working on a varied week, so that I can reverse a change to one weekday.
10. As a **Host**, I want Tonight changes to keep working against a varied week, so that night-of changes still apply to the right service.
11. As a **Guest**, I want to be offered only the times the Manager entered for that weekday, so that I never book a slot outside the venue's resolved availability.

## Success criteria

- [ ] **Varied week in quick setup.** An e2e enters lunch Mon–Fri, dinner Tue–Sun closing later Fri–Sat, and brunch Sat–Sun, from an empty venue, entirely in quick setup, with no visit to the Schedules tab.
- [ ] **Per-weekday result.** After save, each weekday resolves to the services and hours entered, in the calendar, the day drawer and the guest preview (engine, component and e2e tests).
- [ ] **One regular week.** After save, the calendar presents the week as one regular week, with no per-day schedule or assignment to manage. Migrated day-named schedules appear as part of it (component test on a migrated-venue fixture).
- [ ] **Change regular week, one day.** An e2e changes one weekday's hours in Change regular week and checks that the other six weekdays are unchanged and that no schedule or assignment was created.
- [ ] **Strip is live and honest.** An e2e edits Friday's close in quick setup and checks that the strip's Friday last slot moves before any save and without leaving the form. The strip's per-weekday times equal the guest preview's for the same week after save. Monday shows no dinner for the demo week.
- [ ] **Uniform week no slower.** The uniform bistro week takes no more interactions than today, counted by the scripted e2e on the same fixture. The existing `availability-quick-setup.spec.ts` case keeps passing.
- [ ] **Varied week faster than today.** The varied week takes fewer interactions than today's path (quick setup, then the Schedules tab). Both paths are counted by the same scripted e2e on the same fixture. This is agent stand-in evidence only.
- [ ] **Large setup no slower.** The large multi-room setup takes no more interactions than today, counted on the same footing as above. This is a guard and not a re-timed ≤15 min bar.
- [ ] **Interactions keep working.** History/Undo, Tonight changes and the agent's availability chat tools (#7920) each have a test passing against a varied week.
- [ ] **Copy in three locales.** All new copy ships in en-US, es-MX and fr-CA (locale-parity check passes).
- [ ] **No regression.** The existing availability unit and e2e suites stay green, and the engine's property test still holds: no slot is offered outside resolved availability.
- [ ] **Owner-only, never claimed by an agent:** the Owner's human-timed ≤5-minute walkthrough of the success sentence without help text. It is an Owner post-release check. No stage claims it as run or passed.
- [ ] **The demo runs as written.** Verified by a person, or by a scripted e2e that follows it step by step:

  > Open an empty venue's setup as the Manager. Enter lunch Mon–Fri, then dinner Tue–Sun. Set Friday's and Saturday's close later. Beside the form, the seven-day strip shows each weekday's bookable times as a guest would see them. Friday's and Saturday's last slots move later as the close is set, and Monday has no dinner. The Manager saves a week they already watched.

## Out of scope

- The leftovers of the 2026-10-31 audit: #7981 (Also apply to, the Services filter, Close for several dates, Remove/Edit for dated-schedule layers) and #7984 criterion 2 (edit a closure).
- #7983's leftovers: the guest language of closure notices, and rebooking times in the preview.
- Group cascade and self-tuning (backlog line 286), and external listing sync.
- venue-availability's Owner-only release steps: migration confirmation, backfill, p95 and the walkthrough. They belong to that run.
- Re-timing the large multi-room setup bar (≤15 min) as a criterion. It must not get slower (guard above).
- A suggested or auto-proposed week from booking history or listings (the Moonshot, seeded to the backlog).

## Open questions

- Does the data model have to change for per-weekday hours (#7738): a weekday scope on `ScheduleService`, a per-weekday hours payload, or a UI-only design on today's model? A change means a Prisma migration, an ADR-030 amendment (status `provisional`) and re-migrating backfilled venues. — **Architect**, who picks the smallest design that meets the criteria and logs why.
- Can the existing preview show a whole unsaved regular week for a venue with no saved hours (the Showstopper's riskiest piece, `idea.md`)? Against an empty saved week the compare mode may report every slot as "added", and the strip's current window is five dates, not seven. What the strip looks like, and how it reads when the week is partly entered, is a design question. — **UX Design** for what the strip shows; **Architect** for what the engine and endpoint must supply.
- Is collapsing migrated day-named schedules (#7739) into the regular week in reach? The answer decides `Closes #7738` or `Refs #7738` at Ship. — **Architect** (feasibility), then **Implement** (coverage check, per the brief's Tracker section).
