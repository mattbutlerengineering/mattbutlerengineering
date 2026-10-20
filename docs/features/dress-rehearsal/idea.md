---
stage: idea
run: feature:dress-rehearsal
date: 2026-10-19
origin: docs/backlog.md seed "Dress Rehearsal" (from: session:2026-10-18), claimed feature:dress-rehearsal
source: docs/features/dress-rehearsal/autorun-brief.md; docs/plans/2026-10-18-dress-rehearsal.md
ux: required
assumptions:
  - "Interview answered from the autorun brief alone; no live user input. Where the brief is silent (e.g. target persona beyond 'new venue owner'), nothing was invented."
  - "Scale taken as feature run, slug dress-rehearsal, per the brief."
  - "Work-already-in-flight check: ran (gh pr list + branch scan). Open PRs #7139, #7138, #7078 are unrelated. Only branch touching this is docs/dress-rehearsal-plan (the merged plan, #7049); no implementation exists. Nothing matches, proceeded."
---

# Idea: Dress Rehearsal

## Problem

A new venue owner finishes onboarding and sees blank screens. Until real guests book, the timeline is an empty night and the floor plan is a static drawing, so they cannot judge whether the product fits their room.

## Who has it

A new venue owner on the hospitality app, in the window between onboarding and their first real booking. Today they imagine how it would run or read the docs. There are no real venues yet, so there are no observed users.

## Why now

The hospitality app has no real venues or service history, so the empty-account first impression is the product's whole first impression. The other ideas that would fill it are blocked (Service Replay needs history; Snap Your Room needs an LLM key). This one needs neither.

## Evidence

Anecdote only: the product owner's own judgement and observation (2026-10-18). No user research, no observed users, no data. Nothing here shows owners would value or act on a simulation.

## Solution hunch

After onboarding, the owner clicks "Run a Friday night". Their own floor plan and timeline play a seeded, simulated service at about 60x: bookings land, parties seat, tables cycle occupied, dirty, ready, a walk-in waits, a no-show frees a table. It ends on a curtain-call summary card. Hunch only: a pure seeded simulator and reducer plus a playback hook, rendered through the existing prop-driven floor plan and timeline. Client-side, no API writes, no migration, no LLM.

Out of scope: persisting rehearsals as table events, real operating hours or deposit simulation, shareable recordings.

## Success in one sentence

A fresh venue can run a deterministic simulated Friday night on its own floor plan, watch tables and reservations animate, finish on a summary card, and the API receives zero writes.

## Unknowns & risks

- The simulation looks implausible or fake, which undermines trust instead of building it.
- Simulated data is mistaken for real bookings or service.
- Performance at 240x on large floor plans.
- Unvalidated demand: evidence is anecdote, and no owner has been asked whether a rehearsal changes their judgement of fit.
- Accessibility: reduced-motion must be respected.
