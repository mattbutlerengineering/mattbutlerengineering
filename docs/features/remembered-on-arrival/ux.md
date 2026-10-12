---
stage: ux
run: feature:remembered-on-arrival
date: 2026-09-28
assumptions:
  - "No animation is added, and reduced motion holds by inheritance. Every new block sits inside a container whose entrance is already gated (ConfirmationView.module.css:44-51) or that has no motion at all. This is the brief's § UX default (orchestrator), not a user answer."
  - "Brand direction (speakeasy / high-class / royalty / gen-z, through rialto tokens, never over accessibility) comes from the brief's lens, an orchestrator default. Here it is expressed only as restraint: the tracked small-caps label, one short line, the guest's words in the strongest ink on the block, and no gold, icon, badge or new copy."
  - "ConfirmationView placement: the Special Requests card sits directly after the Reservation Details card, and the contact line keeps its current slot, after the deposit and policy cards and before Add to Calendar. With no deposit or policy card, the two are adjacent, and that is how 'sits next to this line' is read. That phrase is the orchestrator's elaboration in brief § second decision, not the user's quoted answer. What would change it: a deposit booking reading as disconnected in Verify."
  - "Order inside the block is the same on every surface: label, then the one line, then the words. On guest pages the one line is the acknowledgement. On the ticket the host caption takes the same slot, so guest and host read in the same order. Rejected: words first, which buries the line under a 2,000-character note."
  - "Tablet sheet: when notes are present, the block moves out of More to sit between the signals row and the actions. The sheet then opens at the height it already uses after More (Drawer size default, min(50vh, 480px), 384 px at 1024×768) instead of compact (min(40vh, 240px)). At compact height the body has about 138 px of content room, and today's summary, signals and actions already fill about 118 px, so no compact placement shows both the request and Seat Guest. These figures are arithmetic from tokens (Drawer.module.css:53-58, :93-95, :162-166), not a measured render. Without notes the sheet is unchanged. What would change it: the grid-clearance follow-up proving unworkable (surfaced), or a measured render that disagrees."
  - "A long note on the tablet sheet pushes the action row below the fold, and the Host scrolls the sheet to reach Seat Guest. This is accepted because the PRD forbids truncation, and because a two-line note fits alongside every row today's sheet can show (about 273 of about 282 px, arithmetic as above)."
  - "ReservationDetails (desktop sidebar and phone drawer) keeps the block where Notes sits today, after Status and before the deposit section. Only the label, caption and wrapping change. The recessed box (ReservationDetails.module.css:9-15) stays, and the tablet sheet adopts the same box, so the Host sees one treatment on every ticket."
  - "Briefing card: the block keeps today's position, after the dietary tags and before the staff note. The guest's words drop the italic they share with the staff note and render upright in primary ink under the label. The staff note is untouched and gets no label. The label and the style difference separate the two, not colour."
  - "Every title and label in the block uses text-secondary, including on ConfirmationView, where the sibling card titles use the label variant's default tertiary. Computed from colors.json: tertiary on --rialto-surface-recessed is 4.08:1 in the light theme, below 4.5:1, and ConfirmationView's cards are recessed. Secondary there is 4.74:1 (7.02:1 dark)."
  - "The label is tied to the text by making the block a role=group named, via aria-labelledby, by its title or label. This follows the house precedent (booking-guest-reuse ux.md, the linked-guest strip). On guest pages the title is also the card's heading: h3 on ConfirmationView and h2 on ManageReservationPage, matching each page's sibling cards."
  - "The words element carries dir=auto, so a request in a right-to-left script reads correctly. It is its own block element, so bidi control characters in the guest's text cannot reorder the UI around it."
  - "Type scale follows each surface's siblings: caption in ConfirmationView's cards, body on ManageReservationPage, the recessed text-sm box on the ticket, and caption on the Briefing card. The acknowledgement and caption use secondary ink, and the words use primary ink."
  - "The contact line keeps today's centred secondary caption and its render condition (email or phone present). Only the words change. An overlong email or phone breaks anywhere, like the note, so the line cannot cause horizontal scroll."
  - "ManageReservationPage shows the block for every status, CANCELLED included, as SC2 reads literally. The line stays true in the narrow sense, since the words are on the reservation record, and the page's own 'This reservation has been cancelled.' (ManageReservationPage.tsx:257-261) tells the guest the booking is off. What would change it: human review deciding that a cancelled booking drops the line (flagged)."
  - "This stage adds no copy. Every visible string is one of the PRD's four, or is already on the page."
