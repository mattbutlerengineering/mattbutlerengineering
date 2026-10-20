---
stage: prd
run: feature:dress-rehearsal
date: 2026-10-19
ux: required
assumptions:
  - "Interview answered from idea.md, autorun-brief.md and docs/plans/2026-10-18-dress-rehearsal.md alone; no live user input."
  - "Actors limited to the new venue owner (the brief's only named sufferer); no staff or guest actor invented."
  - "Success criteria drawn from the plan's Verification section and the brief's success statement; thresholds stated there (1,000 seeds, 15x/60x/240x speeds, ~80 tables) are carried over verbatim, none invented."
  - "Implementation hints in the brief (pure simulator, reducer, hook, existing components) are Architect-stage material and are kept out of this PRD."
  - "Demand is unvalidated (anecdote only, no observed users); recorded as an open question, not as a criterion."
---

# PRD: Dress Rehearsal

## Problem statement

A new venue owner who has finished onboarding sees blank screens until real guests book. The timeline is an empty night and the floor plan is a static drawing, so they cannot judge whether the product fits their room. Today they imagine it or read docs. Evidence is the product owner's own observation (2026-10-18); there are no real venues yet and no observed users.

## Solution

After onboarding, the owner chooses "Run a Friday night". Their own floor plan and timeline play a simulated service at about 60x: bookings land, parties are seated, tables cycle occupied, dirty, ready, a walk-in waits, a no-show frees a table. The run is repeatable for a given seed and ends on a curtain-call summary card. Everything is clearly marked as a rehearsal, is read-only, and never writes to the venue's real data.

## Actors

- **Venue owner** — a new owner on the hospitality app, between finishing onboarding and their first real booking, who wants to judge how the product fits their own room.

## User stories

1. As a venue owner, I want to start a simulated Friday night from the empty-night state, the end of onboarding, or settings, so that I can see my product working before real guests exist.
2. As a venue owner, I want to watch my own floor plan and timeline animate through the night (bookings, seatings, table turnover, a waiting walk-in, a no-show), so that I can judge whether the product fits my room.
3. As a venue owner, I want to pause, change speed (15x, 60x, 240x) and scrub, so that I can inspect a moment or skip ahead.
4. As a venue owner, I want a persistent "Rehearsal, not real bookings" marking, so that I never mistake simulated data for real service.
5. As a venue owner, I want a curtain-call summary at close with "Run it again" and "Try a weeknight", so that I can see how the night went and try another.
6. As a venue owner who prefers reduced motion, I want the rehearsal to step through the night without animated transitions, so that it is usable for me.

## Success criteria

- [ ] Determinism: the same venue floor plan, profile and seed always produce identical rehearsal output (unit test).
- [ ] Invariants hold across 1,000 seeds: no table is double-booked, every party fits its table's capacity, and every seated party departs before close (unit test).
- [ ] State at fixed simulated times matches reviewed snapshots (unit test).
- [ ] Playback play, pause, speed (15x, 60x, 240x) and scrub behave correctly under fake timers (unit test).
- [ ] Guard: the rehearsal module imports no api-client write method (automated test fails if one is added).
- [ ] E2E on a fresh venue: choose "Run a Friday night", advance the clock, tables show occupied on the floor plan and reservations on the timeline, the curtain-call summary card appears, and a route spy records zero API writes.
- [ ] The summary card shows covers served, average turn time, peak hour, tables that never sat, and longest walk-in wait, all consistent with the simulated events (unit test on derived metrics).
- [ ] While rehearsing, every view shows the "Rehearsal, not real bookings" banner and distinct treatment, and drag, status change and reservation click-through to real data are disabled (component and E2E test).
- [ ] Entry points exist at the timeline's empty-night state, the end of onboarding and settings (E2E or component test).
- [ ] All new strings exist in en-US and fr-CA (localization completeness check passes).
- [ ] With `prefers-reduced-motion` set, playback steps without animated transitions (test plus manual check on a preview deploy with a real onboarded floor plan).
- [ ] Performance: playback at 240x on a floor plan of about 80 tables stays responsive (measured check against a threshold the Architect stage sets).
- [ ] `pnpm lint`, `pnpm typecheck` and `pnpm test` pass.

## Out of scope

- Persisting rehearsals as `TableEvent` rows (or any simulated-data storage).
- Simulating against the venue's real operating hours or deposit policy.
- Shareable rehearsal recordings.
- Any migration or API write.
- Any LLM use.

## Open questions

- Is the rehearsal valuable to owners? Evidence is anecdote only and no owner has been asked whether it changes their judgement of fit — answerable by showing it to real owners once any exist (the Operate stage is skipped for this run).
- Does the simulation read as plausible rather than fake? Profile tuning against restaurant norms (turn times, peak curve) — Architect stage, with the plan's reviewable-determinism approach.
- What is the numeric performance threshold at 240x on about 80 tables? — Architect stage.
- Exact UX of the Settings entry point and the weeknight and brunch profiles in "Try a weeknight" — UX Design stage.
