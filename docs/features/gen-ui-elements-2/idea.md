---
stage: idea
run: feature:gen-ui-elements-2
date: 2026-10-24
assumptions:
  - "Ambition ladder: the brief is silent on it. Took the skill's recommended default (Showstopper) and built that rung from the Owner's problem sentence. It failed the Achievable test: it needs a reservation-to-guest data join that list_today_reservations does not return, which falls outside the brief's In scope. Per the skill's rule the pick fell back to Solid. The Owner never picked a rung."
  - "Backlog seeds: the skill says to append the unchosen Showstopper and Moonshot rungs to docs/backlog.md in the same commit. The orchestrator limited this stage's commit to idea.md, and the brief says nothing is seeded. So docs/backlog.md was not written, and the seeds are recorded in the Not taken line below, which is the skill's documented fallback."
  - "Work-in-flight check: not run. This run did not start from a backlog seed, and the skill requires the check only for a seed claim. The orchestrator's autorun pre-flight owns the open-PR check."
  - "Cheapest kill test, riskiest piece, and spike: none of these is in the brief. All three come from the brief's own biggest unknown (whether the model picks the right element unprompted) and are not new Owner answers."
---

# Idea: Fitting chat elements for reservations, availability and guests (wave 2)

## Problem

When staff ask the chat about bookings, openings or a guest, the answer
comes back as plain text or a generic table. That is hard to scan in the
middle of service.

## Who has it

Front-of-house staff using the hospitality dashboard's chat. Today the only
user is the Owner's own demo venue, and there are no real staff users yet.
They cope by reading prose.

## Why now

Wave 1 proved the pattern live on 2026-10-24 (#7456, #7458, #7460, with
#7462 in review). Stat and labelled StatusLEDs render in the chat, and Tag
and Timeline render in /gen, with zero seam fallbacks after the fixes. Four
read tools still have no fitting element: `lookup_reservation`,
`list_today_reservations`, `check_availability` and `search_guests`.

## Evidence

_Anecdote._ This is the Owner's own set of live scenario batches 1–7d in
`docs/ui-quality/chat-scenarios-2026-10-24.md`, all run against a single
demo venue. For example, batch 7 scenario 10b showed six StatusLEDs as bare
dots (F23, since fixed), and batch 7c showed the model picking Tag and
Timeline unprompted while their words fell back (F24, since fixed). The log
also records two open findings this run takes on:

- **F25:** Timeline timestamps longer than the label column overlap the
  event dot.
- **F26** (suspected and not reproduced by hand): on /gen, the first
  Generate click after typing a prompt sent no request.

No staff users have been observed and no metrics have been collected.

## Ambition rung

Chosen: Solid, in the user's words: "when staff ask the chat about bookings, openings or a guest, the answer comes back as plain text or a generic table, which is hard to scan mid-service"
Not taken: Showstopper (demoted): staff ask how tonight looks and every reservation row already carries that guest's visit count and risk tags, so nobody runs a separate guest lookup; Moonshot: the chat watches service and pushes the right element unasked when a booking, opening or a guest at risk needs attention
Demo: pass — Solid: a reservation list, slot list and guest card are seen in place of prose
Removes a step: fail — Solid makes scanning faster rather than removing a step. The Showstopper passed this test by removing the separate guest lookup.
Only this product: pass — it renders the venue's own reservation, availability and guest data in its own chat
Achievable: fail (for the Showstopper) — `list_today_reservations` returns only `api.reservations.list` rows, with no guest history. Joining that history in is a new data path, outside this run's display-only, one-element-per-shape scope. Re-scoping to the rows' own fields gives back Solid.

## The demo

None. Solid was chosen.

## Riskiest piece + spike

The riskiest piece is whether the model picks the right element unprompted.
In wave 1 it often answered in prose instead. Spike (about two days): add
one draft element plus one line of chat-prompt guidance for a single tool
(for example `check_availability`), then run a live scenario batch and count
fitting renders against prose replies.

## Cheapest kill test

Ask the chat each of the four read-tool questions once in prod, after the
prompt guidance lands. If the model still answers in prose for most of them,
the elements alone will not fix the problem, and the lever is the prompt or
the tool output instead.

## Solution hunch

Give each data shape one fitting element, or a documented composition of
existing rialto components:

- a reservation row or list (guest, time, party size, status);
- an availability time-slot list;
- a guest summary card (name, visits, tags, risk).

Add a line of chat-prompt guidance that maps each tool's data to its
element, as wave 1 did. Also fix F25 and investigate F26.

Whether to compose existing components or build new ones is left to the
Architect.

## Success in one sentence

In one live scenario batch, every chat read tool's data renders in a fitting
element with 0 "Component could not be displayed".

## Unknowns & risks

- **Element choice:** the model may not pick the right element unprompted.
  Wave 1 showed it often answers in prose.
- **Prompt size:** the catalog prompt is about 7.4k tokens today, and each
  element adds roughly 100.
- **Build or compose:** we don't yet know whether existing rialto components
  can be composed or new ones are needed. This is left to the Architect.
- **F26 may not reproduce:** it is suspected and has not been reproduced by
  hand, so the fix may turn out to be "cannot reproduce".
- **Thin evidence:** a single-operator demo venue is the only evidence base,
  so success is judged on the Owner's scenario batch rather than on staff
  use.
