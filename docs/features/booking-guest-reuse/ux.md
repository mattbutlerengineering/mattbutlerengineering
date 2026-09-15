---
stage: ux
run: feature:booking-guest-reuse
date: 2026-09-15
assumptions:
  - "Q1 (orchestrator default) LINK-ONLY: picking a guest never edits the profile. UX consequence taken here: the picked guest's email/phone prefill the reservation dialog's own fields, those fields stay editable, and the linked-guest strip carries one sentence saying edits change this booking only. No modal, no confirm."
  - "Q2 (orchestrator default): the public widget is out of UX scope — no widget screen in this artifact; Stories 8 and 9 have no UI surface by design."
  - "Q3 (orchestrator default): no seat-time link from the waitlist. The waitlist strip therefore says 'Recognised', never 'Using … profile', and the block created by seating a waitlist row shows no visit label in this run."
  - "Q4 (orchestrator default): visitCount never accrues in production. The strip's zero state is 'No visits on record yet' (never a bare 0), the listbox row omits visits at 0, and the segment badge is shown only when the rule yields VIP or Repeat — never 'New' on a guest the CRM already holds (ReservationSheet still shows 'New' today; this strip deliberately does not)."
  - "Where the lookup lives (skill silent, no user): the existing Guest name field on each of the three surfaces becomes the typeahead; its typed text is the guest name, and the search key is whatever is typed — name, email or phone all work because GET /guests/search matches all three. The Email/Phone fields (reservation) and Phone field (waitlist) do not suggest; the server's exact-match link on submit (SC3/SC4) covers a Host who types only a contact. Rejected: a fourth 'Find guest' field (heavier, two fields for one person on the walk-in) and three comboboxes (three listboxes)."
  - "PRD SC9 read as: the waitlist Guest name typeahead accepts a phone as its search key, and a pick prefills the Phone field. The PRD sentence 'typing a phone … prefills the name field' is satisfied by typing the phone into the Guest name field and picking; typing into the Phone field itself does not recognise. Flagged in the report for the orchestrator/Verify."
  - "Debounce 300 ms (the app's precedent in useGuestDirectory and useGuestRecognition) and a 2-character minimum before any request; at most 6 rows, then a 'keep typing' status row. No user answer; house precedent."
  - "The listbox stays closed until the query reaches 2 characters — no hint row on focus, because the reservation dialog focuses the Guest name field on open and a dropdown appearing with the dialog is noise. The static hint under the field carries the instruction."
  - "A pick prefills every field the profile has a value for (overwriting what was typed) and leaves a typed value alone where the profile is null. Clear — the button, or wiping the Guest name field to empty — reverts each prefilled field to what it held before the pick unless the Host edited it after the pick, so a cleared pick cannot leave the previous guest's phone behind to be exact-matched on submit (idea.md 'dies if … mislinks')."
  - "Editing the Guest name after a pick keeps the link (LINK-ONLY makes a booking name that differs from the profile legitimate); suggestions reopen at 2+ characters and picking another guest replaces the link. Only Clear or an empty field drops it."
  - "The history strip is a compact composition over the existing guest-signals rules (segment, allergy) plus visits and no-shows, fed by the search result already in memory — not the full GuestCard (notes, contact links, occasions, Add Note) and no second fetch, so there is no loading state inside the dialog. The brief's 'do not build a second card' is read as 'do not duplicate the card's rules', as the prior run's Briefing decision (g) did."
  - "Lookup failure is a degraded helper, not a failure of the Host's action: a caption under the field, one polite announcement, automatic retry on the next keystroke, no ErrorRetryBanner, and submit untouched (SC6)."
  - "Escape with the listbox open closes only the listbox; the next Escape closes the dialog. Tab or blur closes the listbox without picking and keeps the typed text."
  - "Copy in § Copy (field hints, row format, strip titles, announcements, failure caption) is proposed by this stage in the house voice of the prior run; no user reviewed it."
  - "Controls this run adds are ≥ 44×44 px on a coarse pointer, inheriting the prior run's tablet rule; listbox rows ≥ 44 px tall on tablet."
  - "No new animation: the listbox keeps rialto's reduced-motion-gated entrance; the strip appears and disappears without motion."
