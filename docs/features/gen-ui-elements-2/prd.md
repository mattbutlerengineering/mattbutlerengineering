---
stage: prd
run: feature:gen-ui-elements-2
date: 2026-10-24
ux: required
assumptions:
  - "Read-tool set: the brief names four tools for new elements. The code (services/agent/src/routes/gen-agent-tools.ts) has five read tools; the fifth, get_table_status, already renders as labelled StatusLEDs since wave 1 (scenario 10b, batch 7d). The success criterion's 'every chat read tool' is taken to mean all five, with get_table_status covered by the existing StatusLED mapping and not by a new element."
  - "Fitting element: the brief does not define 'fitting'. Taken to mean the element (or documented composition) that this run's chat-prompt guidance maps to that tool's data, showing the fields the brief lists for it. Prose, a generic table, or a different element counts as not fitting."
  - "F26 outcome: the brief says this run closes F26, while idea.md says investigate and allows 'cannot reproduce'. Taken to mean F26 is closed either by a fix with a regression test or by a recorded, documented reproduction attempt that fails to reproduce it. A silent close is not allowed."
  - "Live batch surfaces: the brief scopes verification to the chat drawer plus /gen. Taken to mean the four new data shapes are exercised in the chat drawer (where the read tools run) and the new elements plus F25 are exercised at least once in /gen."
---

# PRD: Fitting chat elements for reservations, availability and guests (wave 2)

## Problem statement

When front-of-house staff ask the hospitality chat about bookings, openings
or a guest, the answer comes back as plain text or a generic table. That is
hard to scan in the middle of service. Wave 1 gave table status and counts a
fitting element (StatusLED, Stat), but four read tools still have none:
`lookup_reservation`, `list_today_reservations`, `check_availability` and
`search_guests`. Two findings from the wave-1 scenario log are also still
open: Timeline timestamps that overlap the event dot (F25), and a suspected
dropped first Generate click on /gen (F26).

Evidence is _anecdote_: the Owner's own live scenario batches 1–7d in
`docs/ui-quality/chat-scenarios-2026-10-24.md`, against one demo venue. No
staff users have been observed.

## Solution

When this ships, asking the chat about reservations shows them as scannable
reservation rows (guest, time, party size, status). Asking about openings
shows a list of available time slots. Asking about a guest shows a guest
summary card (name, visits, tags, risk). The chat prompt tells the model
which element fits each tool's data, as wave 1 did. Timeline timestamps no
longer collide with the event dot, and the first Generate click on /gen
either reliably sends a request or the suspected fault is shown not to
reproduce.

Whether each shape is a new element or a documented composition of existing
rialto components is the Architect's call.

## Actors

- **Front-of-house staff** — people using the hospitality dashboard's chat
  drawer during service. Today the only one is the Owner, on their demo
  venue.
- **Owner** — Matt, who runs the live scenario batches and also uses /gen to
  try generated layouts.

## User stories

1. As front-of-house staff, I want reservations from `lookup_reservation`
   and `list_today_reservations` shown as rows with guest, time, party size
   and status, so that I can scan tonight's bookings at a glance.
2. As front-of-house staff, I want openings from `check_availability` shown
   as a list of time slots, so that I can offer a guest a time without
   reading a sentence.
3. As front-of-house staff, I want a guest from `search_guests` shown as a
   card with name, visit count, tags and risk, so that I know who I am
   dealing with before they reach the stand.
4. As the Owner, I want Timeline timestamps that never overlap the event
   dot, so that a generated timeline reads cleanly.
5. As the Owner, I want my first Generate click on /gen to send a request,
   so that I don't have to click twice.

## Success criteria

- [ ] **One live batch, all read tools fitting.** One live scenario batch in
      prod, logged in `docs/ui-quality/chat-scenarios-*.md`, asks the chat
      drawer at least one question per read tool (`lookup_reservation`,
      `list_today_reservations`, `check_availability`, `search_guests`,
      `get_table_status`). Each answer's data renders in its fitting element
      (for `get_table_status`, the existing labelled StatusLEDs), not prose
      or a generic table. The log records the result per scenario.
- [ ] **Zero fallbacks.** That batch shows 0 "Component could not be
      displayed" across every scenario, in the chat drawer and in /gen.
- [ ] **Reservation fields visible.** Each rendered reservation row shows
      the guest's name, the time, the party size and the status as visible
      text (not only an `aria-label`).
- [ ] **Slot list visible.** A rendered availability list shows each slot's
      time as visible text. A closed day or an empty day is still reported
      in words, not as an empty element.
- [ ] **Guest card fields visible.** A rendered guest card shows the name,
      visit count, tags and risk as visible text.
- [ ] **Prompt guidance present.** The chat prompt has one line of guidance
      per new data shape mapping the tool's data to its element; a test pins
      each line.
- [ ] **Prompt size recorded.** The catalog prompt's token count before
      (about 7.4k) and after this run is recorded in the run's verification
      evidence.
- [ ] **F25 fixed.** A Timeline event whose timestamp is longer than the
      label column (e.g. "March 3, 2025") does not overlap the event dot: a
      rialto test or visual check shows it, and a live /gen render in the
      batch confirms it. The rialto change carries a patch changeset.
- [ ] **F26 closed.** Either the dropped first Generate click is reproduced
      and fixed with a regression test, or a documented reproduction attempt
      (steps and result) is logged in the scenario log and F26 is marked not
      reproducible there.
- [ ] **Wave-1 constraints hold.** Every new element is display-only; no
      nested array string carries `.max()`; enum-like nested fields accept
      any string and the adapter tolerates unknown values; props the model
      must fill are required; catalog descriptions contain no inner double
      quotes. Each is checkable in the catalog schema and its tests.

## Out of scope

- Charts (rialto has none).
- Interactive widgets: `emit`/`on` are no-ops in the chat, so nothing here
  takes clicks.
- Waitlist and menu tools (F12).
- Joining guest history (visit count, risk) onto reservation rows. That was
  the unchosen Showstopper rung; it needs a new data path.
- Write tools (`create_reservation`, `modify_reservation` and the rest): only
  read-tool data gets new elements.
- The rialto npm publish (`RIALTO_PACKAGES_TOKEN` is unset).
- Measuring staff use: there are no staff users beyond the Owner.

## Open questions

- Compose existing rialto components or build new ones, per data shape? —
  Architect.
- Will the model pick the right element unprompted, or does it keep
  answering in prose? Wave 1 showed it often answers in prose. — the live
  batch (Verify); the idea's kill test says the lever is then the prompt or
  tool output.
- How much prompt-token growth is acceptable above ~7.4k? The brief sets no
  ceiling. — Owner, if the recorded growth looks large.
- What causes F26, if it is real? — Implement, through a reproduction
  attempt.