surfaced:
  - "Grid clearance: TimelinePage keeps the selected block clear of the tablet sheet using SHEET_INSET_PX = 240, the compact height (TimelinePage.tsx:52-53, passed at :424). When a party with Special Requests opens the taller sheet, the block can land under it, which regresses hospitality-service-ux Screen 4 ('never lands under the sheet'). Architect must make the clearance follow the sheet's open height. This is app-level code, not an excluded change. The same gap already exists today after More."
  - "ReservationSheet.test.tsx:227-245 pins 'reveals the GuestCard, email, phone and notes only once expanded'. This design inverts the notes half on purpose, and the GuestCard, email, phone and deposit halves stand. :212-225 (compact → default → compact) stays true for a reservation without notes. A reservation with notes opens at default, and More then toggles aria-expanded and the revealed content only."
  - "Pre-existing contrast gap, not fixed here: ConfirmationView's other card titles (Reservation Details, Deposit, Cancellation Policy, Add to Calendar) use Text variant=label's default tertiary on --rialto-surface-recessed, which computes to 4.08:1 in the light theme. token-contrast.test.ts pins text on surface and surface-elevated only (:154-172), never recessed. This is a follow-up seed candidate."
  - "Pre-existing inline literals on ManageReservationPage (padding '2rem' at :116 and :150, maxWidth 600 at :151, padding '1.5rem' at :159 and :209) are left alone. The new card must not copy them. SC9 requires tokens (--rialto-space-lg is the same 24 px)."
  - "EditReservationDrawer still labels the same field 'Notes' (EditReservationDrawer.tsx:172; out of scope per PRD). A Host who taps Edit sees a different name for the words the ticket now calls Special Requests. For human review."
  - "Stale doc comment: ReservationSheet.tsx:38-43 calls it 'The phone's bottom sheet', but TimelinePage.tsx:577 renders it only at the tablet viewport (768–1024 px, useViewport.ts:10-11). Not fixed here."
  - "Recommendation for Architect: render the words as one text node whose line breaks come from the block's wrapping rule, not as one element per line. SC6's 'no element is created from the guest's text' is cleanest that way."
---

# UX: Remembered on arrival

The primary actor is the Guest on a phone at 375 px who just typed into
**Special Requests**. The secondary actors are the Host at the stand (tablet
1024×768, finger), the Host at the pre-shift briefing, and staff at a desktop
sidebar. Keyboard-only and screen-reader users are a mode of every screen,
not a separate one. Evidence label: this is a design gap only, with n = 0
observed guests (idea.md).

Five surfaces change, and they all change the same way. Where Special
Requests has content, the surface shows one block: a label, one line, and the
words. Where it is empty, nothing appears. Separately, the confirmation stops
claiming a message was sent. No control, no animation and no new copy are
added anywhere.

## The one shared block

A single composition in three variants. Each surface below says only where the
block sits and which variant it uses.

| Variant  | Surfaces                                | Label element                                                | The one line                                                            | The words                                         |
| -------- | --------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------- |
| Guest    | ConfirmationView, ManageReservationPage | the card's heading, `Special Requests`                       | `Noted. It's on your reservation for the team.`                         | plain, primary ink, the page's type scale         |
| Ticket   | ReservationDetails, ReservationSheet    | `Text variant="label" color="secondary"`, `Special Requests` | `Guests see this with: “Noted. It's on your reservation for the team.”` | in the recessed box (`--rialto-surface-recessed`) |
| Briefing | BriefingPage card                       | `Text variant="label" color="secondary"`, `Special Requests` | none (PRD: keep the scan compact)                                       | caption, primary ink, upright                     |

These rules hold on every surface:

- **Present**: the notes are non-empty after trimming. The block shows the
  _displayed text_: leading and trailing whitespace dropped, interior spaces
  kept as typed, and a new line wherever the guest pressed return.
- **Empty** (`null`, `""`, `"   "`, `"\n\t "`): no block, no container, no
  leftover gap. The surface reads exactly as it does today (SC5).