surfaced:
  - "rialto Combobox (as shipped) cannot render a two-line option row, writes the full option label back into the input on select (the input must show the name only), opens on focus even with an empty query, does not close on Tab/blur, and renders its listbox absolutely inside the wrapper (clipped by NewReservationDialog's overflow-y: auto). Architect decides between extending Combobox (optional description per option, name-only write-back, an open-threshold, blur close — a rialto change + changeset) and an app-level GuestLookup composed over the exported useCombobox hook + rialto Input. The behaviour in Screen 1 is the contract either way."
  - "rialto useEscapeKey fires on any document Escape without checking defaultPrevented, so the dialogs' Escape handlers will close the dialog on the same keypress that closes the listbox. Screen 1's Escape rule needs the dialog handler to ignore an Escape the lookup consumed."
  - "SC8's block label ('12th visit') requires the walk-in response to include the guest relation (reservation.guest); today createWalkIn includes only table. Architect."
  - "Because visitCount is 0 for every real guest until the recordVisit defect is fixed (Q4), no real linked walk-in will show the visit label after ship; only fixture guests will. Verify/Operate should not read its absence as a defect of this run."
  - "E2E: getByLabel(/guest name/i) now resolves to a role=combobox input on all three surfaces (fill still works); while the listbox is open its role=option rows contain the guest's name, a new strict-mode getByText collision for waitlist.spec.ts and walkin.spec.ts. For e2e-selector-drift-reviewer."
---

# UX: Reuse existing guests at booking time

Primary actor: the Host at the stand — tablet 1024×768, finger; also desktop with a keyboard. Keyboard-only and screen-reader Hosts are a mode of every screen. Secondary: the Manager, who sees the result on the Guests page and the sheet, not in these screens. The Online guest sees nothing new (Q2). Evidence label: design-gap only, n = 0 user reports (idea.md, prd.md).

Three surfaces change, and they change the same way: the field where the Host already types the guest's name learns to suggest returning guests, and a pick attaches the booking to that guest and shows what the floor needs to know before the Host confirms. Nothing is added to the path of a Host who ignores it.

## The one shared piece: the guest lookup field

One component, mounted three times in place of today's Guest name `Input`. Everything below is its behaviour; the screens only say where it sits and what a pick fills in.

- **It is a text field first.** Its text is the guest name that gets submitted, exactly as today. Typing, tabbing past it, and submitting with no pick produce today's payloads (SC7).
- **Search key = the text.** From 2 characters, 300 ms after the last keystroke, it asks `GET /guests/search` with the typed text. The endpoint already matches name, email and phone, so "Pri", "priya@" and "555 010" all find Priya Shah.
- **Listbox** (ARIA combobox pattern, `aria-autocomplete="list"`): up to 6 rows, each two lines — name; then phone · email · visits (see § Copy for the exact format). Rows are ≥ 44 px on tablet. A 7th match becomes the status row "More matches — keep typing to narrow."
- **Pick** (tap, Enter on the highlighted row): the field shows the guest's name only; the surface's other guest fields prefill from the profile (rule per screen); the booking is now attached (`guestId`); the linked-guest strip appears directly under the field; focus stays in the field; one polite sentence is announced.
- **Strip** (`role="group"`, named by its title): title + **Clear**; segment badge (VIP / Repeat only), visits or "No visits on record yet", no-shows with the risk badge when > 0; dietary tags with allergies in error red and "Allergy:" prefixed; on the reservation dialog one caption about link-only. No notes, no contact links, no Add Note — that is the full card, which the sheet shows after the booking exists.
- **Clear**: reverts what the pick filled (unless edited since), drops the link, removes the strip, focus → the field. Wiping the field to empty does the same.
- **Edit after pick**: the link stays; the name (and email/phone) the Host types are the booking's own values — the profile is not touched (Q1). Suggestions reopen at 2+ characters; picking someone else replaces the link.
- **Never a gate**: no minimum interaction, no validation tied to it, and its failure changes nothing about submit.

## Flows

### Flow 1 — Host takes a phone booking for a regular (New Reservation dialog)

