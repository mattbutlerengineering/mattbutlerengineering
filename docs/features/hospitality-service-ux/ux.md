---
stage: ux-design
run: feature:hospitality-service-ux
date: 2026-09-03
assumptions:
  - 'Tablet detail panel becomes a bottom sheet (`Drawer side="bottom"`) at 768–1024 px, not an overlay on the right or a narrower sidebar — because A5''s ≥ 4-hour span needs ≥ 600 px of grid (120 px table column + 4 × 120 px hours) and the tablet grid is 702 px wide with no panel at all (P13 `clientWidth:702`), so no inline or right-overlay panel of any usable width can leave 4 unobscured hours; a sheet covers table rows, which scroll, and leaves every hour column visible. What would change it: the PRD lowering the threshold, or Architect shrinking `HOUR_WIDTH` on tablet (rejected here — rescaling the grid on selection is not calm).'
  - "Table status changes through a one-item menu of the valid next state, not an immediate change with an Undo toast — because `TABLE_VALID_TRANSITIONS` is a one-way cycle (AVAILABLE→OCCUPIED→DIRTY→READY→AVAILABLE) and the PATCH an Undo would send is an invalid transition; an Undo that cannot undo is a lie. What would change it: the reservations API accepting reverse transitions (Architect/backlog)."
  - 'The word "Seated" is a UI-derived mark shown only when the party is CONFIRMED, its table is OCCUPIED, and now falls inside the party''s window (start − 15 min … end); everywhere else the stored status word is shown, and the phone chip "Seated" is renamed "Confirmed" — because table-OCCUPIED alone would mark the next party on a turned table as seated, and the API has no SEATED status. What would change it: a persisted seated state in `ReservationStatus`.'
  - "Seat Guest is offered for PENDING as well as CONFIRMED parties (hidden once the table is OCCUPIED) — because a pending party at the door is seated the same way and the action already confirms. What would change it: product deciding pending parties must be confirmed by phone first."
  - 'No success toasts on Timeline mutations; the result is the changed block, the sidebar status line, and the `role=status` sentence. The one toast in this run is the Waitlist seat handoff ("View on Timeline"), because that result leaves the screen the Host is on. What would change it: n > 0 Hosts missing confirmations (today n = 0 user reports).'
  - "The Briefing card shows the segment badge (VIP / Repeat / New by `GuestCard`'s rule), occasion, and dietary tags split allergy-vs-diet; other free-text `guest.tags` stay off the card — because the briefing is scanned in seconds and `vip` already folds into the badge. What would change it: a venue asking for a specific tag (e.g. press) on the briefing."
  - "Every promoted Walk-in control (⌘K, Dashboard, Timeline) opens the dialog on today's grid regardless of the date the Host was viewing — because a walk-in is happening now. What would change it: nothing plausible."
  - 'Time reads "5:30 PM" (shared `formatTime`) on every surface this run touches; whether "local" means venue or browser stays parked for Architect, and no copy here names a timezone.'
  - "Waitlist add returns focus to the Guest name field, not the submit button (a deliberate exception to the opener rule) — because the Host adding one walk-up is usually adding the next; the announcement still confirms the add. What would change it: Hosts reporting the jump as disorienting."
  - 'Every control this run touches is ≥ 44×44 px on a coarse pointer at 1024×768 — `size="sm"` is retired on those controls; desktop keeps current sizes unless the same component serves both.'
surfaced:
  - 'Proposed rialto addition (Architect decides, changeset needed): `Drawer` bottom sheet at a compact height (≈ 240 px collapsed) — confirm `size="default"` on `side="bottom"` fits, else add `size="compact"`.'
  - 'Proposed rialto addition: `Stat` needs an accessible value for "—" (e.g. `valueLabel="unavailable"`); today `aria-label` is the label only and the dash reads as a dash.'
  - "First hospitality use of `Toast.action` (shipped rialto #4808, zero consumers) — Waitlist seat handoff; Architect should confirm the `ToastProvider` is mounted in the dashboard shell."
  - "The table-status menu trigger must expose the current state in its name and reach 44×44 inside a 60 px row — an app-level `TableStatusMenu` composition over `DropdownMenu` + `Tag`, not a rialto change."
---

# UX: Hospitality service — an honest tablet at the door

Primary actor: the Host, tablet 1024×768 landscape, finger. Secondary: the Manager on Reservations. Keyboard-only and screen-reader Hosts are a mode of every screen, not a separate one. Evidence label throughout: audit-measured, n = 0 user reports.

## Flows

### Flow 1 — Host, Tonight's Service → Timeline → walk-in → failure → recovery → seating → table status