- **Long** (2,000 characters including a 300-character unbroken run): the
  text is shown in full and wraps at the block's edge. An unbroken run breaks
  wherever it meets the edge. There is no inner scroll box, no truncation and
  no "show more". The card, sheet or sidebar grows and scrolls vertically as
  it already does. Nothing scrolls sideways at 375 px (SC9).
- **Untrusted characters**: `<script>alert(1)</script>`,
  `<a href="https://x">x</a>`, `&amp;`, and single and double quotes all show
  as the literal characters typed. Nothing becomes a link, markup or an
  element (SC6). The words element carries `dir="auto"`.
- **Semantics**: the block is `role="group"` named with `aria-labelledby` by
  its label or heading, so a screen reader announces "Special Requests,
  group" and reads the line and the words as plain text. The block holds no
  focusable element. It is never inside a live region; none wraps these
  surfaces today (the only app live region is the sibling `LiveStatus`,
  `LiveStatus.tsx:16`). Meaning is carried by words and position, never by
  colour alone (SC9).
- **Motion**: none. The block appears with its surface.
- **Tone**: the block is short and confident, with no exclamation mark, emoji
  or "we'd be delighted". The small-caps tracked label reads like a menu
  card. The guest's words get the strongest ink on the block. Gold stays
  where rialto allows it (focus and primary actions) and never touches this
  block.

## Flows

### Flow 1: Guest books with a request (widget → confirmation)

1. The Guest, on the public booking page at 375 px, picks a date, party and
   time, then enters name and email. She types into **Special Requests**
   (`GuestDetailsForm.tsx:212-220`): "Our anniversary." ⏎ "Window seat if you
   can, and she can't have tree nuts." She taps **Complete Reservation**.
2. The confirmation shows, top to bottom: "Reservation Confirmed!", the
   **Reservation Details** card, then the **Special Requests** card, which
   reads "Noted. It's on your reservation for the team." with her two lines
   below it as typed. The deposit and policy cards follow when they apply.
   Next comes the contact line: "No confirmation email or text is sent for
   this booking, so save these details. The venue has sam@example.com on your
   reservation." Last are **Add to Calendar** and the two actions.
3. She saves the booking through **Add to Calendar**, whose actions are given
   the manage link (`ConfirmationView.tsx:198`, `:203`, `:211`), or with a
   screenshot. Nothing tells her to wait for an email.
4. If she typed no request, there is no Special Requests card and everything
   else is the same, including the new contact line.

### Flow 2: Guest returns (manage page)

1. She opens the manage page from the calendar event or from the
   confirmation's **Cancel Reservation** (`ConfirmationView.tsx:224-233`).
2. The page shows the venue name, then **Reservation Details** (Guest, Party
   Size, Date, Time). Special Requests no longer appears as a row in this
   card. It follows as its own **Special Requests** card, with the same line
   and words she saw at booking. Then come **Add to Calendar**, Call and
   Cancel.
3. If staff edited the words since, she sees the current value. This is
   pre-existing behaviour (PRD open question 3).

### Flow 3: Host, pre-shift (Tonight's Service)

1. The Host scans the Briefing. Sam Rivera's card shows the time, covers,
   table, segment badge and allergy tags. Below them sit "SPECIAL REQUESTS"
   and her words, upright, then any staff note, italic and unlabelled as
   today.

### Flow 4: Host at the stand (tablet Timeline)

1. The party arrives and the Host taps their block. The sheet opens at the
   taller height. It shows the summary row, the signals row, "SPECIAL
   REQUESTS", the caption "Guests see this with: “Noted. It's on your
   reservation for the team.”", and the words in the recessed box. Below
   those are **Seat Guest**, **Edit reservation**, **Cancel reservation**,
   **Mark No-Show** and **More ▾**.
2. The Host reads "window seat" before seating, then taps **Seat Guest** as
   today. **More ▾** still reveals the GuestCard, email, phone and deposit.
3. For a party with no request, the sheet opens compact, exactly as today.

### Flow 5: Staff at a desktop (sidebar) or phone (right drawer)

1. Selecting a block opens the sidebar (≥ 1025 px) or the right drawer
   (< 768 px), both rendering `ReservationDetails` (`TimelinePage.tsx:360-371`,
   `:552`, `:593`). The block sits where Notes was, relabelled
   **Special Requests**, with the caption above the words.

### Flow 6: Keyboard and screen reader (a mode of Flows 1–5)