1. Host opens **New reservation** (Reservations page). Dialog opens on today's date, party 2, smallest fitting table; focus is in **Guest Name** as today.
2. "Name?" — Host types `Pri`. 300 ms later the listbox shows "Priya Shah — (555) 010-0100 · priya@example.com · 12 visits" and "Priyanka Rao — (555) 010-2222". Screen reader hears "2 results available".
3. Host taps Priya Shah. The field reads "Priya Shah"; Guest Email and Guest Phone fill from her profile; the strip appears: "Using Priya Shah's profile [Clear] · VIP · 12 visits · 1 no-show Risky · Allergy: shellfish · Vegetarian · Edits to email or phone below change this booking only." Announced: "Using Priya Shah's profile — 12 visits, 1 no-show. Allergy: shellfish." (Screen 2, picked)
4. Host sets time and party as today, taps **Create Reservation**. The reservation is created with `guestId`; the dialog closes; the page behaves as today (the sheet/sidebar for it now shows the full `GuestCard`, because a `guestId` exists).
5. **Ignore path** (Story 3): at step 2 the Host keeps typing "Priya Shah", tabs to Guest Phone, types her number, never picks. Nothing appears under the field beyond the hint. On submit the server links the exact phone match — no duplicate, no UI. Nothing in the dialog claims a link; the sheet after creation tells the truth.
6. **Wrong-guest path**: at step 3 the Host realises it is a different Priya. Taps **Clear**: field, email and phone revert to what they held before the pick; strip gone; announced "Guest cleared."; focus in the field. Host types on.
   > Amended 2026-09-15 (Review): the name field keeps "Priya Shah" with its text selected (one keystroke replaces it); only email and phone revert. Reverting the name to the pre-pick "Pri" would hand the Host a fragment to delete, and :45 ("focus → the field") plus § States "Cleared" ("text selected so the Host can retype at once") already assume a full name is there to select. `NewReservationDialog.test.tsx`, `WalkInDialog.test.tsx` and `WaitlistPage.test.tsx` pin this reading.

### Flow 2 — Host seats a walk-in regular (Seat walk-in dialog)

1. Party of two walks up. Host taps **Walk-in**. Dialog opens on party 2, smallest fitting table, focus on the pressed party-size control — exactly today (prior run Screen 3).
2. **No-lookup path** (Story 4, SC7): Host taps **Seat now**. Payload and outcome are today's. Or types "Smith" and taps Seat now — also today's. The lookup never asked for anything.
3. **Pick path**: Host taps Guest name, types `Sha` (or "555 010"). Listbox: "Priya Shah — (555) 010-0100 · 12 visits". Host taps it. Field reads "Priya Shah"; strip: "Using Priya Shah's profile [Clear] · VIP · 12 visits · 1 no-show Risky · Allergy: shellfish". Announced once. (Screen 3, picked)
4. Host taps **Seat now**. Walk-in created with `guestId`; dialog closes; the new block is selected and reads "Priya Shah · 2 · 8:04 PM · 12th visit"; `role=status` says "Seated Priya Shah, party of 2, at Table 3." (unchanged sentence); focus on the block. The sheet's tag row shows VIP and Allergy: shellfish — today's sheet, now with data. (Story 5, SC8)
5. **Failure path**: a 500 on Seat now behaves exactly as the prior run designed — dialog stays, "Walk-in not seated." alert, values kept, link kept, Seat now is the retry.

### Flow 3 — Host adds a regular to the waitlist (Waitlist page)

1. "Name and a number to text you?" — Host types `Pri` in **Guest Name** on the add card. Listbox as in Flow 1. Host taps Priya Shah.
2. Field reads "Priya Shah"; **Guest Phone** fills with (555) 010-0100; strip: "Recognised Priya Shah [Clear] · VIP · 12 visits · 1 no-show Risky · Allergy: shellfish". Announced via the page's status region: "Recognised Priya Shah — 12 visits, 1 no-show. Allergy: shellfish." (Screen 4)
3. Host taps party size, **Add to Waitlist**. The entry is created with name, phone, party size — today's payload (SC9). Form resets (strip included); "Added Priya Shah, party of 2, to the waitlist."; focus → Guest Name (the prior run's exception).
4. The entry's row and its later Seat handoff are today's; the seated block shows no visit label (Q3).

