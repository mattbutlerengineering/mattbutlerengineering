---
stage: ux-design
run: feature:gen-ui-elements-2
date: 2026-10-24
assumptions:
  - "Sketch confirmation: the skill asks to confirm each sketch with the user. This is an autorun stage with no live interview, so no sketch below was seen by the Owner. Every flow, field list and scope line comes from autorun-brief.md, idea.md and prd.md; the layouts come from existing repo conventions (cited per screen). Treat the sketches as unconfirmed until the Owner sees the live batch."
  - "Conventions source: the repo has no docs/ux-patterns.md. Conventions were taken from the shipped hospitality components that already show the same data: dashboard/ReservationList.tsx (time, guest, party of N, status badge), crm/GuestCard.tsx and crm/guest-signals.ts (name in display type, visit count, risk badge, tag row), and the wave-1 catalog entries (Stat, Timeline, Tag, StatusLED)."
  - "Status and risk colours: copied from the dashboard, not newly chosen. Reservation status follows ReservationList's STATUS_VARIANT (pending warning, confirmed success, cancelled and no-show error, completed neutral). Guest risk follows guest-signals getRiskVariant (risky error, standard warning, trusted neutral). Any other value shows neutral."
  - "Bad rows: a reservation row, slot or guest missing one of its required words is dropped and the rest render, following the wave-1 Timeline precedent (#7462 drops an event with no title). Only when every row is unusable does the element fall back. This trades a silently missing row for zero whole-element fallbacks; Review should weigh it."
  - "Several guest matches: one guest card per match, stacked. Prompt guidance caps it at 5 cards and has the model say how many more matched in words. The cap is a design choice, not from the brief."
  - "Availability shows open times only. Unavailable slots in the tool result are left out, and the model's sentence covers why a requested time is missing."
  - "Empty slot list: the prompt tells the model to answer a closed or fully booked day in words and render nothing. If an empty slot list is rendered anyway, the element shows one short line in the user's language rather than an empty box or the seam fallback, so a model slip cannot cost the zero-fallback criterion."
  - "Tonight's list mirrors the dashboard: a 'how does tonight look' answer lists active bookings and leaves out cancelled and no-show ones. A lookup of a specific reservation shows it whatever its status."
  - "Mapping change: the current chat prompt maps 'a night's bookings in arrival order' to Timeline. This design moves reservations to the reservation list and keeps Timeline for a guest's visit history only, so the two never compete for the same data."
  - "F25 behaviour: all timestamps in one Timeline share a column as wide as the longest one, up to about a third of the Timeline's width; past that, a timestamp wraps onto a second line inside its column. Chosen over moving long timestamps above the title, which would make one Timeline mix two layouts."
  - "F26 cause: the hypothesis below (the focus-only hints line collapses on blur and moves the Generate button between press and release) comes from reading PromptBar.tsx and has not been tested. It is a lead for Implement, not a finding."
---

# UX: Fitting chat elements for reservations, availability and guests (wave 2)

Every element here is display-only. Nothing takes a click, a hover or
focus, and nothing may look as if it does: no pointer cursor, no button
shapes, no hover states. The chat drawer and /gen both render the same
catalog element, so each element is designed once for both widths.

**Geometry that drives every layout.** The chat drawer is 400 px wide
(`min(400px, 100vw - 48px)`), and an assistant message is capped at 80% of
it. A generated element in the drawer therefore gets about **300 px**. The
/gen preview and the full `/chat` page are much wider. Each element must
read well at 300 px and simply stretch when wider. It must never need a
horizontal scroll.

## Flows

### Flow 1: tonight's bookings (stories 1; `list_today_reservations`)

1. Staff open the chat drawer from the dashboard and ask "How does tonight
   look?" or tap that starter question.
2. The chat shows its existing typing indicator while the model calls
   `list_today_reservations`.
3. The reply is one short sentence ("Six bookings tonight, 22 covers.")
   followed by the **reservation list**, rows in arrival order.
4. Staff scan down the time column and read guest, party size and status
   on each row. Done: there is no next action inside the element.

### Flow 2: find one reservation (story 1; `lookup_reservation`)

