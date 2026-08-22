---
stage: idea
run: feature:tape-chart-overlaps
date: 2026-08-21
---

# Idea: Tape chart overlaps — make a covered reservation impossible

## Problem

Two reservations that overlap on the same row render exactly on top of each
other. The later one paints over the earlier one, and the earlier one is
gone — not faded, not offset, not behind a badge. Invisible, and because
it is a `<button>` under another `<button>`, unclickable too.

From the sufferer's side: _"The chart told me the room was fine. It wasn't.
There was a second booking sitting underneath the one I could see, and
nothing on screen suggested anything was hidden."_

The component is not naive about this — `useTapeChartLayout` already runs a
lane-packing pass and writes `bar.lane` plus a row-wide `maxLanes`. Nothing
consumes either value. `TapeChartRow.tsx:63` renders every bar into a single
absolutely-positioned `.lane`, and `TapeChartBar` sets only
`--tapechart-bar-start` / `--tapechart-bar-span`; `.bar` pins
`inset-block-start`/`inset-block-end` to the full row height. The lane number
is computed, carried through the type system, documented in `types.ts`, and
then dropped on the floor at the DOM boundary.

Grid view only. `TapeChartListView` and `TapeChartMobileStack` iterate
`reservations` linearly, so neither occludes anything — which is part of why
this survived: the accessible views are honest, and the primary view is not.

## Who has it

**Directly, today: a developer evaluating rialto.** The tape chart is the
most complex component in the library and the one that carries the most
credibility. `apps/rialto-web` is its only consumer — there is no production
hospitality usage — so the public component page _is_ the product. An
evaluator who constructs an overlap while poking at the demo watches a
reservation disappear. **How they cope today:** they don't reach that state,
because the demo cannot produce it (see Evidence).

**Immediately: a coworker who asked what this UI should look like.** Their
context is restaurant tables × time (SevenRooms-shaped), not hotel rooms ×
nights. On a restaurant floor plan a row is a table and an overlap means two
parties assigned to the same table at overlapping times — a state that is
sometimes a mistake and sometimes deliberate (a held table, a communal
table, an intentional double-seat). **How they cope today:** by asking a
human, because no tape chart they have shows the answer.

**Downstream: a front-desk or host-stand operator.** Anyone running a
product built on this component discovers the conflict when the second guest
is standing at the counter. **How they cope today:** cross-checking against
the arrivals list or the booking system of record — i.e. not trusting the
rack chart, which defeats its purpose.

## Why now

A coworker asked Matt for ideas on what this UI should look like. That makes
the deliverable a _design answer_ someone else will look at and react to,
not just a defect burn-down — the run should produce something shareable on
the live component page, not only a corrected renderer.

Secondary: the half-built lane pass is actively misleading. `TapeChart.test.tsx:90`
("assigns overlapping reservations to separate lanes") passes today by
asserting the **hook** returns `lane: [0, 1]`. It is a green test guarding
a behaviour no user can observe — tested at the wrong seam. Every day it
stays that way, the suite keeps certifying something untrue and anyone
building on `bar.lane` inherits a wrong assumption about whether it reaches
the screen.

## Evidence

- **Code, verified 2026-08-21 (direct evidence, not anecdote).** `grep` for
  `maxLanes` across `packages/rialto/src/components/TapeChart` returns four
  hits: the type declaration, two lines computing it, and the return
  statement. No renderer reads it. Same for `bar.lane` — assigned in
  `useTapeChartLayout.ts:18,25`, declared in `types.ts:130`, consumed
  nowhere.
- **The demo structurally cannot show the bug (direct evidence).**
  `makeReservations` in `apps/rialto-web/src/data/tapechart-fixtures.ts`
  advances a single monotonic `cursor` per room and always sets the next
  `start` at or after the previous `end`. Overlap generation is not merely
  unlikely in the fixtures — it is impossible. So the live page at
  `mattbutlerengineering.com/rialto/components/tape-chart` renders correctly
  and proves nothing.
