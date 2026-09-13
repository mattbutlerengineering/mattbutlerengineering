---
stage: ux-design
run: feature:venue-onboarding-floor-plan
date: 2026-08-30
assumptions:
  - "Sketches are unconfirmed: no live interview was possible, so every screen is grounded in the code read on 2026-08-30 (`VenueOnboardingPage`, `useOnboardingWizard`, `onboarding-steps`, `LaunchStep`, `OnboardingLayout`, `FloorPlanCanvas`, `TableShape`, `TableSelectionOverlay`, `AddTableDialog`, `NewFloorPlanDialog`, `floor-plan-geometry`, `FloorPlanEditorPage`, `DashboardLayout`, `useVenueReadiness`) and in `packages/rialto/CLAUDE.md`, rather than in user taste."
  - 'Q1 ruling (landing): `/floor-plans/:id` — the editor for the new plan — for BOTH readiness outcomes. Measured: `OPERATIONAL_ONLY_PATHS` is `["/timeline", "/reservations", "/guests"]` (DashboardLayout.tsx:51) and the `operational` branch only redirects `/setup` and `/`, so `/floor-plans/:id` is bounced in neither state — one landing, no branch, no conditional E2E.'
  - "Q2 ruling (canvas width): the Floor plan step lifts `.wizardContainer`'s `max-width` from 40 rem to 64 rem for that step only, and table editing turns on at >= 1024 px rather than the layout's own 768 px. The preview-only band is therefore 0-1023 px, a strict superset of M13's `< 768 px`. Arithmetic in Screens S4."
  - "Q4 ruling (template layouts): the four layouts below — their zones, counts, names, capacities and coordinates — are this stage's invention. `IMPROVEMENT-BACKLOG.md` § 13 is one sentence and nothing else in the repo describes a template."
  - "Q6 ruling (Launch instrument): a four-row `StatusLED` stage panel joined by a machined groove, not `Handshake`. Measured reason in Screens S7."
  - "Q7 ruling (plan name): a fixed default per template, shown but not editable in the wizard. No name field, no validation, no new error state."
  - "Next is disabled on the Floor plan step until one of the five layouts is chosen, and Blank is an explicit, labelled choice. The user's decision was 'no skip-for-now path'; the mechanism that makes the step part of the flow rather than a skip with extra steps is this stage's."
  - "Changing template after the draft has been edited is guarded by a `ConfirmDialog` (the pattern `FloorPlanEditorPage.tsx:382-393` already uses), not by undo — M2 left the mechanism to UX and undo/redo is out of scope."
  - "Removing a draft table has no confirmation, unlike the editor's `window.confirm` (`FloorPlanEditorPage.tsx:134`): the editor's delete is an irreversible server DELETE, a draft removal is not. A polite live-region announcement replaces the dialog."
  - "Arrow-nudge and Delete/Backspace are scoped to the canvas region, not bound on `window` as the editor does (`FloorPlanEditorPage.tsx:196`). A wizard step cannot swallow arrow keys globally — the picker, the `Select`s on earlier steps and the rail all need them."
  - 'Template previews are inline SVG at `viewBox="0 0 800 600"`, not a Konva `Stage`. Consequence, deliberate: SVG consumes `var(--rialto-*)` directly, so the previews fall outside M12''s Konva-fill clause — no `getComputedStyle` resolution, no `MutationObserver`, no theme-keyed fallback table, no drift-guard test.'
  - 'Copy: `Launch Venue` keeps its Title Case (E2E contract, `onboarding.spec.ts:157` / `venue-journey.spec.ts:81`); every new button is sentence case. The celebration line changes from "You''re ready to take reservations", which is itself a test-contract change — listed under Downstream contract changes, not assumed away.'
  - 'The canvas is not mounted while the draft holds zero tables; the step shows its own placeholder instead. Consequence, deliberate: `FloorPlanCanvas`''s built-in empty state ("Add tables from the sidebar", `FloorPlanCanvas.tsx:178-185`) — whose copy is wrong in a wizard with no sidebar — never renders here, and the shared component is untouched.'
  - "The celebration holds until the new venue is actually selected, extending today's fixed 1300 ms / 400 ms timer (`LaunchStep.tsx:22-23`). Navigating before `setVenueId` lands would meet `DashboardLayout`'s `no-venue` render-time gate and bounce the manager back to `/onboarding`."
  - "Once the venue exists, steps 1-4 lock (rail entries render completed and stop being clickable, Back stops before step 5) while step 5 stays reachable. Four of the five inputs are already persisted; the draft is the only thing a retry can still act on."
  - "Column arithmetic in S4 is computed from the CSS (`OnboardingLayout.module.css:45` brand `minmax(20rem, 28rem)`, `:58` content padding `--rialto-space-2xl` = 48 px, `--rialto-card-padding` = `--rialto-space-lg` = 24 px), not observed in a running browser."
surfaced:
  - "Evidence label (inherited, fixed by the user, never upgraded): documented spec gap only, n = 0 user reports. Nothing below is evidence that a manager wants these layouts — only that the repo documents a gap where a layout should be."
  - "Template contents have no source and no validation. § 13 is one sentence; the zones, names and covers below were invented at this stage and shown to nobody. Whether a restaurant manager recognises 'W1 / T1 / R1 / B1' or wants 14 tables at 48 covers is unanswered and has no default."
  - "No rename control for a floor plan exists anywhere in the app: `FloorPlanEditorPage.tsx:258` renders `{floorPlan.name}` as a `Heading` and `FloorPlansPage.tsx` has no rename affordance (0 matches for rename/editName). The fixed per-template plan name (Q7) is therefore permanent for the life of the plan. Whether that warrants a name field in the step, or a rename control in the editor (out of scope), is a human call with no default."
  - "The >= 1024 px editing threshold is computed from the CSS, not measured in a browser at any width. No live probe was run against the deployed wizard at this stage. A real device check could move it either way."
  - "`TableShape`'s drag-shadow tween (`groupRef.current.to({ shadowBlur, duration: 0.1 })`, TableShape.tsx:132-140) is not gated on `prefers-reduced-motion`. Pre-existing and shared with the editor. M11 governs new animation only; whether this run fixes it has no default."
  - "Nothing in the repo exercises a real Konva drag. The unit suite mocks `react-konva` (`FloorPlanCanvas.test.tsx:10`) and E2E must not drive the canvas (M4, M15), so the wizard's drag/snap path will ship with the same coverage shape the editor's has — reducer-level only. Whether a manual or visual check is required before Ship has no default; Verify."
  - "api-client floor-plan paths (inherited external dependency): the activate path fix was uncommitted working-tree edits at PRD time with no PR number. The landing screen (S9) assumes the editor's Active badge, which only renders because Launch activated the plan — it does not depend on the client's `setActive` path being right, but the Launch sequence's fourth stage does."