### Flow 4 — Keyboard / screen reader (a mode of Flows 1–3)

1. Tab reaches the Guest name field ("Guest Name, combobox, collapsed"). Typing 2+ characters expands it; "2 results available" is announced from the field's own polite region; nothing is highlighted yet.
2. ArrowDown highlights "Priya Shah, (555) 010-0100, priya@example.com, 12 visits" (the row's accessible name is both lines). Enter picks; the listbox collapses; focus stays in the field; the pick sentence is announced from a polite region **inside the dialog** (the dialogs are `aria-modal`; the page's `LiveStatus` is outside them). Tab moves to Guest Email, then to **Clear** inside the strip only when the strip is present.
3. Escape with the listbox open closes the listbox only; Escape again closes the dialog and returns focus to its opener as today. Tab with the listbox open closes it without picking and keeps the text.
4. On the waitlist page the same, with the pick sentence spoken from the page's existing `role=status` region.

### Flow 5 — Lookup unavailable (search 500 / network down), every surface

1. Host types `Pri`; the request fails. No listbox. Under the hint a caption reads "Can't look up guests right now — type the details as usual." Announced once, politely. Submit is unchanged; the form is today's form. (SC6)
2. Host keeps typing; each debounced request retries silently. If one succeeds the caption goes and the listbox opens. No Retry button — the lookup is optional and retry is typing.

### Online guest — no flow

The widget's screens do not change (Q2, Story 9). Recognition on the widget stays the existing email-blur greeting.

## Screens

### Screen 1 — The guest lookup field: closed → typing → results → picked → cleared

```
CLOSED (< 2 characters)                          TYPING (≥ 2, waiting ≤ 300 ms, then in flight)
Guest Name                                        Guest Name
[ P|                                        🔍 ]  [ Pri|                                      🔍 ]
Name, email or phone — returning guests           ┌──────────────────────────────────────────────┐
appear as you type.                               │ ◌ Looking up guests…                         │
                                                  └──────────────────────────────────────────────┘

RESULTS                                          NO MATCH
Guest Name                                        Guest Name
[ Pri|                                      🔍 ]  [ Priyx|                                    🔍 ]
┌──────────────────────────────────────────────┐  ┌──────────────────────────────────────────────┐
│ Priya Shah                                   │  │ No returning guest matches. Carry on as      │
│   (555) 010-0100 · priya@example.com · 12 visits │  │ usual.                                       │
│ Priyanka Rao                                 │  └──────────────────────────────────────────────┘
│   (555) 010-2222                             │   ← no visits shown at 0 (Q4)
│ …                                            │
│ More matches — keep typing to narrow.        │   ← only when a 7th match exists; not selectable
└──────────────────────────────────────────────┘

PICKED                                           LOOKUP FAILED
Guest Name                                        Guest Name
[ Priya Shah                                🔍 ]  [ Pri|                                      🔍 ]
┌ Using Priya Shah's profile ────────── [ Clear ] ┐ Name, email or phone — returning guests
│ [VIP]  12 visits · 1 no-show [Risky]            │ appear as you type.
│ [Allergy: shellfish] [Vegetarian]               │ Can't look up guests right now — type the
│ Edits to email or phone below change this       │ details as usual.
│ booking only — the profile isn't edited.        │
└─────────────────────────────────────────────────┘

PICKED, zero history (what every real guest looks like until Q4 is fixed)
┌ Using Jordan Lee's profile ─────────── [ Clear ] ┐
│ No visits on record yet                         │
└─────────────────────────────────────────────────┘
```