- **Storybook has no overlap story.** The five exported stories are
  `Default`, `Compact`, `Loading`, `Empty`, `WithError`.
- **A coworker asked what this should look like (anecdote).** One person,
  one conversation. It establishes that the question is live for someone
  outside this repo; it does not establish frequency or severity in their
  product.
- **Matches a repeated pattern in this repo (supporting, not proof).**
  "Built, merged, closed — never once executed": the artifact exists, looks
  finished, and absence of exercise renders identically to working.

## Solution hunch

**Deliberately not chosen.** Asked for a shape, Matt said "you tell me" —
so the run owes him _options_, and the coworker an argument, rather than a
pre-committed design. What the brief does fix is the bar the options must
clear, which is the success sentence below: nothing may hide anything, and
a real conflict must not read as an ordinary layout quirk.

Three families are on the table for UX/architect to develop and compare —
recorded as the space, not a recommendation:

1. **Honor the lanes.** Render `bar.lane` as a vertical offset and grow the
   row. Every bar visible. Says nothing about whether an overlap is wrong.
2. **Flag the collision.** Keep one bar height; where bars overlap, mark the
   overlapping span (hatch, outline, count badge) and let the user drill in.
   Loud about conflict; does not by itself make the hidden bar reachable.
3. **Both, split by meaning.** Stack legitimate co-occupancy, alarm on
   genuine double-booking. Strongest answer and the most expensive — it
   requires the component to know which is which, which it currently cannot
   (see Unknowns).

Whatever wins, the example work is scoped: overlap cases added to
`tapechart-fixtures.ts`, plus a dedicated section on the component page that
demonstrates the state explicitly rather than leaving it to be stumbled
upon.

## Success in one sentence

No bar can hide another, and a genuine conflict reads as a conflict rather
than as ordinary side-by-side stacking.

## Unknowns & risks

- **Conflict language creep — the risk Matt named, and the load-bearing
  one.** Telling "error overlap" from "legitimate overlap" needs domain
  knowledge the component does not have. `TapeChartRoom.capacity` exists but
  means party size, not concurrent-reservation capacity. The honest options
  are a new prop, a consumer callback, or refusing the distinction entirely
  and rendering all overlaps identically — each of which enlarges the public
  API of the library's most complex component. There is a real chance the
  right answer for v1 is "stack, don't judge", with conflict semantics
  pushed to the consumer.
- **Row-height explosion (author-observed, not raised by Matt).** `maxLanes`
  is computed globally — the max across _all_ rooms. Honoring it naively
  makes one 4-way overlap quadruple the height of all 24 rows and destroys
  the chart's scannability. Per-row height is the obvious counter, but the
  component has a `virtualizeThreshold` and CSS `contain-intrinsic-size`
  keyed to a uniform `--tapechart-row-height`; variable rows interact with
  both. This may be the actual hard part of the work.
- **Visual baseline churn.** Any row-height change cascades ±1px diffs
  across unrelated sections of the visual-test page, and baselines must be
  regenerated from a Linux CI artifact, never locally on macOS. Known cost,
  known procedure, but it is friction that could exceed the fix itself if
  the design goes wide.
- **Domain mismatch with the person who asked.** The coworker's context is
  tables × _time_; this component is rooms × _days_ (`dayWidth`,
  `daysBetween`, ISO date strings, end-exclusive hotel checkout convention).
  Overlap rendering is the shared half of the problem — a time-axis variant
  is the other half, and it is **out of scope for this run** unless Matt
  says otherwise. Flagged because a design that answers only the day-axis
  case may not actually answer the question that was asked.
- **Sample size of one.** The whole why-now rests on a single conversation.
  If the coworker's real need turns out to be the time axis or a floor-plan
  view, the overlap fix is still correct — it is a genuine defect — but it
  stops being urgent.
- **Where does the fix live?** Rendering `bar.lane` is a `packages/rialto`
  change; the demo work is `apps/rialto-web`. If the design adds a prop, it
  is a rialto public-API change and interacts with the release/publish path.
  Not yet decided whether this is one change or two.