1. Staff ask "When is the Garcia party coming?"
2. The model calls `lookup_reservation`.
3. One match: a sentence plus a reservation list with one row. Several
   matches: the same list with one row each. No match: a sentence only
   ("There's no booking under Garcia."), no element.

### Flow 3: offer a guest a time (story 2; `check_availability`)

1. Staff ask "Do we have anything for 4 on Friday?"
2. The model calls `check_availability`.
3. Open times exist: a sentence plus the **open-times list** for that date
   and party size. Staff read a time to the guest.
4. Closed day or fully booked: a sentence only, in words that say which
   ("We're closed on Fridays." / "Friday is fully booked for 4."). No
   element, so nothing reads as an empty grid.
5. Booking is a separate, existing flow (staff ask the chat to book; the
   write confirm bar appears). The open-times list does not start it.

### Flow 4: who is this guest (story 3; `search_guests`)

1. Staff ask "Who is Maria Garcia?" or "Tell me about the Nguyens."
2. The model calls `search_guests`.
3. One match: a sentence plus one **guest card**. Two to five matches: a
   card each, stacked. More than five: five cards plus a sentence saying
   how many more matched and asking for a detail to narrow it. No match: a
   sentence only.

### Flow 5: table status (unchanged; `get_table_status`)

Already designed and live since wave 1: labelled StatusLEDs (batch 7b,
scenario 10b). Listed so the live batch covers all five read tools; no
change.

### Flow 6: a generated timeline in /gen (story 4; F25)

1. The Owner asks /gen for something with dated events, such as a guest
   profile with a visit history.
2. The Timeline renders with long timestamps ("March 14, 2025") in a
   column that fits them. No timestamp overlaps an event dot or a title,
   in compact or normal mode, at chat or /gen width.

### Flow 7: first Generate click on /gen (story 5; F26)

1. The Owner puts a prompt in the /gen prompt box: by typing, pasting,
   recalling history with the up arrow, or an automation filling the field.
2. The Owner clicks Generate **once**.
3. The request is sent and the button turns into Stop straight away.

## Screens

### Reservation list (new; chat drawer and /gen)

At 300 px, one row per reservation:

```
┌───────────────────────────────────────────┐
│ 6:00 PM   Lee Family             Confirmed│
│           Party of 2                      │
│───────────────────────────────────────────│
│ 7:30 PM   Maria Garcia             Pending│
│           Party of 4                      │
│───────────────────────────────────────────│
│ 8:15 PM   Walk-in                Confirmed│
│           Party of 3                      │
└───────────────────────────────────────────┘
  time      guest (wraps, never cut)  status
            party size under the name
```

- Purpose: scan the night's or the match's bookings by time.
- Row order: the order the model gives, which the prompt says is arrival
  time. The element does not re-sort.
- Time: leading column, the most prominent text in the row, as the model
  writes it (display text such as "7:30 PM", like Stat and Timeline).
  Every row's time column is the same width so times line up.
- Guest: the guest's name, or "Walk-in" when the booking has none (the
  dashboard's word). A long name wraps onto a second line; it is never cut
  off with an ellipsis, because the PRD needs it visible.
- Party size: under the name, as words in the user's language ("Party of
  4", "4 personas"), never a bare number. How the words are produced is
  the Architect's call.
- Status: a status word on the right in the dashboard's status colours
  (assumption 3). The word is always visible, so colour is never the only
  signal. An unrecognised status still shows its word, in neutral.
- Rows are separated by spacing and at most a hairline rule, not boxes
  (rubric `gray-card-border`). No card title is needed; the model's
  sentence introduces the list.
- Read by a screen reader as a list, each row in visual order: "7:30 PM,
  Maria Garcia, Party of 4, Pending."
- Wider (/gen, `/chat`): the same row stretches, and the status stays at
  the right edge. At this width party size may sit on the same line as the
  name.
- Empty state: not rendered. A tool result with no reservations is
  answered in words (Flows 1 and 2).
- Loading state: none of its own. The chat's existing typing indicator
  covers the wait, and the element appears when its spec arrives.
- Error state: a tool error is answered in words (existing behaviour). A
  row missing its time, guest, party size or status is dropped and the
  other rows render (assumption 4). Only a list with no usable row shows
  the existing "Component could not be displayed" fallback, which the
  live batch counts as a failure.

### Open-times list (new; chat drawer and /gen)