---

# UX: Floor plan inside the new-venue wizard

Scope: the new **Floor plan** step (step 5 of 6), the five layout templates,
the Launch sequence and its instrument, the failure and resume states, the
landing, and every string any of them shows. It does not design the draft
model (Q5), the Launch call shape (Q3), lazy-loading (Q9) or issue sequencing
(Q8) — those are Architect's and Decompose's.

Two rules run through every screen:

1. **The manager never sees a number the canvas does not agree with.** The
   template previews, the review card and the canvas all read the same
   geometry — `CANVAS_WIDTH` 800, `CANVAS_HEIGHT` 600, `GRID_SIZE` 20,
   `SHAPE_DEFAULTS` (`floor-plan-geometry.ts:15-28`). There is no second
   source and no picture that is not the layout.
2. **The Launch sequence is a pipeline with memory.** Every stage keeps its
   own state — pending, in flight, done, failed — so that after a failure the
   manager can see, without being told, exactly where it stopped and what
   Retry will do.

## Flows

Actors, from the PRD: **First-venue manager** (zero memberships, forced into
`/onboarding` by the no-venue gate), **Multi-venue manager** (an admin adding
another venue), **Maintainer** (no UI of their own).

### Flow 1 — First venue, a template, straight through (happy path)

1. Manager completes Welcome, Location, Hours, Settings as today. Settings'
   **Use recommended settings** (or **Next**) advances to step 5.
2. **S1 Floor plan, nothing chosen.** Five layout cards; the canvas area is a
   placeholder. **Next** is disabled.
3. Picks **Restaurant** → **S2 Floor plan, layout applied**: the card is
   selected (gold), 14 tables appear on the real canvas, the live region
   announces "Restaurant layout applied — 14 tables". Next is enabled.
4. Drags T5 two cells left; it snaps to the 20 px grid on drop. Presses
   **Add table**, fills the dialog (**S3**), and the new table lands at the
   canvas centre, selected. Selects W2 and presses **Remove table**.
5. **Next** → **S5 Launch review**, now with a fifth card: Floor Plan —
   Restaurant, Main Dining Room, 14 tables · 48 seats.
6. **Launch Venue** → **S6 Launch in flight**: the review collapses to one
   line and the stage panel takes its place. Venue → Floor plan → Tables
   (1 of 14 … 14 of 14) → Activate, each lighting in turn.
7. All four settle → **S8 celebration**: "Your venue is live with 14 tables",
   held until the new venue is actually selected.
8. **S9 landing**: `/floor-plans/{newPlanId}` — the editor, plan name in the
   header with the **Active** badge, the manager's own tables on the canvas.
   A success toast confirms it. No further click, no bounce.

### Flow 2 — Blank floor (the floor of the flow)

1. Steps 1-4 as above; step 5 shows **S1**.
2. Picks **Blank** — a deliberate, labelled choice, not an omission. The
   canvas area shows the empty-floor placeholder; **Add table** is available;
   Next is enabled.
3. Manager presses Next without adding anything. **S5** review reads
   "Floor Plan — Blank — No tables — your Timeline stays empty until you add
   some."
4. **Launch Venue** → **S6**, with the **Tables stage absent entirely** (not
   shown at 0 of 0): Venue → Floor plan → Activate.
5. **S8**: "Your venue is live — add tables next".
6. **S9**: the same editor at `/floor-plans/{newPlanId}`, plan Active, canvas
   empty, "+ Add Table" one click away. Readiness is `setup`, which bounces
   `/timeline` — and lands on none of it, because `/floor-plans/:id` is not
   an operational-only path.

### Flow 3 — On a phone, or on a narrow desktop (< 1024 px)

1. Steps 1-4 as today (the layout is already single-column below 768 px).
2. **S4 Floor plan, preview only.** The five cards stack; choosing one shows
   the same SVG preview at full card width instead of the canvas, with the
   note "Arranging tables needs a wider screen. Your layout is saved — open
   it on a desktop to move things around." No canvas, no drag, no
   **Add table**.
3. **Next**, **S5**, **Launch Venue**, **S6**, **S8**, **S9** all behave
   exactly as Flow 1. The phone never blocks the manager from finishing, and
   the venue it produces is a real one with a real layout.

### Flow 4 — A stage fails after the venue exists

1. Flow 1 through step 6. The **Tables** stage fails at table 7 of 14
   (network drop, 429, 5xx).
2. **S7 Launch failed in place.** Venue and Floor plan hold their green;
   Tables goes red and reads "Stopped at table 7 of 14"; Activate stays dark.
   The Launch button is gone. An `ErrorRetryBanner` carries the server's own
   message, above it: "Your venue is saved. Retry picks up at Tables."
3. **Retry** → the panel returns to flight at Tables, resuming at 7. `POST
/api/v1/venues` is never called again — structurally, because the Launch
   button never becomes pressable after it is first pressed.
4. Sequence completes → **S8** → **S9**, unchanged.
5. Alternative: the manager presses **Back** instead. Steps 1-4 are locked
   (their rail entries show completed and no longer respond); step 5 is
   reachable, so a table can still be renamed or removed before returning to
   Launch. The stage panel is still there, still showing Venue done — it is
   the record of where the sequence stands, not a transient.
6. Alternative: the manager abandons the wizard entirely. The venue exists
   with no plan, so `useVenueReadiness` reports `setup`, `/setup` renders the
   "Create Floor Plan" card, and nothing is stranded. Unchanged fallback.

### Flow 5 — A multi-venue manager adds their second venue

Identical to Flow 1 except at step 8: the landing is
`/floor-plans/{newPlanId}` for the **new** venue, which requires the venue
list to be refetched and `setVenueId(newId)` to have landed before the
navigation. Landing early meets `DashboardLayout`'s `no-venue` render-time
gate (`isNoVenueRedirectGate`, `DashboardLayout.tsx:84-86`) and bounces the
manager back to `/onboarding` — a redirect loop, not a landing. The
celebration holds the beat that makes this safe.

### Flow 6 — Second thoughts about the template

1. Manager has Restaurant applied and has moved two tables.
2. Picks **Cafe** → **ConfirmDialog**: "Replace your layout? — You've changed
   this floor plan. Choosing Cafe replaces your tables with the Cafe layout."
   **Replace layout** (destructive) / **Keep mine**.
3. **Keep mine** → nothing changes, Restaurant stays selected.
4. **Replace layout** → the draft becomes the Cafe layout; the live region
   announces "Cafe layout applied — 10 tables".
5. If the draft is _pristine_ (untouched since the template was applied) the
   dialog never appears — there is nothing to lose.

## The template set

Five choices. Every non-blank template is generated from **zones**, and the
zone rule is the whole specification — Implement encodes the zones, not 44
hand-written coordinates:

> A zone is `{ prefix, shape, capacity, minCovers, origin: {x, y}, cols,
rows, pitchX, pitchY }`. The table at row _r_, column _c_ is named
> `` `${prefix}${r * cols + c + 1}` `` and centred at
> `(origin.x + c * pitchX, origin.y + r * pitchY)`. Its `width`/`height` are
> `SHAPE_DEFAULTS[shape]` verbatim.
>
> Zone invariants, which make M3 true by construction:
> `pitchX >= SHAPE_DEFAULTS[shape].width + GRID_SIZE`;
> `pitchY >= SHAPE_DEFAULTS[shape].height + GRID_SIZE`; every origin and
> pitch is a multiple of `GRID_SIZE`; zone bounding boxes never intersect.

`x` and `y` are **centres** — `TableShape` offsets every shape by half its
size (`TableShape.tsx:160-176`) and `Circle` is centred on its origin — so a
table's box is `[x - w/2, x + w/2] x [y - h/2, y + h/2]`. Every box below
lies inside 0..800 x 0..600 with room to spare.

### Restaurant — plan "Main Dining Room" — 14 tables, 48 seats

Summary line: `14 tables · 48 seats`
Zone line: `4 window 2-tops · 6 four-tops · 2 round 6-tops · 2 bar seats`

| Zone   | prefix | shape     | cap | min | origin     | cols x rows | pitchX | pitchY |
| ------ | ------ | --------- | --- | --- | ---------- | ----------- | ------ | ------ |
| Window | `W`    | square    | 2   | 1   | (100, 80)  | 4 x 1       | 120    | —      |
| Main   | `T`    | rectangle | 4   | 2   | (120, 220) | 3 x 2       | 160    | 140    |
| Rounds | `R`    | circle    | 6   | 4   | (660, 220) | 1 x 2       | —      | 140    |
| Bar    | `B`    | square    | 2   | 1   | (120, 500) | 2 x 1       | 120    | —      |

Derived: W1 (100,80) W2 (220,80) W3 (340,80) W4 (460,80) · T1 (120,220)
T2 (280,220) T3 (440,220) T4 (120,360) T5 (280,360) T6 (440,360) ·
R1 (660,220) R2 (660,360) · B1 (120,500) B2 (240,500).

### Cafe — plan "Main Floor" — 10 tables, 24 seats

Summary: `10 tables · 24 seats` — Zones: `5 window 2-tops · 3 café rounds · 2 four-tops`

| Zone     | prefix | shape     | cap | min | origin     | cols x rows | pitchX |
| -------- | ------ | --------- | --- | --- | ---------- | ----------- | ------ |
| Window   | `W`    | square    | 2   | 1   | (100, 80)  | 5 x 1       | 120    |
| Rounds   | `C`    | circle    | 2   | 1   | (140, 260) | 3 x 1       | 140    |
| Communal | `L`    | rectangle | 4   | 2   | (200, 440) | 2 x 1       | 120    |

### Bar — plan "Bar Floor" — 12 tables, 40 seats

Summary: `12 tables · 40 seats` — Zones: `6 high-tops · 4 standing rounds · 2 booths`

| Zone     | prefix | shape     | cap | min | origin     | cols x rows | pitchX |
| -------- | ------ | --------- | --- | --- | ---------- | ----------- | ------ |
| Rail     | `H`    | square    | 2   | 1   | (100, 80)  | 6 x 1       | 120    |
| Standing | `S`    | circle    | 4   | 2   | (140, 260) | 4 x 1       | 140    |
| Booths   | `B`    | rectangle | 6   | 3   | (160, 440) | 2 x 1       | 140    |

### Patio — plan "Patio" — 8 tables, 36 seats

Summary: `8 tables · 36 seats` — Zones: `6 umbrella rounds · 2 long tables`

| Zone      | prefix | shape     | cap | min | origin     | cols x rows | pitchX | pitchY |
| --------- | ------ | --------- | --- | --- | ---------- | ----------- | ------ | ------ |
| Umbrellas | `P`    | circle    | 4   | 2   | (160, 140) | 3 x 2       | 180    | 160    |
| Rail      | `L`    | rectangle | 6   | 3   | (200, 460) | 2 x 1       | 180    | —      |

### Blank — plan "Main Floor" — 0 tables

Summary: `No tables` — Zones: `Start empty — add tables yourself`.
No zones, no tables. This is the floor of the flow, and it is a choice the
manager makes, never one they fall into.

**Naming.** Two-character names are not decoration: `TableShape` renders the
label in a 40 px-wide `Text` at 14 px (`TableShape.tsx:199-209`), which holds
about five characters. "Table 1" would overflow its own shape. The zone line
on each card is what tells the manager what `W` and `T` mean.

**Uniqueness.** Names are unique within a template, which is what
`@@unique([venueId, name])` needs for a venue whose only plan is this one.
The same prefixes recur across templates, which is harmless — only one
template ever reaches a venue.

## Copy

The one place these strings live. Nothing below is invented at implement
time.

### Step chrome

| Key                                   | String                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| Rail / indicator label                | Floor plan                                                            |
| Rail description                      | Lay out your tables                                                   |
| Step heading (`Text variant="label"`) | Floor Plan                                                            |
| Step caption                          | Start from a layout like yours, then arrange it.                      |
| Picker group `aria-label`             | Floor plan layout                                                     |
| Card `aria-label` (per template)      | `{Template} — {N} tables, {seats} seats` (Blank: `Blank — no tables`) |

### Canvas area

| State                      | Heading                                     | Body                                                                                                      |
| -------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| No layout chosen           | Your floor plan appears here                | Pick a layout above to start arranging tables.                                                            |
| Layout chosen, zero tables | An empty floor                              | Add tables with the button above, or pick a layout to start from one.                                     |
| Below 1024 px              | _(no heading — the preview is the content)_ | Arranging tables needs a wider screen. Your layout is saved — open it on a desktop to move things around. |

### Controls and messages