1. Host opens **Tonight's Service** (Briefing) at 19:55. Breadcrumb reads "Tonight's Service". Segments read All · Early · Dinner · Late, bucketed on local hour; the 21:00 party sits under Late. Cards show 5:30 PM-style times, the VIP badge, and allergy tags in error red. (S2, S11)
2. Host taps **Timeline** in the nav at 20:00. Grid opens scrolled so the gold now-line sits one-quarter in from the left edge (7 PM visible, 11 PM reachable). Stats read real numbers; nothing said "0" while loading. (S1, S10)
3. A party of two walks up. Host taps **Walk-in** (≥ 44 px, top right). Dialog opens on Party size = 2, Table = smallest fit. Host taps **Seat now**. (S7)
4. The POST fails (500). The dialog stays open; the button returns from "Seating…" to "Seat now"; an alert inside the dialog reads "Walk-in not seated." + "The reservations service hit a snag — nothing was changed. Try again in a moment." + "Show details ▸". Behind the dialog the grid is untouched. (S3, S14)
5. Host taps **Seat now** again (that is the retry). It succeeds. Dialog closes; the new block is selected, scrolled into view above the bottom sheet; the sheet names the table; `role=status` says "Seated Smith, party of 2, at Table 3." Focus is on the new block. (S5, S6, S12)
6. A booked party (Priya Shah, 8:00 PM, Table 4, Confirmed) arrives. Host taps her block → sheet. **Seat Guest** is present (table Available). Host taps it. Status line becomes "Seated · Table 4"; Seat Guest disappears; focus lands on her block, whose name now ends "seated"; `role=status` says "Seated Priya Shah at Table 4." (S4, S12)
7. Table 3 is vacated. Host taps its status tag in the row header — accessible name "Table 3: Occupied. Change status" — a one-item menu opens: **Mark dirty**. Host taps it; tag reads Dirty; `role=status` says "Table 3 is now dirty." Focus returns to the tag. (S9, S12)
8. A wrong tap on Table 5's tag: the menu opens, Host taps outside (or Escape). Nothing changed. (S9)

### Flow 2 — Manager, Reservations list hits a 500

1. Manager opens **Reservations** for today. KPIs show "—" and rows show skeletons while loading.
2. The fetch fails. A banner reads "Couldn't load reservations." + "The reservations service hit a snag — try again in a moment." with **Retry** and "Show details ▸" (raw request line, collapsed). KPIs stay "—" (screen reader: "Total, unavailable"), never 0. **New reservation** stays enabled. (S13, S14)
3. Manager taps **Retry**. Skeletons return; on success the rows and KPIs fill and `role=status` says "Reservations for Tuesday, Sep 3 loaded." Focus stays on Retry until the banner unmounts, then moves to the page heading.

### Flow 3 — Host by keyboard / screen reader (a mode of Flows 1–2)

1. Tab reaches **Walk-in**; Enter opens the dialog; focus lands on Party size; Escape closes and returns focus to Walk-in.
2. After a successful walk-in, focus lands on the new block ("Smith, party of 2, 8:02 PM, confirmed, seated"); Arrow keys move along the row as today.
3. Every mutation result is one `role=status` sentence (table below); every failure is one `role=alert` title + detail sentence. Focus never lands on `body`.

### Flow 4 — Empty night and slow night

1. Host opens Timeline on a night with tables but no bookings: the grid still shows its table rows (walk-ins need them); over the hour area a flat EmptyState reads "Quiet so far." with a **Walk-in** action. (S8)
2. On a slow connection the grid area shows five skeleton rows and the stats read "—" until data lands; one `role=status` "Loading tonight's grid…" fires, not one per row. (S10)

### Flow 5 — Every "Walk-in" control

1. ⌘K → type "walk" → first result is **Walk-in guest** → Enter → Timeline on today with the dialog open. (S7)
2. Dashboard **Walk-in** → same destination, dialog open. (S7)
3. Timeline **Walk-in** → dialog. (S7)

## Screens

### Screen 1 — Tonight's Service (Briefing), tablet