- **Purpose**: type a name as today; the one thing the Host may additionally do is tap the returning guest.
- **Closed**: a labelled text field with a search glyph and the static hint (`hint`, tied by `aria-describedby`). Below 2 characters nothing is requested and the listbox stays closed — including on focus.
- **Loading**: after the 300 ms pause, one status row "Looking up guests…" (polite region announces it). Typing again cancels the pending request; stale responses never open a list over newer text.
- **Results**: rows as drawn; first line the name (body), second line caption — phone, then email, then "N visits" (≥ 1 only); a profile with neither contact reads "no contact on file". Row height ≥ 44 px on tablet; the list scrolls after 6 rows, and a 7th match is the "keep typing" status row instead. Mouse hover and ArrowDown/Up highlight; Enter or tap picks; Home/End as the pattern.
- **No match** (≥ 2 characters, empty result): one status row, not selectable, announced once by the region: "No returning guest matches. Carry on as usual."
- **Error**: caption under the hint as drawn, `Text variant="caption" color="secondary"`, announced once per failure episode; no alert, no red, no button. The next keystroke retries. The caption clears on the first successful response or when the field is emptied.
- **Picked**: field text = name; strip as drawn; **Clear** (`Button variant="ghost"`, visible text "Clear", accessible name "Clear Priya Shah"; ≥ 44 px on tablet); polite announcement (§ Copy). The strip is `role="group"` with `aria-labelledby` its title, so a screen reader can find it again.
- **Zero history**: exactly the second strip — no badge, no counts, the one sentence. Never "0 visits", never "New".
- **Cleared**: strip gone; field and every prefilled field revert to pre-pick values unless edited since; announced "Guest cleared."; focus in the field with its text selected so the Host can retype at once.
  > Amended 2026-09-15 (Review): "every prefilled field" means the fields the pick filled — email and phone on the reservation dialog, phone on the waitlist. The name field keeps the picked name, selected; see Flow 1 step 6.
- **Reduced motion**: the listbox keeps rialto's gated entrance (no slide, no fade under `prefers-reduced-motion`); the strip has no motion at all.
- **Check**: Stories 1, 2; SC1, SC2, SC6; Q1 (caption), Q4 (zero state).

### Screen 2 — New Reservation dialog: default and picked

```
DEFAULT (unchanged apart from the lookup field)     PICKED
┌──────────── New Reservation ────────────────┐   ┌──────────── New Reservation ────────────────┐
│ Guest Name *                                │   │ Guest Name *                                │
│ [ e.g. Smith                            🔍 ]│   │ [ Priya Shah                            🔍 ]│
│ Name, email or phone — returning guests     │   │ ┌ Using Priya Shah's profile ──── [ Clear ]┐│
│ appear as you type.                         │   │ │ [VIP] 12 visits · 1 no-show [Risky]      ││
│ Guest Email            │ Guest Phone        │   │ │ [Allergy: shellfish] [Vegetarian]        ││
│ [ guest@example.com ]  │ [ (555) 123-4567 ] │   │ │ Edits to email or phone below change     ││
│ Date                   │ Start Time         │   │ │ this booking only — the profile isn't    ││
│ [ 2026-09-15 ]         │ [ --:-- ]          │   │ │ edited.                                  ││
│ Party Size                                  │   │ └──────────────────────────────────────────┘│
│ [1][2][3][4][5][6][7][8]                    │   │ Guest Email            │ Guest Phone        │
│ Table   [ Table 1 (seats 2)            ▾ ]  │   │ [ priya@example.com ]  │ [ (555) 010-0100 ] │
│                  [ Cancel ] [ Create Reservation ]│  │ Date … Party Size … Table … (as default)   │
└─────────────────────────────────────────────┘   │                  [ Cancel ] [ Create Reservation ]│
                                                  └─────────────────────────────────────────────┘
```

- **Purpose**: book a party; the one thing the Host does is tap Create Reservation. The lookup shortens the typing before it.
- **Order**: Guest Name (lookup) first, as today — the listbox opens downward over the contact row and must not be clipped by the dialog's own scroll container (surfaced).
- **Pick fills**: Guest Email ← profile email, Guest Phone ← profile phone (each only when the profile has one; a typed value survives a null). Both stay editable; edits are this booking's (Q1).
- **Validation unchanged**: name required; email or phone required; the pick usually satisfies the second. Validation copy and the existing error banner are untouched.
- **Submit with a pick**: today's payload plus `guestId`; the field values as they stand are the booking's `guestName/guestEmail/guestPhone` (SC1).
- **Submit without a pick**: today's payload; the server links an exact email (first) or phone match, or creates the profile (SC3–SC5). No UI claims either; the sheet after creation shows the truth.
- **Loading / error of the dialog's own submit**: unchanged from today.
- **Check**: Stories 1, 2, 3, 7; SC1–SC6.

### Screen 3 — Seat walk-in dialog: default (unchanged) and picked