1. On the confirmation, heading navigation reaches "Special Requests" (h3)
   right after "Reservation Details" (h3). The reader announces "Special
   Requests, group", then the line, then the words, once, and only when the
   user reaches them. Nothing is announced on arrival.
2. Tab order is unchanged on every surface, because the block adds nothing
   focusable. On the tablet sheet, focus trap, Escape and focus return are
   the Drawer's own, unchanged.

## Screens

### Screen 1: ConfirmationView (booking widget)

```
PRESENT, 375 px                              EMPTY
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
│                  ( ✓ )                  │  │  … Reservation Details card …           │
│          Reservation Confirmed!         │  │  (no Special Requests card, no gap)     │
│      We look forward to seeing you.     │  │  … deposit / policy cards if any …      │
│ ┌─────────────────────────────────────┐ │  │   No confirmation email or text is sent │
│ │ RESERVATION DETAILS                 │ │  │   for this booking, so save these       │
│ │ Confirmation #            8F3A2C1D  │ │  │   details. The venue has (555) 123-4567 │
│ │ Date         Friday, Oct 2, 2026    │ │  │   on your reservation.                  │
│ │ Time                      7:00 PM   │ │  │  … Add to Calendar, actions …           │
│ │ Party Size               2 guests   │ │  └─────────────────────────────────────────┘
│ │ Name                    Sam Rivera  │ │
│ └─────────────────────────────────────┘ │  LONG (2,000 chars, 300-char unbroken run)
│ ┌─────────────────────────────────────┐ │  │ ┌─────────────────────────────────────┐ │
│ │ SPECIAL REQUESTS                    │ │← │ │ SPECIAL REQUESTS                    │ │
│ │ Noted. It's on your reservation for │ │  │ │ Noted. It's on your reservation for │ │
│ │ the team.                           │ │  │ │ the team.                           │ │
│ │ Our anniversary.                    │ │  │ │ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa │ │ ← run breaks at
│ │ Window seat if you can, and she     │ │  │ │ aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa │ │   the card edge
│ │ can't have tree nuts.               │ │  │ │ … every character, in full …        │ │
│ └─────────────────────────────────────┘ │  │ └─────────────────────────────────────┘ │
│ ┌ DEPOSIT (when a deposit applies) ───┐ │  │   (page scrolls vertically; never       │
│ ┌ CANCELLATION POLICY (when set) ─────┐ │  │    sideways)                            │
│   No confirmation email or text is sent │
│   for this booking, so save these       │  UNTRUSTED
│   details. The venue has                │  │ │ <script>alert(1)</script>           │ │ ← literal text
│   sam@example.com on your reservation.  │  │ │ <a href="https://x">x</a> &amp;      │ │ ← not a link
│ ┌─────────────────────────────────────┐ │  │ │ "double" 'single'                   │ │
│ │ ADD TO CALENDAR                     │ │  │ │ second line                         │ │ ← newline kept
│ │ [Download .ics] [Google] [Outlook]  │ │
│ └─────────────────────────────────────┘ │
│ [          Cancel Reservation         ] │
│ [       Make Another Reservation      ] │
└─────────────────────────────────────────┘
```

- **Purpose**: the Guest leaves knowing the venue has her request and that
  she must save the booking herself. She has nothing to do in the block;
  her one action on the screen is saving (Add to Calendar).
- **Placement**: the new card sits immediately after the Reservation Details
  card (`ConfirmationView.tsx:95-154`) and before the deposit card (`:156`).
  The contact line keeps its slot (`:182-187`), after the policy card and
  before Add to Calendar, so "save these details" leads into the saving
  action.
- **Hierarchy**: the card title (`Text variant="label" as="h3"`,
  `color="secondary"`) keeps the sibling titles' margin, then a
  `Stack gap="sm"` holding the acknowledgement
  (`Text variant="caption" color="secondary"`) and the words
  (`Text variant="caption" color="primary"`, `dir="auto"`). The card reuses
  the existing `detailsCard` treatment (`ConfirmationView.module.css:135-140`:
  `--rialto-surface-recessed`, `--rialto-space-lg` inset,
  `--rialto-radius-soft`, `text-align: start`), so a long note is never
  centred.