```
┌───────────────────────────────────────────┐
│ Friday, October 30 · Party of 4           │
│                                           │
│ 5:30 PM  6:00 PM  6:15 PM  7:45 PM        │
│ 8:00 PM  8:30 PM  9:00 PM                 │
└───────────────────────────────────────────┘
```

- Purpose: read the open times for one date and party size to a guest.
- Header line: the date and party size the times are for, as the model
  writes them. This is what makes the list trustworthy when the guest
  changed their mind twice in the conversation.
- Times: open times only (assumption 6), in time order, as short static
  labels that wrap onto as many lines as needed. At 300 px that is about
  four per line. They look like labels (the Tag look), never like buttons:
  nothing here books anything.
- Empty state: the prompt says to answer a closed or fully booked day in
  words and not render this (PRD: "reported in words, not as an empty
  element"). If it is rendered with no times anyway, it shows the header
  and one short line in the user's language, such as "No open times"
  (assumption 7). It never shows an empty box or the fallback.
- Loading state: the chat's typing indicator, as above.
- Error state: a tool error is answered in words. A time with no text is
  dropped. Only a list whose header is missing falls back.

### Guest card (new or composed; chat drawer and /gen)

```
┌───────────────────────────────────────────┐
│ Maria Garcia                              │  display type
│ 12 visits · Trusted                       │  visits, then risk word
│                                           │
│ [VIP] [Regular] [Gluten-free] [Birthday]  │  tags, wrapping
└───────────────────────────────────────────┘
```

- Purpose: know who the guest is before they reach the stand.
- Name: in the display face (`--rialto-font-display`), the card's only
  heading-sized text. That is the brand's voice here, as on the dashboard
  GuestCard.
- Visits: "12 visits" / "1 visit" in the user's language; "First visit"
  style wording is not required.
- Risk: always shown as a word (Trusted, Standard, Risky) in the
  dashboard's risk colours (assumption 3). It sits on the visits line so
  the two read together. An unrecognised risk value shows its word in
  neutral.
- Tags: the guest's tags as Tags in one wrapping row. With no tags the row
  is left out entirely; there is no "No tags" text.
- Several matches: one card per guest, stacked with spacing, at most five
  (assumption 5).
- Not on the card: email, phone, staff notes, lifetime spend. Contact
  details stay on the dashboard guest page, where staff are authorised to
  act on them.
- Live evidence: batch 7e (/gen, relayed by the orchestrator and not yet
  logged in the scenario file) produced a guest profile as Card > Stack
  with a display Text name, a Badge, four Tags, a label Text and a compact
  Timeline: 12 elements and 0 seam fallbacks. The composition works. It
  showed a reservation status ("Confirmed") where this card needs risk,
  and no visit count, so the guidance has to name those two fields.
  Whether this card is a new element or a documented composition is the
  Architect's call; this layout holds either way.
- Empty state: not rendered; no match is answered in words.
- Loading state: the chat's typing indicator.
- Error state: a card missing its name, visits or risk is dropped and the
  other cards render. Tags are optional data: a card with none is valid.

### Timeline (changed; F25)

```
 Before (compact, 48 px timestamp column):

 March 14, 20●5   Dinner, party of 2      ← date runs under the dot

 After:

 March 14, 2025  ●  Dinner, party of 2
 Feb 2, 2025     ●  Birthday, party of 6
 7:30 PM         ●  Seated
```

- Purpose: unchanged. A time-ordered sequence, used for a guest's visit
  history.
- Timestamps in one Timeline share a column as wide as the longest of them,
  so the dots stay in one vertical line (assumption 10).
- That column is capped at about a third of the Timeline's width. A
  timestamp longer than the cap wraps onto a second line inside its
  column. It never overlaps the dot or the title, and it is never cut off.
- Short timestamps ("7:30 PM") keep today's look: the fix must not widen a
  Timeline whose timestamps already fit.
- Events with no timestamp keep the empty column, as today.
- Empty, loading and error states: unchanged from wave 1. An event with no
  title is dropped (#7462).

### /gen prompt bar (changed; F26)

```
┌────────────────────────────────────────────────────┬──────────┐
│ Describe the UI you want to build...               │ Generate │
└────────────────────────────────────────────────────┴──────────┘
  Enter to send · Shift+Enter for new line · ↑ for history
```

- Purpose: unchanged. One click on Generate sends the prompt.
- Required behaviour: whenever the prompt box holds text, however it got
  there, the first click on Generate sends the request. The button does
  not move between press and release.
- Lead for Implement (assumption 11): the hints line under the box is
  shown only while the box has focus. Pressing Generate takes focus from
  the box, the hints line disappears, the bottom-anchored bar gets shorter,
  and the button moves down under the pointer before the release. The
  click then lands outside the button. A second click works because focus
  has already gone. This matches F26 as observed (first click only; fine
  on the second) and batch 7e's reproduction with Playwright `fill`, which
  focuses the box. It is untested.
- If that is the cause, the fix must keep the bar the same height with and
  without focus. The hints line may still fade or change, but it must not
  change the layout.
- Empty state (no text): Generate stays disabled, as today.
- Loading state: the button turns into Stop at once, as today.
- Error state: unchanged. A failed generation restores the prompt into the
  box.

### Chat prompt guidance (content, not a screen)

The PRD needs one line of guidance per new data shape. In the same voice as
the existing mapping line in `gen-agent-prompt.ts`:

| Tool data                                       | Element              | The guidance must say                                                                                                                                                          |
| ----------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list_today_reservations`, `lookup_reservation` | Reservation list     | one row per booking in arrival order; time as display text; guest name or Walk-in; party size; status in plain words; leave out cancelled and no-shows for "tonight" questions |
| `check_availability`                            | Open-times list      | open times only, with the date and party size; a closed or fully booked day is a sentence, never this element                                                                  |
| `search_guests`                                 | Guest card           | name, visit count, risk in plain words, tags; one card per match, at most five, then say how many more                                                                         |
| guest visit history                             | Timeline             | unchanged; Timeline is no longer the mapping for a night's bookings (assumption 9)                                                                                             |
| `get_table_status`                              | StatusLED with label | unchanged                                                                                                                                                                      |

Every element is introduced by one short sentence and never repeats it
(F14). Words in elements are in the user's language, like the reply.

## Conventions to match

- Rialto tokens only: `--rialto-surface*`, `--rialto-text-*`,
  `--rialto-space-*`, `--rialto-font-display` for the guest name. No
  gradients, no permanent dark canvas, no boxes inside boxes
  (`.claude/rules/ui-quality.md`; `docs/ui-quality/rubric.md`).
- Brand direction (speakeasy, high-class) comes through the display face
  and restraint, never at the cost of contrast. Every text and status
  colour uses the contrast-checked tokens, and the result must pass axe
  with zero violations at every impact, `color-contrast` included.
- Status words, the risk words and "Walk-in" match the hospitality
  dashboard's English (`timeline.status.*`, `crm.risk.*`,
  `home.reservations.walkIn`), so the chat and the dashboard never
  disagree on what a booking is called.
- Colour is never the only carrier of meaning: every status and risk shows
  its word (the F23 lesson).
- Elements fit 300 px without horizontal scroll and stretch when wider.
- Display-only: no element is focusable, clickable or hoverable.
- The wave-1 schema rules in the brief and PRD (required words, tolerant
  enums, no nested `.max()`, no inner double quotes in descriptions) are
  the Architect's to apply; this design assumes them.
- No motion. Elements appear when their spec arrives, so reduced motion
  needs nothing extra.

## Deliberately not designed

- Any action from an element: booking from an open time, opening a guest
  profile, calling a guest. `emit`/`on` are no-ops in the chat.
- Guest history on reservation rows (visit count or risk per booking). That
  was the unchosen Showstopper rung and needs a new data path.
- Notes, occasion, table and seating preference on reservation rows; the
  brief lists four fields.
- Tables available per open time, and unavailable times shown as full.
- Grouping or paging long reservation lists (a 40-booking night is one
  long list in the drawer's scroll).
- Contact details, staff notes and spend on the guest card.
- Waitlist and menu answers (F12), charts, and write-tool confirm bars
  (existing).
- Skeleton states inside elements; the chat's typing indicator is the only
  loading state.
- Exact spacing, type sizes and colours beyond the tokens named above.
  Implement picks them from rialto's scale.