```
DEFAULT — identical to today, hint aside            PICKED
┌──────────── Seat walk-in ────────────────┐       ┌──────────── Seat walk-in ────────────────┐
│ Party size                               │       │ Party size                               │
│ [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ] │       │ [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ] │
│ Table      [ Table 3 (seats 2)        ▾ ]│       │ Table      [ Table 3 (seats 2)        ▾ ]│
│ Guest name (optional)                    │       │ Guest name (optional)                    │
│ [ e.g. Smith                         🔍 ]│       │ [ Priya Shah                         🔍 ]│
│ Name or phone — returning guests appear  │       │ ┌ Using Priya Shah's profile ─ [ Clear ]┐│
│ as you type.                             │       │ │ [VIP] 12 visits · 1 no-show [Risky]   ││
│                                          │       │ │ [Allergy: shellfish]                  ││
│               [ Cancel ]  [ Seat now ]   │       │ └───────────────────────────────────────┘│
└──────────────────────────────────────────┘       │               [ Cancel ]  [ Seat now ]   │
                                                   └──────────────────────────────────────────┘
```

- **Purpose**: seat a walk-up in under five taps; the one thing the Host does is tap Seat now. Unchanged.
- **Default**: focus on the pressed party-size control, Party 2, smallest fit — the prior run's Screen 3 exactly. The lookup is the last field and asks nothing; the only visible difference at rest is the hint line. No-table caption, in-flight, failure and recovery are the prior run's, unchanged.
- **Listbox** opens downward over the actions row (the dialog does not scroll); rows ≥ 44 px.
- **Pick fills**: the name only (the walk-in has no other guest field). The strip omits the link-only caption. Seat now is never disabled by anything the lookup does.
- **Submit with a pick**: today's payload plus `guestId` (SC8). Without one: today's payload, byte for byte (SC7).
- **After seating (picked)**: dialog closes → the prior run's Screen 4: block selected, `role=status` "Seated Priya Shah, party of 2, at Table 3.", focus on the block. The block's detail line reads "2 · 8:04 PM · 12th visit" via the existing rule (`visitCount > 1`); the sheet's tag row shows VIP and the allergy tag via the existing `useGuest(guestId)`. Both are today's components receiving data for the first time from a walk-in.
- **Check**: Stories 4, 5; SC6, SC7, SC8.

### Screen 4 — Waitlist add card: recognised