```
Dashboard › Tonight's Service
┌──────────────────────────────────────────────────────────────────────┐
│ Tonight's Service                       [ 2026-09-03 ▾ ]              │
│ Service briefing for your team                                       │
│ [ All ] [ Early · before 6 PM ] [ Dinner · 6–8 PM ] [ Late · after 8 PM ]│
│                                                                      │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ 8:00 PM   [4 covers] [Table 4] [Anniversary]                     │ │
│ │ Priya Shah   [VIP]   12th visit                                  │ │
│ │ Prefers: corner booth                                            │ │
│ │ [Allergy: shellfish]  [Vegetarian]                               │ │
│ │ Staff: "Ask about the champagne."                                │ │
│ └──────────────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ 9:00 PM   [2 covers] [Table 2]                                   │ │
│ │ Jordan Lee   [New]                                               │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: the pre-service read; the one thing the Host does is scan tonight's parties by segment.
- **Segments**: `SegmentedControl` (≥ 44 px on tablet), labels as drawn; bucketing uses local hour (Early < 18:00, Dinner 18:00–20:59, Late ≥ 21:00). The "Dinner (6–8 PM)" wording stays because it matches the door's vocabulary.
- **Card**: time via shared `formatTime` ("8:00 PM", no leading zero); segment `Badge` accent/success/neutral by `GuestCard`'s rule (`vip` tag or ≥ 10 visits → VIP; ≥ 2 → Repeat; else New); occasion `Badge`; dietary `Tag`s evaluated **per tag** — allergy keywords (`allergy`, `nut`, `shellfish`, `dairy`, shared with `GuestCard`'s `ALLERGY_KEYWORDS`) → `variant="error"` prefixed "Allergy:", everything else → `variant="default"`. Gold is not used on a diet tag.
- **Empty (whole day)**: `EmptyState variant="flat"` — "Nothing on the book for Tuesday, Sep 3." · description "Change the date, or seat walk-ins from the Timeline." · action **Open Timeline** (secondary). **Empty (one segment)**: `EmptyState size="sm" variant="flat"` — "No late seatings tonight." (Early/Dinner variants: "No early seatings tonight." / "No dinner seatings tonight.").
- **Loading**: three `Skeleton variant="card" height={120}` (as today) inside an `aria-busy` region; one `role=status` "Loading tonight's briefing…".
- **Error (recoverable)**: `Alert variant="error"` title "Couldn't load tonight's briefing." + taxonomy detail + **Retry** (secondary, ≥ 44 px) + "Show details ▸". Segments stay operable.
- **Success**: cards render; no announcement.
- **Check**: S2 (local-hour buckets), S11 (VIP badge, allergy colour, time, breadcrumb "Tonight's Service"); lens ANTICIPATE (allergy first, red), TONE, TIME (5:30 PM), INCLUSIVE (segment control is a real control; tags have text, not colour alone).

### Screen 2 — Timeline at 20:00, tablet, nothing selected

```
Dashboard › Timeline
┌──────────────────────────────────────────────────────────────────────┐
│ Timeline                    [ ‹ ]  Tue, Sep 3  [ › ]   [Today]  [ Walk-in ] │
│ ● Live   Reservations: 12   Covers: 38   9 confirmed   3 pending     │
│ ┌──────────┬─────────┬─────────┬─────────┬─────────┬─────────────────┐ │
│ │ Tables   │  7 PM   │  8 PM   │  9 PM   │  10 PM  │  11 PM          │ │
│ ├──────────┼─────────┼────┃────┼─────────┼─────────┼─────────────────┤ │
│ │ Table 1  │ [Ng · 2]│    ┃    │ [Osei · 4          ]                │ │
│ │ 2–4 · [Available ▾] │  ┃    │                                     │ │
│ ├──────────┼─────────┼────┃────┼─────────┼─────────┼─────────────────┤ │
│ │ Table 3  │         │    ┃    │                                     │ │
│ │ 2–2 · [Available ▾] │  ┃    │                                     │ │
│ ├──────────┼─────────┼────┃────┼─────────┼─────────┼─────────────────┤ │
│ │ Table 4  │         │ [● Shah · 4      ]│                           │ │
│ │ 4–6 · [Occupied ▾]  │  ┃    │                                     │ │
│ └──────────┴─────────┴────┃────┴─────────┴─────────┴─────────────────┘ │
│                          8:04 PM (gold now-line)                     │
└──────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: the working surface; the one thing the Host does is find now and the next party.
- **Now-line**: present at any local hour in 11:00–23:00; gold (`--rialto-accent`, the in-flight/active use), 2 px, dot on top, header label "8:04 PM". On mount and on **Today** the grid scrolls so the now-line sits at 25 % of the visible width (one hour of past, ≈ 3.8 hours of future on tablet). Reduced motion: the scroll is instant.
- **Header controls** on tablet: day arrows `IconButton` ≥ 44×44 with names "Previous day" / "Next day"; **Today** secondary; **Walk-in** primary; all ≥ 44 px tall. Labels unchanged.
- **Stats**: "Reservations: 12 · Covers: 38 · 9 confirmed · 3 pending"; while loading each number is "—"; never 0 before data.
- **Block**: name · party · time; a seated party (rule in Decision a) shows a `StatusLED` success glyph before the name and its accessible name ends "…confirmed, seated". Selected block uses the gold focus ring.
- **Row header**: table name, capacity "2–4", and the status control (Screen 6).
- **Empty / Loading / Error**: Screen 7.
- **Success**: n/a (read surface).
- **Check**: S1 (now-line at 20:00), S5 (opens on now), S10 (no zeros before data); lens TIME, CALM (one gold line, no decorative gold), INCLUSIVE (grid/rows/blocks keep today's roles and labels).

### Screen 3 — Walk-in dialog: default → in-flight → failed → recovered

```
┌──────────────── Seat walk-in ────────────────┐
│ Party size                                   │
│ [ 1 ][ 2 ][ 3 ][ 4 ][ 5 ][ 6 ][ 7 ][ 8 ]     │  ← ≥ 44 px each, 2 pressed
│ Table          [ Table 3 (seats 2)      ▾ ]  │
│ Guest name (optional)  [ e.g. Smith        ] │
│                                              │
│ ┌ ⚠ Walk-in not seated. ─────────────────┐   │  ← only after a failure
│ │ The reservations service hit a snag —   │   │
│ │ nothing was changed. Try again in a     │   │
│ │ moment.                 Show details ▸  │   │
│ └─────────────────────────────────────────┘   │
│                      [ Cancel ]  [ Seat now ] │
└──────────────────────────────────────────────┘
```

- **Purpose**: seat a walk-up in under five taps; the one thing the Host does is tap **Seat now**.
- **Default**: opens with Party size 2 and the smallest fitting table preselected (already good); focus on the pressed party-size control. Title "Seat walk-in"; primary "Seat now" (was "Seat Now"); the party-size row is a `SegmentedControl` sized ≥ 44 px or eight `Button size="md"` with `aria-pressed` — Architect picks; the constraint is the target size.
- **No table fits**: `Text variant="caption"` under Table: "Nothing free for a party of 6 right now. Try a smaller party, or mark a table Available." Seat now disabled with that sentence as its description (not a bare disabled button).
- **In-flight**: Seat now `isLoading` with "Seating…"; fields disabled; the grid behind is untouched.
- **Error (recoverable)**: dialog stays open; button returns to "Seat now"; `Alert variant="error"` (role=alert) appears above the actions with a surface title (table in Copy) + taxonomy detail + "Show details ▸" (`Collapsible` revealing `err.message`, e.g. `POST /api/v1/reservations/walk-in failed: 500 Internal Server Error`, in `Text variant="caption"`). Field values are kept. Focus stays on Seat now (tap again = retry). For 409/422 the detail is the server's `problemDetails.detail` and focus moves to the Table control.
- **Success**: dialog closes → Screen 4.
- **Check**: S3 (grid stands, plain words, retry), S7 (opens from every Walk-in control), S14 (sentence, raw line demoted); lens NO-DEAD-END (retry is the same button), RECOVER (values kept), TONE, INCLUSIVE (44 px, focus stays put, alert announced once).

### Screen 4 — After a walk-in: block selected + tablet bottom sheet

```
┌──────────────────────────────────────────────────────────────────────┐
│ Timeline                    [ ‹ ]  Tue, Sep 3  [ › ]   [Today]  [ Walk-in ] │
│ ● Live   Reservations: 13   Covers: 40   10 confirmed   3 pending    │
│ ┌──────────┬─────────┬─────────┬─────────┬─────────┬─────────────────┐ │
│ │ Tables   │  7 PM   │  8 PM   │  9 PM   │  10 PM  │  11 PM          │ │
│ │ Table 1  │ [Ng · 2]│    ┃    │ [Osei · 4          ]                │ │
│ │ Table 3  │         │  ┏━━━━━━━━━━━┓                                │ │  ← selected, gold ring
│ │          │         │  ┃● Smith · 2┃                                │ │
│ │ Table 4  │         │ [● Shah · 4      ]│                           │ │
│ ├──────────┴─────────┴─────────┴─────────┴─────────┴─────────────────┤ │
│ │ Smith · party of 2 · 8:04 PM · Table 3 · Seated              [ ✕ ] │ │  ← Drawer side=bottom
│ │ [VIP] [Allergy: nuts]                                              │ │
│ │ [ Edit reservation ]  [ Cancel reservation ]        [ More ▾ ]     │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: confirm what just happened and where; the one thing the Host does is read the table name (then let go).
- **Selection**: the created reservation is selected; its block is scrolled into view (block-scoped, with scroll padding equal to the sheet height so it never lands under the sheet); the now-line stays visible.
- **Sheet (768–1024 px)**: `Drawer side="bottom"`, collapsed height ≈ 240 px: title row (name · party · time · table · status), tag row (segment badge, allergy tags — same rule as the Briefing), action row (each ≥ 44 px): **Seat Guest** (secondary, when eligible), **Edit reservation** (primary), **Cancel reservation** (ghost), **More ▾** expands to the `GuestCard`, email, phone, notes (sheet grows to half height; grid rows scroll under it). With the sheet open the grid keeps 702 px width → ≥ 4.8 visible hours, and ≥ 5 table rows remain visible above it.
- **Sidebar (≥ 1025 px)**: today's inline `Card variant="elevated"` sidebar, content unchanged except the Status line and Seat Guest rule (Screen 5).
- **Phone (< 768 px)**: today's right `Drawer`, unchanged.
- **Announcement**: `role=status` "Seated Smith, party of 2, at Table 3." (no name: "Seated a walk-in, party of 2, at Table 3."). Focus → the new block.
- **Empty/Loading/Error**: sheet content comes from the reservation already in memory — no loading state; the `GuestCard` under More has its own skeleton/alert (already good).
- **Check**: S5 (selected, in view, table named), S6 (≥ 4 hours with the panel open), S12 (announce + focus); lens ANTICIPATE (the table name is the first thing said), RECOGNIZE, CALM (no toast), INCLUSIVE.

### Screen 5 — Seat Guest gating and the "Seated" mark (sidebar/sheet detail)

```
Reservation details                          Reservation details
Priya Shah · party of 4 · 8:00 PM · Table 4   Priya Shah · party of 4 · 8:00 PM · Table 4
Status   Confirmed                            Status   Seated
[ Seat Guest ] [ Edit reservation ]           [ Edit reservation ]
[ Cancel reservation ]                        [ Cancel reservation ]

          (table OCCUPIED by an earlier party, now 7:20 PM)
Status   Confirmed · Table 4 is still occupied — turn it or move the party.
[ Edit reservation ] [ Cancel reservation ]
```

- **Purpose**: say what is true about this party; the one thing the Host does is tap Seat Guest exactly once.
- **Seat Guest visible** when status ∈ {Pending, Confirmed} and the party's table is not OCCUPIED. **Hidden** once the table is OCCUPIED. If the table is OCCUPIED but this party is not the one seated (Decision a), the status line adds the caption above so the Host is not left wondering where the button went.
- **Status word**: "Seated" only under Decision a; otherwise `STATUS_LABEL` (Pending / Confirmed / Cancelled / Completed / No-show).
- **In-flight**: Seat Guest `isLoading` "Seating…"; other actions disabled.
- **Error**: `Alert variant="error"` directly above the action row (inside the sidebar/sheet): "Guest not seated." + detail + Show details; Seat Guest returns to rest; focus stays on it.
- **Success**: Seat Guest unmounts; status reads "Seated"; `role=status` "Seated Priya Shah at Table 4."; focus → her block (opener gone → block rule).
- **Check**: S4 (Seat Guest gone once occupied, and no false "Seated"), S12; lens RECOGNIZE (the word matches the floor), NO-DEAD-END (caption explains the missing button), TONE.

### Screen 6 — Table status control (row header)

```
│ Table 3                     │       │ Table 3                     │
│ 2–2 guests   [ Occupied ▾ ] │  tap  │ 2–2 guests   [ Occupied ▾ ] │
│                             │  ──▶  │              ┌─────────────┐│
│                             │       │              │ Mark dirty  ││
│                             │       │              └─────────────┘│
```

- **Purpose**: turn a table honestly; the one thing the Host does is pick the next state.
- **Trigger**: `DropdownMenu` whose trigger wraps the existing `Tag` (colour by status) plus a chevron; hit area ≥ 44×44 within the 60 px row; accessible name "Table 3: Occupied. Change status". Colour still carries meaning but the text carries it first.
- **Menu**: exactly the valid next state(s) from `TABLE_VALID_TRANSITIONS`, worded as verbs: "Mark occupied" / "Mark dirty" / "Mark ready" / "Mark available". Outside tap or Escape closes with no change (this is the undo — before, not after).
- **In-flight**: the tag shows the pending state with the gold in-flight treatment on the trigger; the menu is closed.
- **Error**: banner above the grid (Screen 7 error style) "Table status not changed." + detail + **Retry** (re-sends the same transition) + Show details; the tag reverts to the real state; focus → the trigger.
- **Success**: tag text changes; `role=status` "Table 3 is now dirty."; focus → the trigger.
- **Check**: S9 (labelled, says what a tap will do, reversible before commit; Undo-after rejected in Decision b); lens CALM (no surprise change), INCLUSIVE (name states current state + action; 44 px), RECOVER.

### Screen 7 — Timeline: empty night, loading, load failure

```
EMPTY NIGHT (today, tables present, 0 reservations)
│ ● Live   Reservations: 0   Covers: 0   0 confirmed   0 pending          │
│ ┌──────────┬───────────────────────────────────────────────────────────┐ │
│ │ Tables   │  7 PM   │  8 PM ┃ 9 PM   │  10 PM  │  11 PM               │ │
│ │ Table 1  │          ┌──────────────────────────────┐                  │ │
│ │ Table 3  │          │  Quiet so far.               │                  │ │
│ │ Table 4  │          │  Nothing on the book for     │                  │ │
│ │          │          │  tonight. Walk-ins go        │                  │ │
│ │          │          │  straight to a table.        │                  │ │
│ │          │          │          [ Walk-in ]         │                  │ │
│ │          │          └──────────────────────────────┘                  │ │

LOADING
│ ● Live   Reservations: —   Covers: —   — confirmed   — pending           │
│ ┌──────────┬───────────────────────────────────────────────────────────┐ │
│ │ ░░░░░░   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │  × 5 rows
│ │ ░░░░░░   │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │ │

LOAD FAILURE (reservations failed, tables loaded)
│ ┌ ⚠ Couldn't load tonight's reservations. ──────────────────────────┐   │
│ │ The reservations service hit a snag — try again in a moment.       │   │
│ │ [ Retry ]                                       Show details ▸  [✕]│   │
│ └────────────────────────────────────────────────────────────────────┘   │
│ ┌──────────┬───────────────────────────────────────────────────────────┐ │
│ │ Table 1  │ (rows stand, empty)                                       │ │
```

- **Empty night (today)**: table rows still render — they are the walk-in surface and their status controls stay reachable. Over the hour area, `EmptyState variant="flat"` heading "Quiet so far." description "Nothing on the book for tonight. Walk-ins go straight to a table." action **Walk-in** (primary; opens Screen 3). **Other date**: heading "Nothing on the book for Wednesday, Sep 4." description "Bookings for that night will show here." action **Back to today** (secondary). **No tables at all**: heading "No tables yet." description "Set up a floor plan and the grid fills in." action **Floor plans**.
- **Loading**: stats "—"; header row skeleton + five `Skeleton variant="rect" height={60}` rows inside `aria-busy`; one `role=status` "Loading tonight's grid…". The stats never show 0 before data (P11).
- **Load failure, tables present**: `Alert variant="error"` between stats and grid, title "Couldn't load tonight's reservations." + taxonomy detail + **Retry** (secondary, ≥ 44) + "Show details ▸" (`Collapsible`, raw line in `Text variant="caption"`) + dismiss. Rows stand; Walk-in stays enabled. **Load failure, nothing loaded**: the grid area shows `EmptyState variant="flat"` heading "Couldn't load tonight." description = taxonomy detail, action **Retry**; header controls stay; Walk-in is disabled with caption "Walk-ins need the tables loaded — Retry above." Stats "—".
- **Mutation failures never unmount the grid** (the `isLoading ? … : fetchError ? … : error ? … : grid` ternary is the defect; design intent: load state and mutation state are different things and only the first may replace the grid).
- **Success after Retry**: skeletons → grid; `role=status` "Tonight's grid loaded — 12 reservations."; focus → the page heading (Retry unmounted).
- **Check**: S3 (grid stands), S8 (empty night speaks, offers next action), S10 (loads like the Briefing, no zeros), S13/S14 (banner + Retry + sentence); lens NO-DEAD-END, RECOVER, CALM (one skeleton set, one announcement), TONE ("Quiet so far.").

### Screen 8 — Reservations (Manager), 500 → Retry

```
Dashboard › Reservations
┌──────────────────────────────────────────────────────────────────────┐
│ Reservations                    [ 2026-09-03 ▾ ]   [ New reservation ]│
│  Total     Confirmed   Pending    Cancelled                          │
│   —          —           —          —                                │
│ ┌ ⚠ Couldn't load reservations. ─────────────────────────────────┐   │
│ │ The reservations service hit a snag — try again in a moment.    │   │
│ │ [ Retry ]                                       Show details ▸  │   │
│ └─────────────────────────────────────────────────────────────────┘   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- **Purpose**: let the Manager recover without leaving; the one thing they do is tap **Retry**.
- **Error**: `ErrorRetryBanner` (the same composition the other nine pages use), now carrying title + detail + "Show details ▸" for the raw request line. KPIs are `Stat`s with value "—" and an accessible value "unavailable" (surfaced above). The table region renders nothing (not an empty-state, not zeros). **New reservation** stays enabled.
- **Loading**: KPIs "—"; five `Skeleton variant="text"` rows in the table region; one `role=status` "Loading reservations…".
- **Empty**: `EmptyState variant="flat"` heading "Nothing on the book for Tuesday, Sep 3." description "New bookings show here as they land." action **New reservation**; KPIs read 0 (real zeros, data loaded).
- **Success after Retry**: rows + KPIs fill; `role=status` "Reservations for Tuesday, Sep 3 loaded."; focus → the page heading.
- **Dashboard `ReservationList`**: status column uses `STATUS_LABEL` ("Confirmed"), never the raw enum (`CONFIRMED`).
- **Check**: S13 (banner + Retry + KPI "—"), S14 (sentence first, raw line demoted); lens RECOVER, TONE, INCLUSIVE (dash has a spoken meaning).

### Screen 9 — Waitlist (announcements and handoff only)

- Layout unchanged (54 px buttons already good). Additions: one `role=status` region for the page; **Add** success → "Added Jordan Lee, party of 3, to the waitlist.", form resets, focus → Guest name. **Seat** success → row leaves the list; `role=status` "Seated Jordan Lee at Table 2."; a `Toast variant="success"` "Seated Jordan Lee at Table 2." with action **View on Timeline** (opens today's Timeline with that party selected — Screen 4); focus → the next entry's card, or the "No one waiting" heading when the list is empty. **Notify** → "Notified Jordan Lee." **Cancel** → "Removed Jordan Lee from the waitlist."
- **Error** (any action): `Alert variant="error"` inside the row card: surface title + taxonomy detail + Show details; the split-failure case keeps its existing sentence ("Reservation created but the waitlist entry could not be marked seated — refresh and update it manually.") reworded: "Seated at Table 2, but the waitlist didn't update. Refresh to tidy up."
- **Check**: S12 (announce + focus), S14; lens ANTICIPATE (handoff to the block just created), INCLUSIVE.

### Screen 10 — Command palette and Dashboard Walk-in

- **⌘K**: item label "Walk-in guest" (group Actions). Ranking rule for a non-empty query: items whose label **starts with** the query rank above substring/initial matches, and Actions rank above navigation on a tie — so "walk" and "w" put Walk-in guest first. Enter → `/timeline?walkin=true` → Timeline on today, dialog open once tables are loaded; focus in the dialog; Escape returns focus to the Walk-in button.
- **Dashboard** quick action renamed **Walk-in** (was "New Walk-In"), same destination.
- **Check**: S7 (every Walk-in control opens the dialog; ranking); lens RECOGNIZE (one word for one act), ANTICIPATE.

### Screen 11 — Other viewports (one line each)

- **Desktop 1440×900**: inline sidebar (320 px) as today; grid ≈ 1000 px → ≈ 7 visible hours; all states identical; header controls may keep `size="sm"` (fine pointer) but the same components are used so 44 px on tablet is a media-query decision for Architect.
- **Phone 390×844** (`TimelineMobileView`): chips read All · **Confirmed** (was "Seated") · Upcoming · Cancelled; each card shows a `StatusLED` "Seated" mark only under Decision a; detail stays in the right `Drawer`; empty card copy becomes "Quiet so far." / "Nothing on the book for tonight."

## Decisions (the seven UX-owned questions)

- **(a) "Seated" representation and honesty rule.** UI-derived, never persisted: `isSeated = status === CONFIRMED && table.status === OCCUPIED && now ∈ [startTime − 15 min, endTime]`. The word "Seated" appears only then (sidebar/sheet status line, block accessible name, phone card mark, StatusLED glyph). Table-OCCUPIED alone was rejected because a turned table marks the _next_ party seated (grid rows hold several blocks per table). The phone chip "Seated" (which lists CONFIRMED ∪ COMPLETED, P12) is renamed **Confirmed** — the label becomes true of its filter instead of the filter being bent to the label.
- **(b) Table status: menu of valid next states.** One-item `DropdownMenu` ("Mark dirty") over the labelled tag, not immediate change + Undo toast. Reason: transitions are one-way, so Undo would send an invalid PATCH — the toast would promise what the API refuses. The menu is the undo: it happens before the change. Revisit if reverse transitions ship.
- **(c) Tablet keyhole: bottom sheet.** `Drawer side="bottom"` at 768–1024 px, ≈ 240 px collapsed with a **More ▾** expander. Right overlay rejected (covers 320 px of hours → same 2-hour keyhole with a wider bounding box — gaming the measure); narrower/collapsible sidebar rejected (4 hours need 600 px of grid; only 702 px exists, leaving ≤ 102 px for any inline panel). Result: 4.8 visible hours and ≥ 5 rows with a party selected.
- **(d) Focus after each mutation + `role=status` sentence.** Rule: focus returns to the **opener if it still exists**; if the opener unmounted, focus goes to the **block/row that changed**; if that is gone too, the **list heading**. Waitlist add is the one deliberate exception (Guest name field). Sentences are in the Copy table below; each fires exactly once, in one region per page.
- **(e) Error taxonomy → copy.** Category → one detail sentence + retryable flag (table below); the surface supplies the title (what did not happen); the raw `err.message` request line lives behind "Show details ▸" (`Collapsible`), demoted, never lost. `problemDetails.detail` is used verbatim for 409/422 because the server knows what was wrong with the form.
- **(f) Empty, loading, unknown.** Timeline empty night keeps the rows and speaks ("Quiet so far." + Walk-in); loading is five skeleton rows + "—" stats + one announcement; unknown values (a table missing from the tables list, a stat before data) render "—" with a spoken "unavailable" / "table unknown"; Reservations KPIs use the same "—".
- **(g) Briefing.** Show the segment badge (VIP / Repeat / New, `GuestCard` rule), occasion badge, and dietary tags with a **per-tag** allergy test → `error`, else `default` (no gold); other `guest.tags` hidden. Time via shared `formatTime` ("5:30 PM"). Breadcrumb "Tonight's Service" (route label). Segment labels keep their hour hints.

## Copy

### Error detail by `ApiClientError.category` (plus two non-HTTP cases)

| Category                           | Detail sentence (house voice)                                                                              | Retry?       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------ |
| network (fetch threw, no response) | "Can't reach the reservations service. Check the venue's connection, then try again."                      | yes          |
| timeout (aborted)                  | "That took too long. The service didn't answer in time — try again."                                       | yes          |
| `serverError` (5xx)                | "The reservations service hit a snag — nothing was changed. Try again in a moment."                        | yes          |
| `rateLimited` (429)                | "Too many requests at once. Give it a few seconds, then try again."                                        | yes          |
| `conflict` (409)                   | `problemDetails.detail`, else "Someone got there first — that table or time was just taken. Pick another." | no (edit)    |
| `validationError` / `badRequest`   | `problemDetails.detail`, else "Something in the form didn't pass. Check party size, time and table."       | no (edit)    |
| `unauthorized` (401)               | "Your session ended. Sign in again to keep working."                                                       | no (Sign in) |
| `forbidden` (403)                  | "That's above your role. Ask a manager to make this change."                                               | no           |
| `notFound` (404)                   | "That reservation's gone — it may have been cancelled or moved. Refreshing the grid."                      | no (refresh) |
| `unknown` / non-`ApiClientError`   | "That didn't go through. Try again — if it keeps happening, tell your manager."                            | yes          |

For load failures the same sentence follows the surface title with "try again in a moment" (no "nothing was changed", since nothing was attempted).

### Surface titles (what did not happen)

| Surface / action              | Title                                          |
| ----------------------------- | ---------------------------------------------- |
| Walk-in dialog                | "Walk-in not seated."                          |
| Seat Guest                    | "Guest not seated."                            |
| Cancel dialog                 | "Reservation not cancelled."                   |
| Edit drawer                   | "Changes not saved."                           |
| Table status                  | "Table status not changed."                    |
| Timeline load                 | "Couldn't load tonight's reservations."        |
| Timeline load, nothing loaded | "Couldn't load tonight."                       |
| Briefing load                 | "Couldn't load tonight's briefing."            |
| Reservations load             | "Couldn't load reservations."                  |
| Waitlist add / seat / notify  | "Not added." / "Not seated." / "Not notified." |

### `role=status` sentences (one per mutation, polite, once)

| Mutation        | Sentence                                                                               | Focus after                        |
| --------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| Walk-in         | "Seated Smith, party of 2, at Table 3." / "Seated a walk-in, party of 2, at Table 3."  | new block                          |
| Seat Guest      | "Seated Priya Shah at Table 4."                                                        | her block (opener unmounted)       |
| Cancel          | "Cancelled Priya Shah's reservation." / "Cancelled the reservation."                   | her block (opener unmounted)       |
| Edit            | "Saved changes to Priya Shah's reservation."                                           | Edit reservation (opener)          |
| Table status    | "Table 3 is now dirty."                                                                | the status trigger (opener)        |
| Waitlist add    | "Added Jordan Lee, party of 3, to the waitlist."                                       | Guest name field (exception)       |
| Waitlist seat   | "Seated Jordan Lee at Table 2."                                                        | next entry card, else list heading |
| Waitlist notify | "Notified Jordan Lee."                                                                 | Notify (opener)                    |
| Waitlist cancel | "Removed Jordan Lee from the waitlist."                                                | next entry card, else list heading |
| Retry (load)    | "Tonight's grid loaded — 12 reservations." / "Reservations for Tuesday, Sep 3 loaded." | page heading                       |

Failures are announced once by the `Alert` (role=alert) as "title detail"; focus stays on the control that was pressed, except validation → first invalid field.

## Conventions to match

- Rialto components only: `Alert`, `EmptyState`, `Skeleton`/`SkeletonGroup`, `SegmentedControl`, `DropdownMenu`, `Drawer`, `Tag`, `Badge`, `StatusLED`, `Stat`, `Toast`, `Collapsible`, `IconButton`, `Button`. No raw `<button>`/`<select>`; `ReservationBlock` keeps its existing lint-excepted native button.
- Tokens only; gold (`--rialto-accent`) for the now-line, focus ring, selected block, in-flight trigger — never on a tag or a diet label. Warning amber stays distinct from gold. Dark-first; both themes.
- `useMotionPreset()` / reduced motion: scroll-to-now and sheet open are instant under `prefers-reduced-motion`.
- Reuse: `ErrorRetryBanner` (nine pages) for the load banners; `GuestCard` segment/allergy rules; shared `formatTime`; `STATUS_LABEL`; cancel dialog wording ("Keep reservation" / "Cancel reservation") unchanged; walk-in defaults (party 2, smallest fit) unchanged.
- Dialogs keep `role=dialog`, `aria-modal`, labelledby, trap, Escape; one `aria-live` region per page for results.
- 44×44 on every control this run touches at 1024×768; keyboard parity for the menu (Arrow/Enter/Escape) and the sheet (Escape closes, focus returns to the block).

## Story reachability check

| Story | Reached by                   | Screen(s)  |
| ----- | ---------------------------- | ---------- |
| 1     | Flow 1 step 2                | 2          |
| 2     | Flow 1 step 1                | 1          |
| 3     | Flow 1 step 4                | 3, 7       |
| 4     | Flow 1 step 6                | 5          |
| 5     | Flow 1 steps 2, 5            | 2, 4       |
| 6     | Flow 1 step 5                | 4          |
| 7     | Flow 5 steps 1–3             | 3, 10      |
| 8     | Flow 4 step 1                | 7          |
| 9     | Flow 1 steps 7–8             | 6          |
| 10    | Flow 4 step 2                | 7          |
| 11    | Flow 1 step 1                | 1          |
| 12    | Flow 3; Flow 1 steps 5–7     | 4, 5, 6, 9 |
| 13    | Flow 2 steps 2–3             | 8          |
| 14    | Flow 1 step 4; Flow 2 step 2 | 3, 7, 8    |

All 14 reachable; each screen's **Check** line names the stories and lens words it was tested against.

## Deliberately not designed

- Venue vs browser timezone; where `describeApiError` lives; sequencing against #4967/#4944; the E2E mock's UTC-day bug — parked for Architect as the PRD parked them.
- The "● Live" indicator's truthfulness during an SSE outage — observed, not in the 14 stories; backlog.
- Reverse table transitions (a real Undo) — needs an API change; the menu design does not depend on it.
- A persisted seated state — the derived mark is deliberately UI-only.
- Walk-in dialog ignoring OCCUPIED/DIRTY tables in its default pick — noted by the audit, not measured; not changed here.
- Desktop control sizes, floor-plan and booking-widget surfaces, and every copy site outside the fourteen stories.