| Surface                         | String                                                                                               | Role                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Picker                          | Restaurant / Cafe / Bar / Patio / Blank                                                              | the five choices                                                                                                                        |
| Add                             | Add table                                                                                            | opens `AddTableDialog` (the editor's reads "+ Add Table" — sentence case here, matching every other wizard button)                      |
| Selection bar, nothing selected | Select a table to move or remove it.                                                                 | caption, tertiary                                                                                                                       |
| Selection bar, selected         | `{name} · {capacity} seats · {shape}`                                                                | caption                                                                                                                                 |
| Selection bar, selected         | Remove table                                                                                         | secondary button                                                                                                                        |
| Next with nothing chosen        | Choose a layout to continue — pick Blank to start with an empty floor.                               | `role="alert"` under the picker                                                                                                         |
| Duplicate name in the dialog    | A table with this name already exists                                                                | thrown into `AddTableDialog`'s own banner — the **server's** string verbatim (`routes/tables.ts:178-184`) so the two can never disagree |
| Replace confirm                 | Replace your layout?                                                                                 | `ConfirmDialog` title                                                                                                                   |
| Replace confirm                 | You've changed this floor plan. Choosing {Template} replaces your tables with the {Template} layout. | description                                                                                                                             |
| Replace confirm                 | Replace layout / Keep mine                                                                           | confirm (destructive) / cancel                                                                                                          |

### Announcements (visually hidden, `role="status"`, polite)

`{Template} layout applied — {N} tables` · `{name} added` · `{name} removed` ·
`{name} moved to {x}, {y}` (keyboard nudge only — a pointer drag announces
nothing).

### Launch review card

Title **Floor Plan** (Title Case, matching "Basic Information", "Location &
Time", "Operating Hours", "Settings").

| Row    | Value                                                                                                   |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Layout | `{Template}`                                                                                            |
| Name   | `{Plan name}`                                                                                           |
| Tables | `{N} tables · {seats} seats` — or, at N = 0: `No tables — your Timeline stays empty until you add some` |

### Launch stages

Panel `aria-label`: **Launch progress**.

| Stage | Label      | Pending      | In flight                | Done                | Failed                         |
| ----- | ---------- | ------------ | ------------------------ | ------------------- | ------------------------------ |
| 1     | Venue      | —            | Creating {Name}          | {Name} created      | Couldn't create the venue      |
| 2     | Floor plan | —            | Creating {Plan name}     | {Plan name} created | Couldn't create the floor plan |
| 3     | Tables     | {N} to place | Placing table {k} of {N} | {N} tables placed   | Stopped at table {k} of {N}    |
| 4     | Activate   | —            | Making the plan live     | Live                | Couldn't make the plan live    |

Stage 3 is **omitted entirely** when the draft holds no tables — a row
reading "0 of 0" is a stage that never existed.

| Surface                              | String                                                                     |
| ------------------------------------ | -------------------------------------------------------------------------- |
| Resume lead (above the retry banner) | Your venue is saved. Retry picks up at {Stage}.                            |
| Retry button                         | Retry (`ErrorRetryBanner`'s own, unchanged)                                |
| Celebration, N >= 1                  | Your venue is live with {N} tables                                         |
| Celebration, N = 0                   | Your venue is live — add tables next                                       |
| Toast title                          | Venue is live                                                              |
| Toast body, N >= 1                   | "{Name}" is ready with {N} tables on {Plan name}.                          |
| Toast body, N = 0                    | "{Name}" is ready. Add tables to {Plan name} to start taking reservations. |

Neither string says "finish setup" (M10). The N = 0 body names a concrete
next action instead of a vague one, which is the whole difference.

## Screens

### S1 — Floor plan step, nothing chosen (the step's empty state)

```
┌ brand panel ────────┐┌ wizard content ──────────────────────────────────┐
│ Hospitality         ││ ┌ Card ──────────────────────────────────────────┐│
│ Restaurant          ││ │ Floor Plan                          Text label ││
│ management,         ││ │ Start from a layout like yours, then arrange   ││
│ simplified.         ││ │ it.                              caption/sec.  ││
│                     ││ │                                                ││
│ ① Welcome      ✓    ││ │ ┌────────┐┌────────┐┌────────┐┌────────┐┌─────┐││
│ ② Location     ✓    ││ │ │▭ ▭ ▭ ▭ ││▫ ▫ ▫ ▫ ││▪▪▪▪▪▪  ││ ◯ ◯ ◯  ││     │││
│ ③ Hours        ✓    ││ │ │▬▬ ▬▬ ◯ ││ ◯ ◯ ◯  ││◯ ◯ ◯ ◯ ││ ◯ ◯ ◯  ││     │││
│ ④ Settings     ✓    ││ │ │▬▬ ▬▬ ◯ ││ ▬▬ ▬▬  ││ ▬▬ ▬▬  ││ ▬▬  ▬▬ ││     │││
│ ⑤ Floor plan ◀ here ││ │ │Restaur.││ Cafe   ││  Bar   ││ Patio  ││Blank│││
│    Lay out your     ││ │ │14 · 48 ││10 · 24 ││12 · 40 ││8 · 36  ││ none│││
│    tables           ││ │ │4 window││5 window││6 high- ││6 umbr. ││Start│││
│ ⑥ Launch            ││ │ │2-tops ·││2-tops ·││tops ·  ││rounds ·││empty│││
│                     ││ │ │…       ││…       ││…       ││…       ││     │││
│                     ││ │ └────────┘└────────┘└────────┘└────────┘└─────┘│
│                     ││ │                                                ││
│                     ││ │ ┌ placeholder (recessed, dashed) ─────────────┐││
│                     ││ │ │      Your floor plan appears here           │││
│                     ││ │ │   Pick a layout above to start arranging    │││
│                     ││ │ │              tables.                        │││
│                     ││ │ └─────────────────────────────────────────────┘││
│                     ││ │                                                ││
│                     ││ │ [ Back ]                        [ Next ]  ⃠     ││
└─────────────────────┘└─┴────────────────────────────────────────────────┘
```

- Purpose: choose the layout this venue starts from.
- Empty state: **this screen.** No card selected, the placeholder in the
  canvas slot, **Next disabled**. Pressing Next anyway surfaces the inline
  alert "Choose a layout to continue — pick Blank to start with an empty
  floor."
- Loading state: **none.** The step makes no network call. The only wait in
  this flow is Launch.
- Error state: the Next-with-nothing alert above; nothing else on this screen
  can fail.
- Each card is a rialto `Button` carrying `aria-pressed`, inside
  `role="group" aria-label="Floor plan layout"` — the pattern
  `AddTableDialog`'s shape selector already uses (`AddTableDialog.tsx:171-187`).
  Rejected: a `role="radiogroup"` with roving tabindex, which reads better to
  a screen reader but needs either native inputs behind an eslint-disable or
  a new rialto component with a changeset — neither is worth it for five
  buttons.
- Each preview is inline SVG at `viewBox="0 0 800 600"`, one `<rect>` or
  `<circle>` per template table at that table's own coordinates. Shapes fill
  `var(--rialto-border-strong)` on a `var(--rialto-surface-recessed)` ground.
  No labels — at 180 px wide a name is illegible, and the zone line already
  says what the shapes are. Blank previews the bare ground.
- Selected card: `var(--rialto-accent)` border and `--rialto-shadow-focus`.
  Gold appears here and on the primary button, nowhere else on the step.

### S2 — Floor plan step, layout applied (the working state)

```
│ Floor Plan                                                              │
│ Start from a layout like yours, then arrange it.                        │
│                                                                         │
│ [Restaurant ◆] [ Cafe ] [ Bar ] [ Patio ] [ Blank ]     ◆ = selected    │
│                                                                         │
│                                              [ Add table ]              │
│ ┌ FloorPlanCanvas ──────────────────────────────────────────────────┐   │
│ │ Main Dining Room                                            100%  │   │
│ │  ▫W1   ▫W2   ▫W3   ▫W4                                            │   │
│ │                                                                   │   │
│ │  ▬▬T1    ▬▬T2    ▬▬T3            ◯R1                              │   │
│ │                                                                   │   │
│ │  ▬▬T4    ▬▬T5◆   ▬▬T6            ◯R2      ◆ = selected, gold      │   │
│ │                                             stroke                │   │
│ │  ▫B1  ▫B2                                                         │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│ T5 · 4 seats · rectangle                            [ Remove table ]    │
│                                                                         │
│ [ Back ]                                                     [ Next ]   │
```

- Purpose: arrange the layout — move, add, remove.
- The canvas is `FloorPlanCanvas` unforked, with `readOnly` false. It brings
  its own name overlay (the plan name), zoom readout, 20 px grid, snap on
  drop (`FloorPlanCanvas.tsx:94`), selection, and the
  `TableSelectionOverlay` that already gives every table a keyboard-reachable
  `<button>` with `aria-label="Table {name}"` and `aria-pressed`
  (`TableSelectionOverlay.tsx:41-54`). No new keyboard affordance is invented;
  the one that exists is finally used in a place a first-time manager will
  reach.
- Empty state: never reached with a template applied and at least one table;
  with zero tables (Blank, or every table removed) the canvas **unmounts** and
  the "An empty floor" placeholder takes its place. Consequence: the canvas's
  own "Add tables from the sidebar" empty state — wrong here, there is no
  sidebar — never renders, and the shared component is untouched.
- Loading state: none.
- Error state: only inside `AddTableDialog` (S3).
- Selection bar beneath the canvas replaces the editor's whole right sidebar.
  It is one line and one button; the editor's six detail rows are not what a
  manager needs while laying out a floor for the first time.
- Keys, scoped to the canvas region (never `window`): arrow keys nudge the
  selected table one grid cell with the same snap (S1 of the PRD);
  Delete/Backspace removes it; Escape deselects. The guard that skips
  `INPUT`/`TEXTAREA`/`contentEditable` targets (`FloorPlanEditorPage.tsx:161-165`)
  applies here too.
- Adding a table places it at `CANVAS_CENTER` (400, 300) and selects it — the
  same place `AddTableDialog` already puts one (`AddTableDialog.tsx:73-74`).
  It may land on top of an existing table; the manager drags it off. M3's
  no-overlap rule governs **templates**, not the manager's own edits.
- Tab order: the five layout cards → Add table → each table's overlay button
  in draft order → Remove table (when a table is selected) → Back → Next.
  The Konva `<canvas>` itself is not focusable, so there is no trap.

### S3 — Add table (`AddTableDialog`, unchanged)

```
┌ dialog ───────────────────────────────────┐
│ Add Table                              ✕  │
│ ⚠ A table with this name already exists   │  ← only on a duplicate
│ Table Name *  [ Table 1              ]    │
│ Capacity [ 4 ]        Min Covers [ 1 ]    │
│ Shape   [▭ Rectangle][▪ Square][◯ Circle] │
│                      [ Cancel ][Add Table]│
└───────────────────────────────────────────┘
```

- Purpose: name a table and pick its shape. **Byte-identical to the editor's
  dialog** — same fields, same shape selector, same "Add Table" label. The
  `venueId` / `floorPlanId` strings it requires are never shown to anyone,
  so what the step passes before those ids exist is entirely Architect's
  (Q5).
- Error state: its own banner. The wizard rejects a name already in the draft
  by rejecting the promise the dialog awaits (`AddTableDialog.tsx:84-88`)
  with the server's own message — so a duplicate is caught here, at draft
  time, and the Tables stage can never fail on one. No dialog change.
- Loading state: the dialog's own `isSubmitting` ("Adding…"), which resolves
  immediately because nothing leaves the browser.

### S4 — Below 1024 px: pick and preview

```
┌ single column (< 768) or narrow split (768-1023) ─┐
│ Floor Plan                                        │
│ Start from a layout like yours, then arrange it.  │
│ ┌──────────────┐┌──────────────┐                  │
│ │  Restaurant ◆││    Cafe      │                  │
│ │  14 · 48     ││   10 · 24    │   2-up at >=640, │
│ └──────────────┘└──────────────┘   1-up below     │
│ ┌──────────────┐┌──────────────┐                  │
│ │    Bar       ││    Patio     │                  │
│ └──────────────┘└──────────────┘                  │
│ ┌──────────────┐                                  │
│ │    Blank     │                                  │
│ └──────────────┘                                  │
│ ┌ preview (SVG, full width, 4:3) ────────────────┐│
│ │ ▫  ▫  ▫  ▫                                     ││
│ │ ▬▬  ▬▬  ▬▬        ◯                            ││
│ │ ▬▬  ▬▬  ▬▬        ◯                            ││
│ │ ▫ ▫                                            ││
│ └────────────────────────────────────────────────┘│
│ Arranging tables needs a wider screen. Your        │
│ layout is saved — open it on a desktop to move     │
│ things around.                         caption/tert│
│ [ Back ]                              [ Next ]     │
└───────────────────────────────────────────────────┘
```

- Purpose: choose a layout and keep moving. Everything downstream — review,
  Launch, celebration, landing — is identical to the wide screen.
- Empty state / loading state / error state: as S1.
- **Why 1024 and not the layout's 768.** The canvas scales to its container
  (`scale = width / CANVAS_WIDTH`, `FloorPlanCanvas.tsx:71`), and the
  container is the content column, not the viewport. Computed from the CSS —
  brand column capped at 28 rem = 448 px (`OnboardingLayout.module.css:45`),
  content padding 2 x 48 px (`:58`), card padding 2 x 24 px:

  | Viewport | Canvas width                             | Scale             | A 4-top on screen        | Grid cell    |
  | -------- | ---------------------------------------- | ----------------- | ------------------------ | ------------ |
  | 768 px   | ~176 px                                  | 0.22x             | 18 x 13 px               | 4.4 px       |
  | 1024 px  | ~432 px                                  | 0.54x             | 43 x 32 px               | 10.8 px      |
  | 1280 px  | ~592 px (40 rem cap binds)               | 0.74x             | 59 x 44 px               | 14.8 px      |
  | 1440 px  | ~592 px → **848 px** with the cap lifted | 0.74x → **1.06x** | 59 x 44 → **85 x 64 px** | 14.8 → 21 px |

  At 768 px a table is an 18 x 13 px drag target — below WCAG 2.2's 24 x 24
  minimum, and below the point where a 4.4 px grid snap means anything. At
  1024 px it is 43 x 32 px, above the minimum, and the arrow-key nudge is the
  precise alternative. 1024 is where the canvas starts being a tool.

- **Why the 40 rem cap is lifted for this step.** `.wizardContainer`'s
  `max-width: 40rem` (`VenueOnboardingPage.module.css:2`) is right for four
  forms and wrong for a 4:3 canvas: it binds from ~1184 px upward and holds a
  1440 px display to 0.74x. On the Floor plan step only, the cap becomes
  64 rem, which changes nothing below ~1184 px and gives a normal laptop a
  1:1 canvas. The width change is **not animated** — animating a layout
  property is against rialto's motion rules, and the step's content is
  exclusive so nothing else moves with it.

### S5 — Launch review, with the plan (`LaunchStep`, extended)

```
│ Review your venue details — you're ready to take reservations.          │
│ ┌ Basic Information ─┐ ┌ Location & Time ─┐ ┌ Operating Hours ─┐        │
│ │ …unchanged…        │ │ …unchanged…      │ │ …unchanged…      │        │
│ └────────────────────┘ └──────────────────┘ └──────────────────┘        │
│ ┌ Settings ──────────┐ ┌ Floor Plan ─────────────────────────────────┐  │
│ │ …unchanged…        │ │ Layout    Restaurant                        │  │
│ └────────────────────┘ │ Name      Main Dining Room                  │  │
│                        │ Tables    14 tables · 48 seats              │  │
│                        │ ┌ preview (SVG, same as the card) ────────┐ │  │ ← S2 (SHOULD)
│                        │ └─────────────────────────────────────────┘ │  │
│                        └─────────────────────────────────────────────┘  │
│                                                                         │
│                            [ Launch Venue ]                             │
```

- Purpose: confirm, then launch.
- Blank variant: Tables reads "No tables — your Timeline stays empty until
  you add some", and the preview slot shows the empty ground.
- Empty state: n/a — the review always has all five cards.
- Loading state: → S6, which replaces the review.
- Error state: → S7.

### S6 — Launch in flight (the stage panel)

The review collapses to one line; the panel takes the space. Four rows, one
per stage, joined by a vertical machined groove that fills with the success
token behind each settled stage.

```
│ Launching "Bella Vista"                                    caption/sec. │
│                                                                         │
│  ┌ Launch progress ──────────────────────────────────────────────┐      │
│  │ (●)  Venue          Bella Vista created                       │      │
│  │  ║                                                            │      │
│  │ (●)  Floor plan     Main Dining Room created                  │      │
│  │  ║                                                            │      │
│  │ (◉)  Tables         Placing table 7 of 14                     │      │
│  │  │                  ▓▓▓▓▓▓▓▓▓░░░░░░░░░░  50%   ← Progress     │      │
│  │  ┆                                                            │      │
│  │ (○)  Activate       —                                         │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│                        [ ◌  Launch Venue ]   disabled                   │

(●) success LED, groove filled ║   (◉) accent LED, breathing, groove live │
(○) off LED, groove dotted ┆
```

- Purpose: nothing — the manager watches. The one thing they must be able to
  do is _tell where it is_.
- Loading state: this screen **is** the loading state. Each row is
  `StatusLED` (`off` → `accent` + `pulse` → `success`) plus the stage label
  plus its detail line. The Tables row carries a determinate `Progress`
  (`value = created / total`, `showValue`) while it runs; the indeterminate,
  looping `Progress` variant is never used anywhere in this flow.
- Empty state: n/a.
- Error state: → S7.
- Announcements: the panel is one polite live region announcing **one
  sentence per stage transition**. The per-table counter is `aria-hidden` —
  announcing "8 of 14", "9 of 14" twenty times is a flood, not information.
- Reduced motion: the LED breathe is already gated inside rialto
  (`StatusLED.module.css:78` wraps it in `prefers-reduced-motion:
no-preference`); the groove fill is a height transition on
  `--rialto-ease-precision` with `transition: none` under reduce; `Progress`
  animates its fill through `useMotionPreset().precision`
  (`Progress.tsx:61`), a scale change, not a travelling element. Nothing
  travels and nothing loops under reduced motion, and **every stage state is
  still legible** — which is the point of choosing LEDs over a spinner.
- The Launch button stays mounted and disabled for the whole sequence
  (M7's letter). Once pressed it never becomes pressable again — see S7.

**Why this instrument and not `Handshake` (Q6).** `Handshake` is the obvious
candidate and it is measurably the wrong shape here. It renders **one
`state` for the whole track**: with `state="negotiating"` and `lane=2`, only
the two stations flanking the active leg light `accent` and every other
station renders `neutral` (`Handshake.tsx:56-67`). A stage that finished two
steps ago and a stage that has not started are drawn identically. A
handshake is a two-party exchange with no memory; a launch is a pipeline
whose whole value, at the moment it fails, is remembering what already
happened. Second reason: the parallel `auth-handshake-flows` run is claiming
`Handshake` as _the_ auth-exchange instrument across hospitality — reusing it
for resource creation would blur what it means the first week it means
anything. The stage panel composes `StatusLED`, the same primitive
`Handshake` itself composes (`Handshake.tsx:4, 116`), so the two read as one
family without saying the same thing.

Also rejected: `Steps` (no failed state, and M8 needs exactly one stage to be
red); `WatchLoader` (explicitly "no progress semantics"); a single `Progress`
bar (one number cannot say which stage failed); `Odometer` (a table counter
is not a headline metric). None of them needs a new rialto component, so no
`.changeset`.

### S7 — Launch failed, in place

```
│  ┌ Launch progress ──────────────────────────────────────────────┐      │
│  │ (●)  Venue          Bella Vista created                       │      │
│  │  ║                                                            │      │
│  │ (●)  Floor plan     Main Dining Room created                  │      │
│  │  ║                                                            │      │
│  │ (×)  Tables         Stopped at table 7 of 14                  │      │
│  │  ┆                                                            │      │
│  │ (○)  Activate       —                                         │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  Your venue is saved. Retry picks up at Tables.       caption/secondary  │
│  ┌ ErrorRetryBanner (Alert error) ───────────────────────────────┐      │
│  │ ⚠ Too many requests. Please try again shortly.    [ Retry ]   │      │
│  └───────────────────────────────────────────────────────────────┘      │
│                                                                         │
│  (no Launch button)                                                     │
```

- Purpose: understand where it stopped, and continue from there.
- Error state: this screen. Exactly one stage is red; every earlier stage
  keeps its green; every later stage stays dark. The banner carries the
  server's own message (or the stage's fallback from the copy table when
  there is none), and the sentence above it names what Retry will do.
- **The Launch button is gone, permanently.** This is the UX guarantee behind
  M8's hardest requirement: `POST /api/v1/venues` cannot be called twice for
  one Launch because after the first press there is no control that would
  call it. Retry is the only forward action, and it resumes at the first
  incomplete stage.
- Loading state: pressing Retry returns the panel to S6, resuming at the red
  stage (which turns `accent` again).
- Back is enabled and reaches **step 5 only** — steps 1-4 are locked, their
  rail entries rendered completed and no longer clickable, because their data
  is already persisted and editing it would silently do nothing. Step 5 stays
  open because the draft is the one input a retry still consumes.
- If stage 1 itself failed, no venue exists, nothing is locked, and Retry
  runs the whole sequence — the same screen, with Venue red and the lead
  reading "Retry picks up at Venue". (The lead's first sentence is dropped in
  that one case: there is no saved venue to reassure anyone about.)

### S8 — Celebration (`LaunchStep`, copy changed)

```
│                          ┌────────┐                                     │
│                          │   ✓    │   drawn check, existing animation   │
│                          └────────┘                                     │
│              Your venue is live with 14 tables            role=status   │
```

- Purpose: mark the end of the sequence and cover the handoff.
- The animation, its reduced-motion guards and its `role="status"` are
  unchanged (`LaunchStep.module.css:58-100`). Only the sentence changes, and
  it changes because the old one ("You're ready to take reservations") is
  false for a Blank venue.
- **The beat holds until the new venue is actually selected**, not for a
  fixed 1300 ms. Navigating first meets `DashboardLayout`'s `no-venue`
  render-time gate and bounces the manager to `/onboarding` — a loop, not a
  landing. The existing timer becomes the floor of the wait, not the whole
  of it.
- Zero-table variant: "Your venue is live — add tables next".

### S9 — Landing: the editor for the new plan (`FloorPlanEditorPage`, unchanged)

```
┌ Sidebar ──────┐┌───────────────────────────────────────────────────────┐
│ Dashboard     ││ ← Main Dining Room   [Active]   [+ Add Table][ Saved ] │
│ Floor Plans ◀ ││ ┌ FloorPlanCanvas ────────────────────────────────┐   │
│ Setup         ││ │  ▫W1  ▫W2  ▫W3  ▫W4                             │   │
│ …             ││ │  ▬▬T1   ▬▬T2   ▬▬T3        ◯R1                  │   │
│               ││ │  ▬▬T4   ▬▬T5   ▬▬T6        ◯R2                  │   │
│               ││ │  ▫B1 ▫B2                                        │   │
│               ││ └─────────────────────────────────────────────────┘   │
│               ││  Table Details · All Tables (14)          sidebar     │
└───────────────┘└───────────────────────────────────────────────────────┘
        ┌ toast ──────────────────────────────────────────┐
        │ Venue is live                                   │
        │ "Bella Vista" is ready with 14 tables on Main   │
        │ Dining Room.                                    │
        └─────────────────────────────────────────────────┘
```

- Purpose: see the floor you just laid out, in the tool you will keep using.
- **Why the editor and not the Timeline or the dashboard.** (i) It is the
  only surface that shows the tables the manager just placed — the Timeline
  shows a schedule and is empty on day one; the dashboard shows counters that
  are all zero. (ii) It satisfies `USER-FLOWS.md:41`'s own unmet criterion,
  "After venue creation, floor plan editor opens with the new venue's ID",
  word for word. (iii) It is bounced in **neither** readiness state, so the
  Blank venue and the 14-table venue land in the same place — one navigation,
  one E2E assertion, no branch. `/timeline` fails (i) and (iii); `/dashboard`
  fails (i).
- Empty state (Blank venue, zero tables): the editor's own empty canvas plus
  "+ Add Table" in the header — the correct next action, one click away, with
  no detour through `/setup`.
- Loading state: the editor's existing spinner while `useFloorPlan(id)`
  resolves.
- Error state: the editor's existing `ErrorRetryBanner` + "Back to Floor
  Plans".
- The plan is already active, so the header shows the **Active** badge and
  not the "Set as Active" button (`FloorPlanEditorPage.tsx:259-267`). Nothing
  on this page changes for this run.

## Conventions to match

- **Geometry has one source.** Previews, canvas and review all read
  `CANVAS_WIDTH` / `CANVAS_HEIGHT` / `GRID_SIZE` / `SHAPE_DEFAULTS` from
  `floor-plan-geometry.ts`. No template hardcodes a width or a height; every
  size is `SHAPE_DEFAULTS[shape]` verbatim.
- **No second canvas.** `FloorPlanCanvas`, `TableShape`,
  `TableSelectionOverlay` and `AddTableDialog` are used unforked and, with the
  exception of `readOnly`, with the props they already have.
- **Surgical gold.** Gold appears on exactly three things in this whole
  design: the selected layout card, the in-flight stage LED, and the primary
  buttons (Next, Launch Venue). Nowhere else. Success and error use their own
  semantic tokens; the Konva selection stroke is `--rialto-accent` as it
  already is (`TableShape.tsx:29`).
- **Tokens only, logical properties only.** Every new colour is
  `var(--rialto-*)`; no new Konva fill is introduced, so no new
  `getComputedStyle` resolution and no new theme-keyed fallback table (the
  previews are SVG — see assumptions). CSS Modules, `.js` import extensions,
  immutable state, rialto components with no raw `<button>` / `<input>` /
  `<select>` — restated from `apps/hospitality/CLAUDE.md`, not designed here.
- **Motion.** Everything through `useMotionPreset()` or an existing
  reduced-motion guard. `Card`'s hover lift is already guarded inside rialto
  (`Card.module.css:17-21`); `StatusLED`'s breathe is already guarded
  (`StatusLED.module.css:78`); `LaunchStep`'s celebration is already guarded
  (`LaunchStep.module.css:68-72, 96-100`). The only new motion is the stage
  groove fill and the card selection transition, both colour/size transitions
  on `--rialto-ease-precision` with a `reduce` override. No new travelling or
  looping element exists anywhere in this design.
- **Typography.** Step headings `Text variant="label"` and captions
  `Text variant="caption" color="secondary"`, matching steps 2-4
  (`VenueOnboardingPage.tsx:98-100, 113-116, 127-130`). Review card titles
  stay Title Case; every new button is sentence case; `Launch Venue` and
  `+ Add Table` keep their existing casing because tests name them.
- **Responsive breakpoints.**

  | Width       | Layout                                        | Floor plan step                                          |
  | ----------- | --------------------------------------------- | -------------------------------------------------------- |
  | < 640 px    | single column                                 | cards 1-up, preview only                                 |
  | 640-767 px  | single column                                 | cards 2-up, preview only                                 |
  | 768-1023 px | two-column split (existing 768 px breakpoint) | cards 2-3-up, **preview only**                           |
  | >= 1024 px  | two-column split                              | cards up to 5-up, **canvas editable**, wizard cap 64 rem |

  The media-query read follows `TimelineGrid`'s existing `useIsMobile`
  pattern (`TimelineGrid.tsx:35-50`) — a `matchMedia` subscription, not a
  resize listener. The mechanism is Architect's; the breakpoints are not.

- **Keyboard.** Every control is reachable by Tab with rialto's gold focus
  ring. Table selection uses the `TableSelectionOverlay` buttons that already
  exist. Nudge and remove keys are scoped to the canvas region and skip
  `INPUT` / `TEXTAREA` / `contentEditable` targets. The Konva canvas is not
  focusable, so there is no trap.
- **Live regions.** One polite `role="status"` per surface — one on the Floor
  plan step for draft changes, one on the Launch panel for stage transitions,
  and the celebration's existing one. Never per-table, never per-drag.
- **Errors recover in place.** `ErrorRetryBanner` (`Alert variant="error"` +
  a Retry button) is the recovery pattern, as it is on the editor and on
  every other failing surface in this app. Nothing navigates away to explain
  a failure.

## Downstream contract changes

These break by construction and are named here so Architect and Decompose
schedule them rather than discovering them in CI. All four are in the PRD's
scope (M15, M16) — what is new is the exact list.

1. **`e2e/onboarding.spec.ts:123`, "advances through all 5 steps to
   confirmation".** Four `Next` clicks today; five after this change
   (Welcome → Location → Hours → Settings → **Floor plan** → Launch). The
   fifth needs a template picked first, because Next is disabled until one
   is. Assert the five options are visible and that picking one marks it
   selected; never touch the canvas.
2. **`e2e/journeys/venue-journey.spec.ts:81`** — "Step 4 — accept the
   recommended settings" asserts `Launch Venue` is visible immediately after
   "Use recommended settings". That button now sits one step further on. A
   new journey step between 4 and Launch picks a template (DOM only) and
   presses Next; "Step 5 — launch the venue" becomes step 6.
3. **`venue-journey.spec.ts:90-92`** asserts the celebration text
   `"You're ready to take reservations"` inside the page's only
   `role="status"`. The new copy is "Your venue is live with {N} tables". The
   comment above that assertion explains _why_ it is scoped to `role="status"`
   — that reasoning still holds and should survive the edit.
4. **`venue-journey.spec.ts:96-117`, "Dashboard handoff renders for the new
   venue"** — asserts `toHaveURL(/\/dashboard$/)`, the "Dashboard" heading and
   the "Today's Reservations" `Odometer`. The landing is now
   `/floor-plans/{id}`; the assertion becomes the plan name heading and the
   Active badge on the editor. This is the largest of the four.

Not a contract change but adjacent: `ONBOARDING_STEPS` gains
`{ label: "Floor plan", description: "Lay out your tables" }` at index 4, and
`TOTAL_STEPS` becomes 6 — M1 already lists the five unit tests that pin the
old numbers.

## Deliberately not designed

- The draft model, the ids `AddTableDialog` receives before a venue exists,
  and how a draft maps to `CreateTableRequest` (Q5) — Architect. This design
  requires only that the dialog is unchanged and that the ids are never
  shown.
- The Launch call shape (Q3) — 3 + N client calls or one bootstrap route.
  Every screen above holds either way: the stage panel describes _outcomes_,
  and a bootstrap route simply collapses stages 2-4 into one thing that can
  fail, which S7 already draws.
- Lazy-loading the step (Q9), the onboarding chunk budget (S5), whether the
  E2E mocks can serve the create sequence (Q10, gating the PRD's S3).
- Undo/redo, multi-floor, rotation, shapes beyond `SHAPE_DEFAULTS`, custom or
  editable templates, and dragging a table between zones with any meaning
  attached — all out of scope, and the step is designed so none of them is
  missed.
- A plan-name field, and a rename control anywhere (surfaced: none exists
  today).
- Any change to `FloorPlanEditorPage`, `SetupPage`, `FloorPlanCanvas`,
  `TableShape`, `TableSelectionOverlay` or `AddTableDialog`. The one prop this
  design touches on a shared component is `readOnly`, which already exists.
- Fixing `TableShape`'s ungated drag-shadow tween (surfaced) — pre-existing,
  shared with the editor, and not this run's animation.
- Any visual value beyond the component props and tokens named above.
  Colours, radii, shadows and easing belong to the tokens.

## Coverage check

Every PRD user story with a UI surface is reachable through a flow above.

| Story | Actor                          | Reached by                                                                                              |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| 1     | First-venue manager            | Flow 1 steps 2-4 — the layout happens inside the wizard; no sidebar, no second app                      |
| 2     | First-venue manager            | Flow 1 step 3 + the template set — five layouts, live previews from the real geometry                   |
| 3     | First-venue manager            | Flow 4 → S6 and S7 — every stage visible, one stage red, Retry resumes there, the venue never re-posted |
| 4     | First-venue manager            | Flow 1 steps 7-8 → S8 and S9 — new venue selected, its tables on screen, no extra click                 |
| 5     | First-venue manager on a phone | Flow 3 → S4 — pick, preview, Next, Launch; the phone never blocks completion                            |
| 6     | Multi-venue manager            | Flow 5 — the landing is the new venue's plan, and the celebration holds until `setVenueId` lands        |
| 7     | Maintainer                     | No UI. The four spec changes they need are itemised under Downstream contract changes                   |
| 8     | Maintainer                     | No UI. The api-client path fix is an external dependency (surfaced); the Activate stage consumes it     |

PRD MUSTs with a UX surface, and where each is designed: M1 (step chrome,
Downstream), M2 (S1, the template set, Flow 6), M3 (the zone rule), M4 (S2,
S3), M5 (Flow 4 step 5 — the draft survives Back/Next and the rail), M6 (S5),
M7 (S6), M8 (S7), M9 (S8, S9), M10 (Copy), M11 (Conventions — motion), M12
(Conventions — tokens; previews are SVG), M13 (S4), M14 (S2 — tab order and
scoped keys), M15/M16 (Downstream). M17/M18 have no UX surface. SHOULDs: S1
is designed (scoped arrow-nudge), S2 is drawn in S5, S4 is the motion rule;
S3 and S5 have no UX surface.

Next stage: Architect — inputs from here are the five Q-rulings (landing
`/floor-plans/:id`; the 64 rem / 1024 px canvas rule; the four template
layouts as a zone rule; the `StatusLED` stage panel with the measured reason
`Handshake` was rejected; the fixed per-template plan name), the Copy block
as the single source for every string, the four downstream contract changes,
and the six surfaced items.