- **Contact line**: position and style unchanged
  (`Text variant="caption" color="secondary" align="center"`). The text is
  replaced with the PRD's line. Its condition is today's (email or phone
  present). `{contact}` is the email, else the phone. It is never rendered
  with neither.

  | Guest gave | The line reads                                                                                                                    |
  | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
  | email      | No confirmation email or text is sent for this booking, so save these details. The venue has sam@example.com on your reservation. |
  | phone only | No confirmation email or text is sent for this booking, so save these details. The venue has (555) 123-4567 on your reservation.  |
  | both       | the email variant (today's precedence)                                                                                            |
  | neither    | no line (today's condition)                                                                                                       |

  The contact is guest-typed, so it renders as text, and an overlong
  unbroken address breaks at the edge.

- **Loading / error**: none of its own. The view mounts only once the confirm
  response holds the reservation (`BookingWidget.tsx:223-224`). Confirm
  failure stays on the form, unchanged.
- **Motion**: the card rides the container's existing entrance, which reduced
  motion already cancels (`ConfirmationView.module.css:44-51`).
- **Check**: US1, US2; SC1, SC5, SC6, SC7, SC9; lens RECOGNIZE (her words
  back), NO-DEAD-END (tells her to save; the calendar action is right there),
  TONE, CALM (one line), INCLUSIVE.

### Screen 2: ManageReservationPage

```
PRESENT, 375 px                                    EMPTY
┌─────────────────────────────────────────┐        ┌─────────────────────────────────────────┐
│ The Velvet Room                         │ h1     │ The Velvet Room                         │
│ ┌─────────────────────────────────────┐ │        │ ┌ RESERVATION DETAILS ────────────────┐ │
│ │ RESERVATION DETAILS                 │ │ h2     │ │ Guest · Party Size · Date · Time    │ │
│ │ Guest                   Sam Rivera  │ │        │ └─────────────────────────────────────┘ │
│ │ Party Size                2 guests  │ │        │ ┌ ADD TO CALENDAR ────────────────────┐ │
│ │ Date         Friday, Oct 2, 2026    │ │        │ [ Call The Velvet Room ]                │
│ │ Time          7:00 PM – 9:00 PM     │ │        │ [ Cancel Reservation ]                  │
│ └─────────────────────────────────────┘ │        └─────────────────────────────────────────┘
│ ┌─────────────────────────────────────┐ │
│ │ SPECIAL REQUESTS                    │ │ h2, replaces the row at :195-202
│ │ Noted. It's on your reservation for │ │ body, secondary
│ │ the team.                           │ │
│ │ Our anniversary.                    │ │ body, primary, as typed
│ │ Window seat if you can, and she     │ │
│ │ can't have tree nuts.               │ │
│ └─────────────────────────────────────┘ │
│ ┌ ADD TO CALENDAR ────────────────────┐ │
│ [ Call The Velvet Room ]                │
│ [ Cancel Reservation ]                  │
└─────────────────────────────────────────┘
```

- **Purpose**: what she sees later matches what she saw at booking. Her one
  action on the page is still Cancel or Call.
- **Placement**: the `Special Requests` row inside the details card
  (`ManageReservationPage.tsx:195-202`) is removed. A new `Card` follows the
  details card, before Add to Calendar (`:207`). The row was a
  `Stack direction="row" justify="between"`. In that layout a 300-character
  run would force the row wider than the card, and the new block's layout
  removes that failure.
- **Hierarchy**: `Card` (`role="group"`, `aria-labelledby` the title), inner
  `Stack gap="md"`, inset `--rialto-space-lg` from a CSS-module class, not
  the page's inline `"1.5rem"` (surfaced). Title: `Text as="h2" variant="label"
color="secondary"`. Then a `Stack gap="sm"` holding the acknowledgement
  (`Text variant="body" color="secondary"`) and the words
  (`Text variant="body"`, primary, `dir="auto"`).
- **Long / untrusted / empty**: the shared rules. At 375 px the card's text
  column is the page width minus the page and card insets. It wraps inside
  that column and never scrolls sideways (SC9).
- **Cancelled**: the block still shows, and the page's existing "This
  reservation has been cancelled." (`:257-261`) stays where it is (assumption,
  flagged).
- **Loading / error**: unchanged. "Loading reservation..." and the
  `DeadEndRescue` states (`:104-137`) render before any reservation exists,
  so the block cannot appear in them. Their "confirmation email" copy is out
  of scope (PRD).
- **Motion**: none. `Card` defaults to `tilt={false}`.
- **Check**: US3; SC2, SC5, SC6, SC9; lens RECOGNIZE, NO-DEAD-END, INCLUSIVE.

### Screen 3: ReservationDetails (desktop sidebar ≥ 1025 px, phone right drawer < 768 px)

```
┌ Reservation Details ──────────────── [✕] ┐
│ GuestCard (or GUEST / name)              │
│ EMAIL                                    │
│ sam@example.com                          │
│ TIME                                     │
│ 7:00 PM - 9:00 PM                        │
│ PARTY SIZE · TABLE · STATUS (as today)   │
│ SPECIAL REQUESTS                         │ ← was "NOTES"
│ Guests see this with: “Noted. It's on    │ ← NEW caption
│ your reservation for the team.”          │
│ ┌──────────────────────────────────────┐ │ ← recessed box, as today
│ │ Our anniversary.                     │ │
│ │ Window seat if you can, and she      │ │
│ │ can't have tree nuts.                │ │
│ └──────────────────────────────────────┘ │
│ (deposit section)                        │
│ [ Edit Reservation ]                     │
│ [ Seat Guest ] [ Cancel … ] [ No-Show ]  │
└──────────────────────────────────────────┘
```

- **Purpose**: the Host sees the guest's words under the guest's label, and
  sees what the guest's pages say about them.
- **Placement**: unchanged, in the Notes slot after Status and before
  `StaffDepositSection` (`ReservationDetails.tsx:167-176`).
- **Hierarchy**: the label is `Text variant="label" color="secondary"` with
  text `Special Requests` (was `Notes`), in a `Stack gap="2xs"` group with
  the caption (`Text variant="caption" color="secondary" as="div"`) and the
  words box. The box keeps `.notesValue` (`ReservationDetails.module.css:9-15`:
  `--rialto-text-sm`, `--rialto-text-primary` on `--rialto-surface-recessed`,
  `--rialto-space-xs` inset, `--rialto-radius-sharp`), plus the shared
  wrapping rules.
- **Long**: the sidebar and drawer already scroll vertically, and the box
  grows in full. **Empty**: no label, caption or box. **Untrusted**: shared
  rules.
- **Loading / error**: none of its own. The block reads the reservation
  already in memory.
- **Check**: US4; SC3, SC5, SC6 (the host surface SC6 names); lens RECOGNIZE,
  CALM.

### Screen 4: ReservationSheet (tablet 768–1024 px)

```
WITH SPECIAL REQUESTS: opens at the taller height (Drawer size="default", the height More uses today)
├──────────────────────────────────────────────────────────────────────────┤
│ Sam Rivera                                                         [ ✕ ] │  Drawer title
│ party of 2 · 7:00 PM · Table 4 · Confirmed                               │  summary (as today)
│ [Repeat] [Allergy: tree nuts]                                            │  signals (when linked)
│ SPECIAL REQUESTS                                                         │  ← moved out of More
│ Guests see this with: “Noted. It's on your reservation for the team.”    │
│ ┌──────────────────────────────────────────────────────────────────────┐ │
│ │ Our anniversary.                                                     │ │
│ │ Window seat if you can, and she can't have tree nuts.                │ │
│ └──────────────────────────────────────────────────────────────────────┘ │
│ [ Seat Guest ] [ Edit reservation ] [ Cancel reservation ]               │  actions (as today;
│ [ Mark No-Show ] [ More ▾ ]                                              │  the row wraps)
└──────────────────────────────────────────────────────────────────────────┘

WITHOUT: unchanged, compact (240 px)
├──────────────────────────────────────────────────────────────────────────┤
│ Jordan Lee                                                         [ ✕ ] │
│ party of 3 · 8:00 PM · Table 2 · Pending                                 │
│ [ Seat Guest ] [ Edit reservation ] [ Cancel reservation ]    [ More ▾ ] │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: the Host reads the request before tapping **Seat Guest**.
  Seat Guest remains the one thing the Host does here.
- **Placement**: the block leaves the expanded section
  (`ReservationSheet.tsx:207-216`). It now sits after the occupied caption
  and signals row (`:118-135`) and before the failure banner and action row
  (`:137-182`). The "Guest not seated." banner stays directly above the
  actions, as the prior run placed it. **More ▾** now reveals the GuestCard,
  email, phone and deposit, and not the notes.
- **Height**: with present notes the sheet opens at `size="default"`
  (`min(50vh, 480px)`, about 384 px at 1024×768). Without them it opens at
  `"compact"` (`min(40vh, 240px)`) exactly as today. The height is derived
  from the reservation during render, with no effect and no transition, the
  same class swap More already uses (`:75-81`). The compact body leaves
  about 138 px for content, and today's rows fill about 118 px of it, so the
  request cannot fit at compact height without pushing Seat Guest out of
  view (arithmetic, see assumptions). The grid's clearance for the selected
  block must follow the taller height (surfaced).
- **Hierarchy**: identical to Screen 3's block (label, caption, recessed
  box) so every ticket reads the same. The block adds no control, so the
  sheet's 44 px coarse-pointer rule (`ReservationSheet.module.css:35-40`) is
  untouched.
- **Long**: the block grows in full. The action row follows it, and the
  Drawer body scrolls (`Drawer.module.css:162-166`), so the Host scrolls to
  reach Seat Guest (accepted, see assumptions). **Empty**: no block, compact
  sheet. **Untrusted**: shared rules.
- **Loading / error**: none of its own (the reservation is in memory). The
  Seat Guest failure banner is unchanged.
- **Motion**: the Drawer's entrance is rialto's own and is already
  reduced-motion gated (`Drawer.reducedMotion.test.tsx`). The height choice
  never animates.
- **Check**: US4, US5; SC3 (visible without activating More), SC5; lens
  RECOGNIZE, NO-DEAD-END (no hidden request), CALM (Seat Guest keeps its
  label and style, and a party without a request sees no change).

### Screen 5: BriefingPage card

```
┌──────────────────────────────────────────────────────────────────┐
│ 7:00 PM   [2 covers] [Table 4]                                   │
│ Sam Rivera   [Repeat]                                            │
│ 3rd visit                                                        │
│ [Allergy: tree nuts]                                             │
│ SPECIAL REQUESTS                                                 │ ← NEW label
│ Our anniversary.                                                 │ ← guest's words, upright, primary
│ Window seat if you can, and she can't have tree nuts.            │
│ Ask about the champagne.                                         │ ← staff note: italic, unlabelled, unchanged
└──────────────────────────────────────────────────────────────────┘
```

- **Purpose**: in a pre-shift scan, the Host can tell the guest's words from
  the staff note at a glance.
- **Placement**: unchanged, after the dietary tags (`BriefingPage.tsx:156-172`)
  and before the staff note (`:180-184`). It replaces the unlabelled line at
  `:174-178`.
- **Hierarchy**: a `Stack gap="2xs"` group with `Text variant="label"
color="secondary"` (`Special Requests`) and the words
  (`Text variant="caption" color="primary"`, `dir="auto"`, upright). There is
  no caption on this surface (PRD). The staff note keeps `.notes`
  (`BriefingPage.module.css:44-47`, italic, secondary), so the two now differ
  in label, style and ink, and never by colour alone.
- **Long**: the card grows in full, so a 2,000-character request makes a tall
  card (PRD: no truncation). **Empty**: no label or line. **Untrusted**:
  shared rules.
- **Loading / error**: the page's skeleton and `ErrorRetryBanner` are
  unchanged. Cards render only from loaded entries.
- **Check**: US5; SC3 (the Briefing clause), SC5; lens RECOGNIZE, CALM (one
  label added, no caption, no badge).

## Decisions (UX-owned)

- **(a) One block, three variants.** The guest line and the host caption hold
  the same slot, so "the host ticket says the same thing" holds in position
  as well as in words. What would change it: a Host finding the caption
  noisy on the sidebar (Operate).
- **(b) The guest card goes right after the details card; the contact line
  stays put.** A request belongs with the booking it amends. "Save these
  details" belongs next to the save action. In the usual no-deposit case the
  acknowledgement and the contact line are neighbours anyway.
- **(c) The tablet sheet grows for a request instead of hiding it.** Compact
  cannot hold both the request and Seat Guest. The taller state already
  exists (More), so no new layout state is invented. It appears only when
  there is something to read. Rejected: the block below the action row at
  compact height (it lands below the fold, less visible than a More button
  that at least says "More"), and the block above the actions at compact
  height (Seat Guest leaves the screen for every request).
- **(d) Nothing moves on the sidebar.** It already shows Notes without a tap.
  Relabel and caption only (surgical).
- **(e) Contrast over sibling consistency.** The block's titles use
  secondary ink, because the sibling default (tertiary) fails 4.5:1 on the
  recessed card in the light theme. The siblings themselves are surfaced,
  not fixed.
- **(f) Guest text is a block of text, never structure.** One element, with
  wrapping and line breaks as a visual rule, `dir="auto"`, and nothing
  derived from the content.

## Copy

All four strings come from the PRD, character for character. They are
defined once, and every surface reads them from that one place (SC4). The
host caption embeds the acknowledgement by composition and never retypes it,
so the acknowledgement appears as a literal exactly once.

| Key             | Exact string                                                                                                                  | Renders on                                                                        |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| label           | `Special Requests`                                                                                                            | all five (the same words as the form field, `GuestDetailsForm.tsx:213`)           |
| acknowledgement | `Noted. It's on your reservation for the team.`                                                                               | ConfirmationView, ManageReservationPage                                           |
| host caption    | `Guests see this with: “Noted. It's on your reservation for the team.”` (U+201C / U+201D outer quotes, straight `'` in It's)  | ReservationDetails, ReservationSheet                                              |
| contact line    | `No confirmation email or text is sent for this booking, so save these details. The venue has {contact} on your reservation.` | ConfirmationView, replacing `A confirmation has been sent to {contact}.` (`:185`) |

Every other string on these surfaces is unchanged. No new announcement, hint,
tooltip or visually-hidden text is added.

## Conventions to match

- **Rialto only**: `Text` (variants `label`, `caption` and `body`; colours
  `secondary` and `primary`; `as`), `Stack` (`gap` from `2xs` to `md`),
  `Card` (manage page), and `Drawer` (the `size` prop, already used). Also
  the app's existing `detailsCard` and `.notesValue` treatments. There are no
  raw colours, spacing values or radii; the wrapping rules are keyword
  values, not tokens.
- **Siblings' heading pattern**: `Text variant="label" as="h3"` on
  ConfirmationView and `Text as="h2" variant="label"` on
  ManageReservationPage, as the existing cards use. They do not switch to
  `Heading` for one card.
- **CSS logical properties** (`text-align: start`, `padding-inline`) and both
  themes.
- **Render-time derivation**: the sheet's height and every block's presence
  are computed during render, never set from an effect (the rialto rule
  applied app-side).
- **Copy lives in a TS module**, rendered as `{value}`. The apostrophe in
  "It's" therefore never sits in JSX text, where `react/no-unescaped-entities`
  would fail the commit (gotchas.md § Pre-commit).
- **Selectors downstream**: `getByRole("group", { name: "Special Requests" })`
  finds the block on every surface. `getByText("Special Requests")` now
  matches both the widget's form label and the confirmation's card title
  within the same flow, but never on the same screen.

## Story reachability check

| Story                                            | Reached by               | Screen(s) |
| ------------------------------------------------ | ------------------------ | --------- |
| US1: confirmation shows my request, honest line  | Flow 1 steps 1–2         | 1         |
| US2: confirmation tells the truth about sends    | Flow 1 steps 2–3         | 1         |
| US3: manage page shows it the same way           | Flow 2                   | 2         |
| US4: ticket shows the label and what guests see  | Flows 4–5                | 3, 4      |
| US5: visible without More, set apart on Briefing | Flow 3; Flow 4 steps 1–2 | 4, 5      |

All five stories are reachable, and every screen's **Check** line names its
stories and criteria.

## Deliberately not designed

- The confirmation email, and any send (the user dropped them). The
  manage-page error copy that cites "your confirmation email" and the form
  hint "for confirmation" (PRD out of scope, open question 1).
- A "copy manage link" or other new save affordance. Add to Calendar and a
  screenshot are the saving paths this run relies on.
- An allergy reminder or any parsing of the guest's words (PRD open
  question 2).
- `EditReservationDrawer`'s "Notes" label and the `ReservationsPage` table
  (PRD out of scope; the label mismatch is surfaced).
- Moving the block higher in the desktop sidebar. Also any change to the
  prior run's sheet layout beyond this block and its height.
- Fixing the sibling card-title contrast and the manage page's inline
  literals (surfaced as follow-ups).
- Structured occasion or seating, generated sentences, reminders, and
  staff-only remarks as a separate field (PRD out of scope; backlog).