```
┌ Add to waitlist ─────────────────────────────────────────────────────┐
│ Guest Name                              │ Guest Phone                 │
│ [ Priya Shah                        🔍 ]│ [ (555) 010-0100          ] │
│ Name or phone — returning guests        │                             │
│ appear as you type.                     │                             │
│ ┌ Recognised Priya Shah ───────────────────────────────── [ Clear ] ┐ │
│ │ [VIP] 12 visits · 1 no-show [Risky]   [Allergy: shellfish]        │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│ Party Size  [1][2][3][4][5][6][7][8]                                  │
│ [ Add to Waitlist ]                                                    │
└────────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: add a party without retyping a regular; the one thing the Host does is tap Add to Waitlist.
- **Default**: today's card; Guest Name is the lookup, Guest Phone stays a plain required `Input`.
- **Pick fills**: Guest Phone ← profile phone (when present; the Host still edits or types it when the profile has none — phone remains required and validated as today). Strip title is "Recognised …", not "Using … profile": nothing is linked (Q3), and the copy must not promise it.
- **Submit**: today's payload — `guestName`, `guestPhone`, `partySize` — and nothing else (SC9). Success resets the form, strip included; the existing announcement and focus return to Guest Name stand.
- **Error** (add fails): today's "Not added." banner; the pick and strip survive so the retry is the same tap.
- **Phone width**: the two-column field row stacks as the page already does at 375 px; the listbox spans the lookup field's width.
- **Check**: Story 6; SC6, SC9.

### Screen 5 — The widget (no screen)

Not designed. Server-side link on exact match, response byte-identical (Stories 8, 9; SC10–SC12). Any visible change here would be a defect.

## Decisions (UX-owned)

- **(a) The name field is the lookup.** One mechanism on three surfaces; the field the Host types first anyway; the walk-in gains nothing at rest but a hint line. Typing a phone or email there finds the guest too, so Story 1's "name, email or phone" holds without a second recognition path. What would change it: Hosts observed typing the phone into the Phone field and expecting a suggestion (Operate) — then a blur-recognition on that field, in the widget's style, is the addition.
- **(b) Link-only is shown, not asked.** One caption in the strip; prefilled fields editable in place. A confirm dialog was rejected: the Host is mid-call. What would change it: Q1 being decided as "update the profile" — then the caption inverts and the sentence needs a verb.
- **(c) Clear undoes the pick, not the form.** Prefilled values revert; typed-after-pick values stay; wiping the name is the same gesture. Chosen over "Clear drops the link and keeps the fields" because a leftover phone from the wrong guest would be exact-matched on submit — the silent mislink the idea says kills this.
- **(d) Honest zero.** "No visits on record yet" and no badge, because every real guest reads that way until recordVisit has a caller (Q4). Copy that says "New" or "0 visits" would be data that is not there.
- **(e) Lookup failure is a caption, not an error.** The Host's action is the booking; the lookup is a helper. A red alert with Retry for a helper would teach Hosts to distrust the form. SC6 holds by construction: the caption changes no control.
- **(f) Strip, not card.** The card's rules, the card's tags, none of the card's actions. The full `GuestCard` belongs to the sheet after the booking exists, where it already lives.

## Copy

### Field

| Surface         | Label (unchanged text)  | Hint                                                          | Placeholder  |
| --------------- | ----------------------- | ------------------------------------------------------------- | ------------ |
| New Reservation | "Guest Name" (required) | "Name, email or phone — returning guests appear as you type." | "e.g. Smith" |
| Seat walk-in    | "Guest name (optional)" | "Name or phone — returning guests appear as you type."        | "e.g. Smith" |
| Waitlist add    | "Guest Name" (required) | "Name or phone — returning guests appear as you type."        | "e.g. Smith" |

### Listbox rows and status rows

- Row line 1: `{name}`. Line 2 (caption): `{phone} · {email} · {N visit|visits}` — omit any part that is null or 0; both contacts null → "no contact on file". Accessible name of the row = line 1 + line 2.
- Loading: "Looking up guests…"
- No match: "No returning guest matches. Carry on as usual."
- Overflow (7th match): "More matches — keep typing to narrow."
- Failure caption (under the hint, outside the listbox): "Can't look up guests right now — type the details as usual."

### Strip

| Surface                       | Title                    | Caption line                                                                                           |
| ----------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| New Reservation, Seat walk-in | "Using {name}'s profile" | Reservation only: "Edits to email or phone below change this booking only — the profile isn't edited." |
| Waitlist add                  | "Recognised {name}"      | none                                                                                                   |

Body, in order: segment `Badge` (VIP → accent, Repeat → success; nothing for New) · "{N} visit|visits" or "No visits on record yet" · when noShowCount > 0: "{N} no-show|no-shows" + risk `Badge` (Trusted / Standard / Risky, variants as `GuestCard`) · dietary `Tag`s, allergy keywords → `variant="error"` prefixed "Allergy:", others default (the prior run's per-tag rule). Clear: visible "Clear", `aria-label="Clear {name}"`.

### Announcements (polite, once, from a region inside the dialog; the waitlist uses the page's region)

| Event                        | Sentence                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Pick (reservation, walk-in)  | "Using Priya Shah's profile — 12 visits, 1 no-show. Allergy: shellfish." / "Using Jordan Lee's profile — no visits on record yet." |
| Pick (waitlist)              | "Recognised Priya Shah — 12 visits, 1 no-show. Allergy: shellfish."                                                                |
| Clear                        | "Guest cleared."                                                                                                                   |
| Lookup failed                | "Can't look up guests right now — type the details as usual." (same as the caption; once per episode)                              |
| Results / loading / no match | the listbox's own region: "2 results available" / "Looking up guests…" / "No returning guest matches. Carry on as usual."          |

Existing sentences ("Seated Priya Shah, party of 2, at Table 3.", "Added Priya Shah, party of 2, to the waitlist.") are unchanged.

## Conventions to match

- Rialto only: the lookup is rialto `Combobox` or an app composition over rialto's exported `useCombobox` + `Input` (surfaced); strip from `Stack`, `Badge`, `Tag`, `Text`, `Button variant="ghost"`; no raw `<button>`/`<input>`.
- Tokens only; error red for allergy tags, never gold on a diet tag; segment badge variants as `guest-signals`; both themes.
- `guest-signals.ts` (`isAllergyTag`, `getSegmentLabel`, `getSegmentVariant`) and `GuestCard`'s risk label/variant rules are the single source for the strip; `ordinalVisit` for the block label — nothing is re-derived.
- Field labels keep their exact text (`/guest name/i`, `/guest email/i`, `/guest phone/i` are load-bearing in the unit and E2E specs); the walk-in dialog's accessible name "Seat walk-in" and button names "Seat now", "Create Reservation", "Add to Waitlist" are unchanged.
- Dialogs keep `role=dialog`, `aria-modal`, labelledby, focus trap, Escape-to-close, initial focus (party size on walk-in; first field on reservation); each dialog gains one polite region for the lookup's sentences. The waitlist page keeps its single `LiveStatus` region and speaks through `announce()`.
  > Amended 2026-09-15 (Review): one polite region of the dialog's own (pick, clear and the failure sentence go through `announce()`), plus the lookup's results region inside the field for "2 results available" / loading / no match (§ Announcements, last row) — two polite regions per dialog, each with one job. The waitlist page likewise keeps its single page region for the pick/clear/failure sentences and gains the lookup's results region inside the form.
- Prior-run rules carry: `describeApiError` voice, `ErrorRetryBanner` for the surfaces' own failures, `useFocusAfter` for focus moves, 44 px controls on a coarse pointer, reduced motion gates on every entrance.
- Search: `useGuestSearch({ venueId, query })` with the 300 ms debounce precedent; venue-scoped by the endpoint.

## Story reachability check

| Story                             | Reached by                                                              | Screen(s)         |
| --------------------------------- | ----------------------------------------------------------------------- | ----------------- |
| 1 — suggestions as I type         | Flow 1 step 2; Flow 2 step 3; Flow 3 step 1                             | 1, 2, 3, 4        |
| 2 — history before confirm        | Flow 1 step 3; Flow 2 step 3                                            | 1 (picked), 2, 3  |
| 3 — exact match with no pick      | Flow 1 step 5                                                           | 2 (no UI; server) |
| 4 — ignorable walk-in lookup      | Flow 2 step 2                                                           | 3 (default)       |
| 5 — linked walk-in block label    | Flow 2 step 4                                                           | 3 (after seating) |
| 6 — waitlist recognise + prefill  | Flow 3 steps 1–2                                                        | 4                 |
| 7 — Manager: bookings attach      | consequence of Flows 1–2; visible on the Guests page and sheet as today | — (no new UI)     |
| 8 — widget guest lands on profile | no UI surface (server-side, Q2)                                         | 5 (none)          |
| 9 — widget indistinguishable      | no UI surface (server-side, Q2)                                         | 5 (none)          |

Stories 1–6 are reachable through flows in this artifact; 7 has no surface of its own and is satisfied by existing screens; 8 and 9 have no UI by design.

## Deliberately not designed

- The public widget's UI and its recognition banner (Q2); anything on the Guests page or in `GuestCard` itself.
- Blur-recognition on the Email/Phone fields (decision a) — the server's exact-match link covers the no-pick path; revisit on Operate evidence.
- A "this will create a profile" notice for the no-pick, no-match reservation (SC4) — today's Guests page "Add Guest" is the same find-or-create, silently; a booking creating the profile is the CRM working.
- Staff notes, occasions, lifetime spend and contact links in the strip — the sheet's full card after creation.
- Seat-time linking from a recognised waitlist row (Q3) and a persisted `WaitlistEntry.guestId` (schema) — follow-up run.
- Making `visitCount` accrue (Q4) — separate defect run; only the zero state is designed here.
- Phone formatting/normalisation in rows and fields — shown as stored; parked for Architect by the PRD.
- Re-linking or changing the guest from `EditReservationDrawer`; the timeline sheet; desktop control sizing beyond the inherited 44 px tablet rule.
